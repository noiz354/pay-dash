import "server-only";

import type { OperationStatus } from "@/domain/payments/operations";
import type { OperationStore } from "@/server/payment-flows/payment-flow";
import { loadLazyPrisma } from "./prisma-runtime";

/**
 * `OperationStore` bound to the `DurableOperation` table (durable-operations).
 * Intent is persisted before a provider write so a retry re-uses the same
 * idempotency key, advancing the validated state machine. Falls back to an
 * in-memory store in dev/test when Prisma is unavailable; the production wiring
 * uses the durable path once `prisma generate` + a live DB exist.
 */

export type DurableOperationRecord = {
  id: string;
  state: OperationStatus;
  idempotencyKey: string;
  requestHash: string;
};

export interface DurableOperationDb {
  create(input: {
    organizationId: string;
    connectionId: string;
    actorId: string;
    operationType: string;
    resourceType: string;
    resourceId: string | null;
    idempotencyKey: string;
    requestHash: string;
    amountMinor: string | null;
    currency: string | null;
  }): Promise<DurableOperationRecord>;
  findByIdempotencyKey(idempotencyKey: string): Promise<DurableOperationRecord | null>;
  updateState(id: string, state: OperationStatus): Promise<void>;
  available(): boolean;
}

export class PrismaDurableOperationDb implements DurableOperationDb {
  constructor(private readonly prisma: { durableOperation: unknown }) {}

  available(): boolean {
    return true;
  }

  async create(input: {
    organizationId: string;
    connectionId: string;
    actorId: string;
    operationType: string;
    resourceType: string;
    resourceId: string | null;
    idempotencyKey: string;
    requestHash: string;
    amountMinor: string | null;
    currency: string | null;
  }): Promise<DurableOperationRecord> {
    const client = this.prisma.durableOperation as {
      create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>>;
    };
    const row = await client.create({
      data: {
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        actorId: input.actorId,
        operationType: input.operationType,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        amountMinor: input.amountMinor,
        currency: input.currency,
        state: "DRAFT",
        approvalState: "NOT_REQUIRED",
        attemptCount: 0,
        version: 1,
      },
    });
    return mapOperationRow(row as Record<string, unknown>);
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<DurableOperationRecord | null> {
    const client = this.prisma.durableOperation as {
      findUnique(args: { where: { idempotencyKey: string } }): Promise<Record<string, unknown> | null>;
    };
    const row = await client.findUnique({ where: { idempotencyKey } });
    return row ? mapOperationRow(row as Record<string, unknown>) : null;
  }

  async updateState(id: string, state: OperationStatus): Promise<void> {
    const client = this.prisma.durableOperation as {
      update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<Record<string, unknown>>;
    };
    await client.update({ where: { id }, data: { state } });
  }
}

function mapOperationRow(row: Record<string, unknown>): DurableOperationRecord {
  return {
    id: String(row.id),
    state: row.state as OperationStatus,
    idempotencyKey: String(row.idempotencyKey),
    requestHash: String(row.requestHash),
  };
}

export class InMemoryDurableOperationStore implements OperationStore {
  private readonly db = new Map<string, DurableOperationRecord>();
  private counter = 0;

  async create(input: Parameters<OperationStore["create"]>[0]): Promise<{ id: string; state: OperationStatus; idempotencyKey: string; requestHash: string }> {
    if (this.db.has(input.idempotencyKey)) {
      throw new Error("duplicate idempotency key");
    }
    const rec: DurableOperationRecord = {
      id: `op_${++this.counter}`,
      state: "DRAFT",
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
    };
    this.db.set(input.idempotencyKey, rec);
    return { id: rec.id, state: rec.state, idempotencyKey: rec.idempotencyKey, requestHash: rec.requestHash };
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<{ id: string; state: OperationStatus; requestHash: string } | null> {
    const rec = this.db.get(idempotencyKey);
    return rec ? { id: rec.id, state: rec.state, requestHash: rec.requestHash } : null;
  }

  async updateState(id: string, _from: OperationStatus, to: OperationStatus): Promise<void> {
    for (const rec of this.db.values()) {
      if (rec.id === id) {
        rec.state = to;
      }
    }
  }
}

export async function buildOperationStore(input?: { db?: DurableOperationDb }): Promise<OperationStore> {
  if (input?.db) {
    return new DbOperationStoreAdapter(input.db);
  }
  const prisma = await loadLazyPrisma();
  if (prisma) {
    return new DbOperationStoreAdapter(new PrismaDurableOperationDb(prisma));
  }
  return new InMemoryDurableOperationStore();
}

/** Adapt a `DurableOperationDb` to the `OperationStore` used by PaymentFlowService. */
export class DbOperationStoreAdapter implements OperationStore {
  constructor(private readonly db: DurableOperationDb) {}

  create(input: Parameters<OperationStore["create"]>[0]): Promise<{ id: string; state: OperationStatus; idempotencyKey: string; requestHash: string }> {
    return this.db.create({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      actorId: input.actorId,
      operationType: input.operationType,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      amountMinor: input.amountMinor ?? null,
      currency: input.currency ?? null,
    });
  }

  findByIdempotencyKey(idempotencyKey: string): Promise<{ id: string; state: OperationStatus; requestHash: string } | null> {
    return this.db.findByIdempotencyKey(idempotencyKey);
  }

  updateState(id: string, _from: OperationStatus, to: OperationStatus): Promise<void> {
    return this.db.updateState(id, to);
  }
}
