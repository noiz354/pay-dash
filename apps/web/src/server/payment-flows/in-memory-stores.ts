import "server-only";

import type { OperationStatus } from "@/domain/payments/operations";
import type { AuditAction, AuditOutcome } from "@/domain/audit/audit";
import type { OperationStore, AuditStore } from "./payment-flow";

/**
 * In-memory dev/test stores for the payment-flow orchestration. The production
 * wiring binds `OperationStore` → `DurableOperation` and `AuditStore` →
 * `AuditEvent` (Prisma). These are used when no durable DB is configured and in
 * unit tests, so the orchestration is runnable in dev without a database.
 */

type StoredOperation = {
  id: string;
  state: OperationStatus;
  idempotencyKey: string;
  requestHash: string;
  organizationId: string;
  connectionId: string;
  actorId: string;
  operationType: string;
  resourceType: string;
  resourceId: string | null;
  amountMinor: string | null;
  currency: string | null;
};

export class InMemoryOperationStore implements OperationStore {
  private readonly db = new Map<string, StoredOperation>();
  private counter = 0;

  async create(input: Parameters<OperationStore["create"]>[0]): Promise<{ id: string; state: OperationStatus; idempotencyKey: string; requestHash: string }> {
    if (this.db.has(input.idempotencyKey)) {
      throw new Error("duplicate idempotency key");
    }
    const op: StoredOperation = {
      id: `op_${++this.counter}`,
      state: "DRAFT",
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      actorId: input.actorId,
      operationType: input.operationType,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      amountMinor: input.amountMinor ?? null,
      currency: input.currency ?? null,
    };
    this.db.set(input.idempotencyKey, op);
    return { id: op.id, state: op.state, idempotencyKey: op.idempotencyKey, requestHash: op.requestHash };
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<{ id: string; state: OperationStatus; requestHash: string } | null> {
    const op = this.db.get(idempotencyKey);
    return op ? { id: op.id, state: op.state, requestHash: op.requestHash } : null;
  }

  async updateState(id: string, _from: OperationStatus, to: OperationStatus): Promise<void> {
    for (const op of this.db.values()) {
      if (op.id === id) {
        op.state = to;
      }
    }
  }
}

export class InMemoryAuditStore implements AuditStore {
  readonly events: Array<{ organizationId: string; actorId: string; action: AuditAction; outcome: AuditOutcome; eventId?: string; metadata: Record<string, unknown> }> = [];

  async append(input: {
    organizationId: string;
    actorId: string;
    action: AuditAction;
    outcome: AuditOutcome;
    eventId?: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    this.events.push({ ...input });
  }
}
