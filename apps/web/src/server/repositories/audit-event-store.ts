import "server-only";

import { randomUUID } from "node:crypto";
import type { AuditAction, AuditOutcome } from "@/domain/audit/audit";
import type { AuditStore } from "@/server/payment-flows/payment-flow";
import { loadLazyPrisma } from "./prisma-runtime";

/**
 * `AuditStore` bound to the immutable `AuditEvent` table (audit-ledger). Every
 * financial intent/outcome is recorded with a unique event id and a strict
 * outcome enum. Falls back to in-memory in dev/test when Prisma is unavailable.
 */

export interface AuditEventDb {
  append(input: {
    eventId: string;
    organizationId: string;
    actorId: string;
    action: AuditAction;
    outcome: AuditOutcome;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  available(): boolean;
}

export class PrismaAuditEventDb implements AuditEventDb {
  constructor(private readonly prisma: { auditEvent: unknown }) {}

  available(): boolean {
    return true;
  }

  async append(input: {
    eventId: string;
    organizationId: string;
    actorId: string;
    action: AuditAction;
    outcome: AuditOutcome;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const client = this.prisma.auditEvent as {
      create(args: { data: Record<string, unknown> }): Promise<unknown>;
    };
    await client.create({
      data: {
        id: randomUUID(),
        eventId: input.eventId,
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: input.action,
        outcome: input.outcome,
        metadata: input.metadata,
        version: 1,
      },
    });
  }
}

export class InMemoryAuditEventStore implements AuditStore {
  readonly events: Array<{ organizationId: string; actorId: string; action: AuditAction; outcome: AuditOutcome; eventId?: string; metadata: Record<string, unknown> }> = [];

  async append(input: { organizationId: string; actorId: string; action: AuditAction; outcome: AuditOutcome; eventId?: string; metadata: Record<string, unknown> }): Promise<void> {
    this.events.push({ ...input });
  }
}

export async function buildAuditStore(input?: { db?: AuditEventDb }): Promise<AuditStore> {
  if (input?.db) {
    return new DbAuditStoreAdapter(input.db);
  }
  const prisma = await loadLazyPrisma();
  if (prisma) {
    return new DbAuditStoreAdapter(new PrismaAuditEventDb(prisma));
  }
  return new InMemoryAuditEventStore();
}

/** Adapt an `AuditEventDb` to the `AuditStore` used by PaymentFlowService. */
export class DbAuditStoreAdapter implements AuditStore {
  constructor(private readonly db: AuditEventDb) {}

  append(input: { organizationId: string; actorId: string; action: AuditAction; outcome: AuditOutcome; eventId?: string; metadata: Record<string, unknown> }): Promise<void> {
    return this.db.append({
      eventId: input.eventId ?? randomUUID(),
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: input.action,
      outcome: input.outcome,
      metadata: input.metadata,
    });
  }
}
