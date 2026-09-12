import { describe, expect, it } from "vitest";

import {
  CaseError,
  acknowledgeCase,
  breachedCases,
  caseDedupeKey,
  escalateCase,
  openCase,
  reconcileCases,
  resolveCase,
  type ExceptionCase,
} from "./cases";

const AT = "2026-09-12T00:00:00.000Z";
const LATER = "2026-09-12T01:00:00.000Z";

function mkCase(over: Partial<Parameters<typeof openCase>[0]> = {}): ExceptionCase {
  return openCase({
    id: "case-1",
    organizationId: "org-1",
    type: "RECON_MISMATCH",
    severity: "FATAL",
    summary: "Amount disagreement on ref-1",
    dedupeKey: "org-1:RECON_MISMATCH:ref-1",
    at: AT,
    ...over,
  });
}

describe("exception case lifecycle", () => {
  it("opens unassigned and unresolved", () => {
    const c = mkCase();
    expect(c.state).toBe("OPEN");
    expect(c.assigneeId).toBeNull();
    expect(c.resolution).toBeNull();
    expect(c.history).toEqual([]);
  });

  it("acknowledging assigns the case and records who did it", () => {
    const c = acknowledgeCase(mkCase(), "alice", LATER);
    expect(c.state).toBe("ACKNOWLEDGED");
    expect(c.assigneeId).toBe("alice");
    expect(c.history).toHaveLength(1);
    expect(c.history[0]).toMatchObject({ actorId: "alice", from: "OPEN", to: "ACKNOWLEDGED" });
  });

  it("resolves an acknowledged case with a reason", () => {
    const ack = acknowledgeCase(mkCase(), "alice", LATER);
    const done = resolveCase(ack, { actorId: "alice", at: LATER, resolution: "FIXED", reason: "Provider re-sent the settlement file." });
    expect(done.state).toBe("RESOLVED");
    expect(done.resolution).toBe("FIXED");
    expect(done.history.at(-1)?.note).toContain("Provider re-sent");
  });

  describe("refusals that protect the audit trail", () => {
    it("refuses to resolve a case nobody acknowledged", () => {
      expect(() =>
        resolveCase(mkCase(), { actorId: "alice", at: LATER, resolution: "FIXED", reason: "looks fine" }),
      ).toThrowError(/acknowledge it before resolving/);
    });

    it("refuses to resolve without a written reason", () => {
      const ack = acknowledgeCase(mkCase(), "alice", LATER);
      expect(() => resolveCase(ack, { actorId: "alice", at: LATER, resolution: "FIXED", reason: "   " })).toThrowError(
        /requires a written reason/,
      );
    });

    it("refuses to close a FATAL case as WONT_FIX", () => {
      const ack = acknowledgeCase(mkCase({ severity: "FATAL" }), "alice", LATER);
      try {
        resolveCase(ack, { actorId: "alice", at: LATER, resolution: "WONT_FIX", reason: "not worth it" });
        throw new Error("should have thrown");
      } catch (e) {
        expect((e as CaseError).code).toBe("FATAL_WONT_FIX");
      }
    });

    it("allows WONT_FIX on a WARN case", () => {
      const ack = acknowledgeCase(mkCase({ severity: "WARN" }), "alice", LATER);
      const done = resolveCase(ack, { actorId: "alice", at: LATER, resolution: "WONT_FIX", reason: "known provider lag" });
      expect(done.resolution).toBe("WONT_FIX");
    });

    it("treats RESOLVED as terminal — no revival, no history rewrite", () => {
      const ack = acknowledgeCase(mkCase(), "alice", LATER);
      const done = resolveCase(ack, { actorId: "alice", at: LATER, resolution: "FIXED", reason: "fixed" });
      expect(() => acknowledgeCase(done, "bob", LATER)).toThrowError(/RESOLVED/);
      expect(() => escalateCase(done, "bob", LATER, "it came back")).toThrowError(/RESOLVED/);
    });

    it("rejects an impossible transition", () => {
      // OPEN cannot jump straight to RESOLVED via the generic path.
      const c = mkCase();
      expect(() => escalateCase(c, "alice", LATER, "urgent")).not.toThrow();
      expect(() => acknowledgeCase(escalateCase(c, "alice", LATER, "urgent"), "bob", LATER)).toThrowError(CaseError);
    });

    it("requires a reason to escalate", () => {
      expect(() => escalateCase(mkCase(), "alice", LATER, "")).toThrowError(/requires a reason/);
    });
  });

  it("can escalate straight from OPEN and then resolve", () => {
    const esc = escalateCase(mkCase(), "alice", LATER, "provider outage, finance notified");
    expect(esc.state).toBe("ESCALATED");
    const done = resolveCase(esc, { actorId: "bob", at: LATER, resolution: "FIXED", reason: "provider recovered" });
    expect(done.state).toBe("RESOLVED");
    expect(done.history).toHaveLength(2);
  });
});

