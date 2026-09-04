import { describe, expect, it } from "vitest";
import {
  canonicalsForProviderStatus,
  isTerminalSuccess,
  projectStatusUpdate,
  ProjectionError,
  type CanonicalStatusMap,
  type ProjectionEvent,
  type ProjectionResource,
} from "./projection";

function rejectsWithCode(fn: () => void, code: string): void {
  try {
    fn();
    expect.unreachable(`expected to throw ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(ProjectionError);
    expect((err as ProjectionError).code).toBe(code);
  }
}

const map: CanonicalStatusMap = {
  terminalFailure: ["FAILED", "CANCELLED"],
  terminalSuccess: ["PAID", "SETTLED", "SUCCEEDED"],
  unknown: ["UNKNOWN"],
};

const resource: ProjectionResource = {
  id: "payment-1",
  organizationId: "org-1",
  canonicalStatus: "PENDING",
  providerStatus: "PENDING",
  version: 2,
  updatedAt: "2026-09-03T00:00:00.000Z",
};

const event = (providerStatus: string, occurredAt = "2026-09-03T00:00:01.000Z"): ProjectionEvent => ({
  eventId: "evt-1",
  provider: "xendit",
  resourceId: "payment-1",
  observedProviderStatus: providerStatus,
  occurredAt,
});

describe("provider->canonical status mapping", () => {
  it("maps terminal success and failure, and unknown conservatively", () => {
    expect(canonicalsForProviderStatus(map, "PAID")).toBe("SUCCEEDED");
    expect(canonicalsForProviderStatus(map, "FAILED")).toBe("FAILED");
    expect(canonicalsForProviderStatus(map, "SOMETHING_NEW")).toBe("UNKNOWN");
  });

  it("never maps an unknown value to success", () => {
    const unknown = canonicalsForProviderStatus({ ...map, unknown: [] }, "WEIRD_FUTURE");
    expect(unknown).toBe("UNKNOWN");
    expect(isTerminalSuccess(unknown)).toBe(false);
  });
});

describe("project status update", () => {
  it("advances a version on an in-order terminal transition", () => {
    const next = projectStatusUpdate({ resource, event: event("PAID"), map, expectedVersion: 2 });
    expect(next.canonicalStatus).toBe("SUCCEEDED");
    expect(next.version).toBe(3);
  });

  it("rejects a stale expected version (optimistic concurrency)", () => {
    rejectsWithCode(() => projectStatusUpdate({ resource, event: event("PAID"), map, expectedVersion: 5 }), "STALE_VERSION");
  });

  it("rejects a terminal regression (out-of-order event)", () => {
    const terminal: ProjectionResource = {
      ...resource,
      canonicalStatus: "SUCCEEDED",
      providerStatus: "PAID",
      version: 3,
    };
    rejectsWithCode(
      () => projectStatusUpdate({ resource: terminal, event: event("CANCELLED"), map, expectedVersion: 3 }),
      "OUT_OF_ORDER",
    );
  });

  it("accepts a same-status terminal event without regressing", () => {
    const terminal: ProjectionResource = {
      ...resource,
      canonicalStatus: "SUCCEEDED",
      providerStatus: "PAID",
      version: 3,
    };
    const next = projectStatusUpdate({
      resource: terminal,
      event: { ...event("SUCCEEDED", "2026-09-03T00:00:02.000Z") },
      map,
      expectedVersion: 3,
    });
    expect(next.canonicalStatus).toBe("SUCCEEDED");
  });

  it("does not project an unknown resource", () => {
    rejectsWithCode(
      () => projectStatusUpdate({ resource: null, event: event("PAID"), map, expectedVersion: 1 }),
      "NOT_FOUND",
    );
  });
});
