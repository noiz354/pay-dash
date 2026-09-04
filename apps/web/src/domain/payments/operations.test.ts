import { describe, expect, it } from "vitest";
import {
  canTransitionOperation,
  createIdempotencyKey,
  isTerminalOperation,
  newOperationId,
  OPERATION_STATUSES,
  reconcileUnknown,
  requestHash,
  transitionOperation,
  OperationTransitionError,
  type OperationStatus,
} from "./operations";

describe("operation status", () => {
  it("exposes the full status set", () => {
    expect(OPERATION_STATUSES).toContain("DRAFT");
    expect(OPERATION_STATUSES).toContain("UNKNOWN");
    expect(OPERATION_STATUSES).toContain("SUCCEEDED");
  });

  it("enforces a valid transition through the state machine", () => {
    expect(transitionOperation("DRAFT", "PENDING_APPROVAL")).toBe("PENDING_APPROVAL");
    expect(transitionOperation("EXECUTING", "SUCCEEDED")).toBe("SUCCEEDED");
    expect(() => transitionOperation("SUCCEEDED", "EXECUTING")).toThrow(OperationTransitionError);
    expect(canTransitionOperation("SUCCEEDED", "EXECUTING")).toBe(false);
  });

  it("defines terminal statuses", () => {
    expect(isTerminalOperation("SUCCEEDED")).toBe(true);
    expect(isTerminalOperation("FAILED")).toBe(true);
    expect(isTerminalOperation("CANCELLED")).toBe(true);
    expect(isTerminalOperation("EXECUTING")).toBe(false);
    expect(isTerminalOperation("UNKNOWN")).toBe(false);
  });
});

describe("idempotency and request hashing", () => {
  it("derives a stable idempotency key for the same logical operation", () => {
    const logical = { organizationId: "org-1", operationType: "payout.release", resourceType: "recipient", resourceId: "rec-1" };
    const a = createIdempotencyKey(logical);
    const b = createIdempotencyKey(logical);
    expect(a).toBe(b);
  });

  it("changes the key when the logical identity (e.g. recipient) changes", () => {
    const base = { organizationId: "org-1", operationType: "payout.release", resourceType: "recipient" };
    const a = createIdempotencyKey({ ...base, resourceId: "rec-1" });
    const b = createIdempotencyKey({ ...base, resourceId: "rec-2" });
    expect(a).not.toBe(b);
  });

  it("produces a canonical, field-order-independent request hash", () => {
    expect(requestHash({ amount: "100", currency: "IDR", destinations: ["b", "a"] })).toBe(
      requestHash({ destinations: ["b", "a"], currency: "IDR", amount: "100" }),
    );
  });

  it("is sensitive to a change in amount", () => {
    expect(requestHash({ amount: "100", currency: "IDR" })).not.toBe(requestHash({ amount: "101", currency: "IDR" }));
  });
});

describe("unknown-outcome reconciliation", () => {
  it("does not change a non-UNKNOWN operation", () => {
    expect(reconcileUnknown("EXECUTING", { hasProviderReference: true, terminalOutcome: true }, "FAILED")).toBe("EXECUTING");
  });

  it("reconciles to SUCCEEDED when the provider reports a terminal success", () => {
    expect(reconcileUnknown("UNKNOWN", { hasProviderReference: true, terminalOutcome: true }, "SUCCEEDED")).toBe("SUCCEEDED");
  });

  it("reconciles to FAILED on a confirmed terminal failure", () => {
    expect(reconcileUnknown("UNKNOWN", { hasProviderReference: true, terminalOutcome: true }, "FAILED")).toBe("FAILED");
  });

  it("stays EXECUTING when a reference exists but outcome is still unknown", () => {
    expect(reconcileUnknown("UNKNOWN", { hasProviderReference: true, terminalOutcome: false }, "EXECUTING")).toBe("EXECUTING");
  });

  it("stays EXECUTING when nothing has been observed yet", () => {
    expect(reconcileUnknown("UNKNOWN", { hasProviderReference: false, terminalOutcome: false }, "EXECUTING")).toBe("EXECUTING");
  });
});

describe("operation id", () => {
  it("generates unique operation ids", () => {
    expect(newOperationId()).not.toBe(newOperationId());
  });
});

const _statusCheck: OperationStatus = "EXECUTING";
void _statusCheck;
