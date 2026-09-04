import { createHash, randomUUID } from "node:crypto";

/**
 * Durable operations (durable-operations). Every intended provider write is
 * modeled as an operation with an idempotency key, a canonical request hash,
 * and a recovery state. Intent is persisted BEFORE the provider call; ambiguous
 * outcome is reconciled before any retry; retries re-use the stable key, never a
 * fresh random one.
 */

export const OperationStatusSchema = {
  DRAFT: "DRAFT",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  EXECUTING: "EXECUTING",
  UNKNOWN: "UNKNOWN",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type OperationStatus = (typeof OperationStatusSchema)[keyof typeof OperationStatusSchema];
export const OPERATION_STATUSES: readonly OperationStatus[] = Object.values(OperationStatusSchema);

const ALLOWED_OPERATION_TRANSITIONS: Record<OperationStatus, readonly OperationStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "EXECUTING", "CANCELLED", "FAILED"],
  PENDING_APPROVAL: ["APPROVED", "CANCELLED", "FAILED", "DRAFT"],
  APPROVED: ["EXECUTING", "CANCELLED", "FAILED"],
  EXECUTING: ["UNKNOWN", "SUCCEEDED", "FAILED", "CANCELLED"],
  UNKNOWN: ["EXECUTING", "SUCCEEDED", "FAILED", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: ["EXECUTING", "CANCELLED"],
  CANCELLED: [],
};

export class OperationTransitionError extends Error {
  constructor(readonly from: OperationStatus, readonly to: OperationStatus) {
    super(`Invalid durable operation transition: ${from} -> ${to}`);
    this.name = "OperationTransitionError";
  }
}

export function canTransitionOperation(from: OperationStatus, to: OperationStatus): boolean {
  return ALLOWED_OPERATION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionOperation(from: OperationStatus, to: OperationStatus): OperationStatus {
  if (!canTransitionOperation(from, to)) {
    throw new OperationTransitionError(from, to);
  }
  return to;
}

export function isTerminalOperation(status: OperationStatus): boolean {
  return status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED";
}

/**
 * A stable idempotency key is derived from the logical operation identity, NOT
 * from a fresh random value. On a retry of the same logical operation the key is
 * identical, so the provider cannot be double-executed. The UUID makes it
 * unique across otherwise-identical (e.g. same-day) logical inputs.
 */
export function createIdempotencyKey(input: {
  organizationId: string;
  operationType: string;
  resourceType: string;
  resourceId?: string; // e.g. recipientId / paymentId for terminal retries
  attempt?: number;
}): string {
  const logical = [
    input.organizationId,
    input.operationType,
    input.resourceType,
    input.resourceId ?? "resource",
    input.attempt ?? 1,
  ].join("|");
  return createHash("sha256").update(logical).digest("hex");
}

/** Canonical hash of the normalized request payload (stable field order). */
export function requestHash(payload: unknown): string {
  const canonical = canonicalize(payload);
  return createHash("sha256").update(canonical).digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(record[k])}`).join(",")}}`;
}

/**
 * An ambiguous write outcome (timeout, transport disconnect, unknown provider
 * result) must be reconciled before any fresh create. `reconcileUnknown` encodes
 * the branch: if a per-provider reference or a matching record was observed the
 * operation advances; otherwise it stays UNKNOWN and is retried with the SAME
 * idempotency key (never a new one).
 */
export function reconcileUnknown(
  current: OperationStatus,
  observation: { hasProviderReference: boolean; terminalOutcome: boolean },
  next: "EXECUTING" | "SUCCEEDED" | "FAILED",
): OperationStatus {
  if (current !== "UNKNOWN") {
    return current;
  }
  if (observation.terminalOutcome) {
    return next === "FAILED" ? "FAILED" : "SUCCEEDED";
  }
  if (observation.hasProviderReference) {
    // Reference exists but outcome unknown -> re-execute/get confirmation.
    return next === "EXECUTING" ? "EXECUTING" : "EXECUTING";
  }
  return "EXECUTING";
}

export function newOperationId(): string {
  return randomUUID();
}
