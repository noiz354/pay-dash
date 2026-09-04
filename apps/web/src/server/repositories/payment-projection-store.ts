import "server-only";

import {
  projectStatusUpdate,
  type CanonicalStatusMap,
  type ProjectionEvent,
  type ProjectionResource,
} from "@/domain/payments/projection";
import { loadLazyPrisma } from "./prisma-runtime";

/**
 * Webhook projection store (event-projection). Turns a verified provider event
 * into a canonical status update on a resource, through the idempotent
 * `projectStatusUpdate` guard (monotonic terminal states, no regression, no
 * fake success). Backed by `CanonicalPayment` in production; in-memory in
 * dev/test. The webhook routes call `projectProviderEvent` after verifying +
 * deduping the delivery.
 *
 * `organizationId` is resolved from the delivery/connection mapping by the
 * caller; the store keys on (organizationId, resourceId) so a resource id can
 * never be projected into the wrong organization.
 */

export interface PaymentProjectionDb {
  findResource(organizationId: string, resourceId: string): Promise<ProjectionResource | null>;
  /** Resolve a canonical resource from a provider resource id (join ProviderPayment). */
  findResourceByProviderRef(provider: string, providerPaymentId: string): Promise<ProjectionResource | null>;
  updateResource(resource: ProjectionResource): Promise<void>;
  available(): boolean;
}

export class PrismaPaymentProjectionDb implements PaymentProjectionDb {
  constructor(private readonly prisma: { canonicalPayment: unknown; providerPayment: unknown }) {}

  available(): boolean {
    return true;
  }

  async findResource(organizationId: string, resourceId: string): Promise<ProjectionResource | null> {
    const client = this.prisma.canonicalPayment as {
      findFirst(args: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
    };
    const row = await client.findFirst({ where: { organizationId, id: resourceId } });
    if (!row) {
      return null;
    }
    return mapCanonicalPayment(row as Record<string, unknown>);
  }

  async findResourceByProviderRef(provider: string, providerPaymentId: string): Promise<ProjectionResource | null> {
    const client = this.prisma.providerPayment as {
      findFirst(args: { where: Record<string, unknown>; include: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
    };
    const row = await client.findFirst({
      where: { providerPaymentId, provider },
      include: { payment: true },
    });
    const payment = (row as { payment?: Record<string, unknown> })?.payment;
    return payment ? mapCanonicalPayment(payment) : null;
  }

  async updateResource(resource: ProjectionResource): Promise<void> {
    const client = this.prisma.canonicalPayment as {
      update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<Record<string, unknown>>;
    };
    await client.update({
      where: { id: resource.id },
      data: {
        canonicalStatus: resource.canonicalStatus,
        version: resource.version,
      },
    });
  }
}

function mapCanonicalPayment(row: Record<string, unknown>): ProjectionResource {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    canonicalStatus: String(row.canonicalStatus ?? "PENDING"),
    providerStatus: row.providerStatus ? String(row.providerStatus) : null,
    version: Number(row.version ?? 1),
    updatedAt: String(row.updatedAt ?? new Date().toISOString()),
  };
}

export class InMemoryPaymentProjectionStore {
  private readonly resources = new Map<string, ProjectionResource>();
  private readonly byProviderRef = new Map<string, string>(); // `${provider}:${ref}` → resource key
  constructor(private readonly db?: PaymentProjectionDb) {}

  async findResource(organizationId: string, resourceId: string): Promise<ProjectionResource | null> {
    if (this.db) {
      return this.db.findResource(organizationId, resourceId);
    }
    return this.resources.get(`${organizationId}:${resourceId}`) ?? null;
  }

  async findResourceByProviderRef(provider: string, providerPaymentId: string): Promise<ProjectionResource | null> {
    if (this.db) {
      return this.db.findResourceByProviderRef(provider, providerPaymentId);
    }
    const key = this.byProviderRef.get(`${provider}:${providerPaymentId}`);
    return key ? (this.resources.get(key) ?? null) : null;
  }

  async updateResource(resource: ProjectionResource): Promise<void> {
    if (this.db) {
      await this.db.updateResource(resource);
      return;
    }
    this.resources.set(`${resource.organizationId}:${resource.id}`, resource);
  }

  seed(resource: ProjectionResource, opts?: { provider?: string; providerPaymentId?: string }): void {
    const key = `${resource.organizationId}:${resource.id}`;
    this.resources.set(key, resource);
    if (opts?.provider && opts.providerPaymentId) {
      this.byProviderRef.set(`${opts.provider}:${opts.providerPaymentId}`, key);
    }
  }

  available(): boolean {
    return this.db?.available() ?? false;
  }
}

export async function buildPaymentProjectionStore(input?: { db?: PaymentProjectionDb }): Promise<InMemoryPaymentProjectionStore> {
  if (input?.db) {
    return new InMemoryPaymentProjectionStore(input.db);
  }
  const prisma = await loadLazyPrisma();
  if (prisma) {
    return new InMemoryPaymentProjectionStore(new PrismaPaymentProjectionDb(prisma));
  }
  return new InMemoryPaymentProjectionStore();
}

/**
 * Apply a verified provider event to a canonical resource through the idempotent
 * guard. Returns the resulting resource, or `null` when the resource is unknown
 * — we never invent a success for an unknown resource. A stale-version or
 * terminal-regression guard violation throws `ProjectionError`.
 */
export async function projectProviderEvent(input: {
  store: InMemoryPaymentProjectionStore;
  organizationId: string;
  event: ProjectionEvent;
  map: CanonicalStatusMap;
  expectedVersion: number;
}): Promise<ProjectionResource | null> {
  const { store, organizationId, event, map, expectedVersion } = input;
  const resource = await store.findResource(organizationId, event.resourceId);
  if (!resource) {
    return null;
  }
  const next = projectStatusUpdate({ resource, event, map, expectedVersion });
  await store.updateResource(next);
  return next;
}