describe("deduplication", () => {
  const signal = {
    dedupeKey: "org-1:RECON_MISMATCH:ref-1",
    type: "RECON_MISMATCH" as const,
    severity: "FATAL" as const,
    summary: "mismatch",
    organizationId: "org-1",
  };

  it("creates a case for a new signal", () => {
    const { created, suppressed } = reconcileCases([], [signal], (k) => `case:${k}`, AT);
    expect(created).toHaveLength(1);
    expect(suppressed).toEqual([]);
    expect(created[0].id).toBe("case:org-1:RECON_MISMATCH:ref-1");
  });

  it("does not open a second case while the first is open", () => {
    const existing = mkCase();
    const { created, suppressed } = reconcileCases([existing], [signal], (k) => k, AT);
    expect(created).toEqual([]);
    expect(suppressed).toEqual([signal.dedupeKey]);
  });

  it("collapses a flood of identical signals into one case", () => {
    const flood = Array.from({ length: 500 }, () => signal);
    const { created, suppressed } = reconcileCases([], flood, (k) => k, AT);
    expect(created).toHaveLength(1);
    expect(suppressed).toHaveLength(499);
  });

  it("opens a fresh case once the previous one is resolved", () => {
    const resolved = resolveCase(acknowledgeCase(mkCase(), "alice", LATER), {
      actorId: "alice",
      at: LATER,
      resolution: "FIXED",
      reason: "fixed",
    });
    const { created } = reconcileCases([resolved], [signal], (k) => `new:${k}`, AT);
    expect(created).toHaveLength(1);
  });

  it("builds a stable, tenant-scoped dedupe key", () => {
    expect(caseDedupeKey("PAYOUT_FAILURE", "org-1", "po_9")).toBe("org-1:PAYOUT_FAILURE:po_9");
    // Different tenants with the same subject are different cases.
    expect(caseDedupeKey("PAYOUT_FAILURE", "org-2", "po_9")).not.toBe(caseDedupeKey("PAYOUT_FAILURE", "org-1", "po_9"));
  });
});

describe("SLA breach detection", () => {
  const sla = { FATAL: 30, WARN: 240 };

  it("flags a FATAL case past its response window", () => {
    const c = mkCase({ severity: "FATAL" });
    const breached = breachedCases([c], sla, new Date("2026-09-12T00:31:00.000Z"));
    expect(breached).toHaveLength(1);
  });

  it("does not flag a case still inside its window", () => {
    const c = mkCase({ severity: "FATAL" });
    expect(breachedCases([c], sla, new Date("2026-09-12T00:20:00.000Z"))).toEqual([]);
  });

  it("gives WARN cases a longer window", () => {
    const c = mkCase({ severity: "WARN" });
    expect(breachedCases([c], sla, new Date("2026-09-12T01:00:00.000Z"))).toEqual([]);
  });

  it("never flags a resolved case", () => {
    const done = resolveCase(acknowledgeCase(mkCase(), "alice", AT), {
      actorId: "alice",
      at: AT,
      resolution: "FIXED",
      reason: "fixed",
    });
    expect(breachedCases([done], sla, new Date("2027-01-01T00:00:00.000Z"))).toEqual([]);
  });

  it("still flags an acknowledged-but-unresolved case", () => {
    const ack = acknowledgeCase(mkCase({ severity: "FATAL" }), "alice", AT);
    expect(breachedCases([ack], sla, new Date("2026-09-12T02:00:00.000Z"))).toHaveLength(1);
  });
});
