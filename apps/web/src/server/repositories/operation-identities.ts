import "server-only";

import { RepositoryError } from "@/domain/payments/errors";
import {
  canTransitionOperation,
  createIdempotencyKey,
  requestHash,
  transitionOperation,
  type OperationStatus,
} from "@/domain/payments/operations";

/** Durable-operation identity contract (provider-neutral, no Prisma leak). */
export type DurableOperationIdentity = {
  id: string;
  organizationId: string;
  connectionId: string;
  actorId: string;
  operationType: string;
  resourceType: string;
  resourceId: string | null;
  idempotencyKey: string;
  amountMinor: string | null;
  currency: string | null;
  state: OperationStatus;
  version: number;
};

export interface DurableOperationRepository {
  findByOrganization(organizationId: string, operationId: string): Promise<DurableOperationIdentity | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<DurableOperationIdentity | null>;
}

/** Compute a stable idempotency key for a logical write (not a fresh random). */
export function operationIdempotencyKey(input: {
  organizationId: string;
  operationType: string;
  resourceType: string;
  resourceId?: string;
  attempt?: number;
}): string {
  return createIdempotencyKey(input);
}

/** Build the canonical request hash used to detect a payload mismatch on retry. */
export function operationRequestHash(payload: unknown): string {
  return requestHash(payload);
}

/** Advance a durable operation through its validated state machine. */
export function advanceOperationState(from: OperationStatus, to: OperationStatus): OperationStatus {
  return transitionOperation(from, to);
}

/**
 * A retry with the same idempotency key but a different request hash is an
 * internal inconsistency and must be rejected before any provider call.
 */
export function assertOperationHashMatches(expectedHash: string, actualHash: string): void {
  if (expectedHash !== actualHash) {
    throw new RepositoryError("CONFLICT", "Request payload changed for the same idempotency key");
  }
}

export function isOperationTransitionAllowed(from: OperationStatus, to: OperationStatus): boolean {
  return canTransitionOperation(from, to);
}
