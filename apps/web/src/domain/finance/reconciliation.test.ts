import { describe, expect, it } from "vitest";

import { minor } from "./money";
import {
  EXCEPTION_TYPES,
  reconcile,
  reconciliationCleanliness,
  type ExceptionType,
  type ReconRecord,
  type ReconcileInput,
} from "./reconciliation";

const ORG = "org-1";
const WINDOW = { from: "2026-09-01T00:00:00.000Z", to: "2026-09-08T00:00:00.000Z" };
const AT = "2026-09-07T00:00:00.000Z";

function rec(overrides: Partial<ReconRecord> & { externalRef: string }): ReconRecord {
  return {
    organizationId: ORG,
    amount: minor(100_000, "IDR"),
    status: "SUCCEEDED",
    observedAt: AT,
    ...overrides,
  };
}

function run(input: Partial<ReconcileInput> = {}) {
  return reconcile({
    organizationId: ORG,
    window: WINDOW,
    internal: { available: true, records: [] },
    provider: { available: true, records: [] },
    settlement: { available: true, records: [] },
    runId: "run-under-test",
    ...input,
  });
}

function types(r: ReturnType<typeof run>): ExceptionType[] {
  return r.exceptions.map((e) => e.type);
}

describe("three-way reconciliation", () => {
  it("matches a record that all three sides agree on", () => {
    const r = run({
      internal: { available: true, records: [rec({ externalRef: "ref-1" })] },
      provider: { available: true, records: [rec({ externalRef: "ref-1" })] },
      settlement: { available: true, records: [rec({ externalRef: "ref-1" })] },
    });
    expect(r.exceptions).toEqual([]);
    expect(r.matched).toEqual(["ref-1"]);
    expect(r.totals).toEqual({
      recordsCompared: 1,
      matched: 1,
      exceptions: 0,
      byType: Object.fromEntries(EXCEPTION_TYPES.map((t) => [t, 0])),
    });
    expect(r.partial).toBe(false);
  });

  it("empty vs empty vs empty is a clean, zero-record run", () => {
    const r = run();
    expect(r.totals.recordsCompared).toBe(0);
    expect(r.exceptions).toEqual([]);
    expect(reconciliationCleanliness(r)).toBe(1);
  });

  describe("the eight exception types", () => {
    it("MISSING_INTERNAL — provider and bank moved money our ledger never recorded", () => {
      const r = run({
        provider: { available: true, records: [rec({ externalRef: "ghost" })] },
        settlement: { available: true, records: [rec({ externalRef: "ghost" })] },
      });
      expect(types(r)).toContain("MISSING_INTERNAL");
      const e = r.exceptions.find((x) => x.type === "MISSING_INTERNAL")!;
      expect(e.severity).toBe("FATAL");
      expect(e.present).toEqual(["PROVIDER", "SETTLEMENT"]);
    });

    it("MISSING_PROVIDER — we booked it, the provider never heard of it", () => {
      const r = run({
        internal: { available: true, records: [rec({ externalRef: "ref-1" })] },
        settlement: { available: true, records: [rec({ externalRef: "ref-1" })] },
      });
      expect(types(r)).toContain("MISSING_PROVIDER");
    });

    it("MISSING_SETTLEMENT — confirmed everywhere but the money never landed", () => {
      const r = run({
        internal: { available: true, records: [rec({ externalRef: "ref-1" })] },
        provider: { available: true, records: [rec({ externalRef: "ref-1" })] },
      });
      expect(types(r)).toContain("MISSING_SETTLEMENT");
    });

    it("AMOUNT_MISMATCH — detects a one-minor-unit difference", () => {
      const r = run({
        internal: { available: true, records: [rec({ externalRef: "ref-1", amount: minor(100_000, "IDR") })] },
        provider: { available: true, records: [rec({ externalRef: "ref-1", amount: minor(100_001, "IDR") })] },
        settlement: { available: true, records: [rec({ externalRef: "ref-1", amount: minor(100_000, "IDR") })] },
      });
      const e = r.exceptions.filter((x) => x.type === "AMOUNT_MISMATCH");
      // internal↔provider and provider↔settlement both disagree; internal↔settlement agrees.
      expect(e).toHaveLength(2);
      expect(e[0].detail).toMatchObject({ currency: "IDR" });
    });

    it("CURRENCY_MISMATCH — and does not then compare the amounts", () => {
      const r = run({
        internal: { available: true, records: [rec({ externalRef: "ref-1", amount: minor(100, "IDR") })] },
        provider: { available: true, records: [rec({ externalRef: "ref-1", amount: minor(999, "USD") })] },
      });
      expect(types(r)).toContain("CURRENCY_MISMATCH");
      expect(types(r)).not.toContain("AMOUNT_MISMATCH");
    });

    it("STATUS_MISMATCH — two terminal sides disagreeing on the outcome", () => {
      const r = run({
        internal: { available: true, records: [rec({ externalRef: "ref-1", status: "SUCCEEDED" })] },
        provider: { available: true, records: [rec({ externalRef: "ref-1", status: "FAILED" })] },
        settlement: { available: true, records: [rec({ externalRef: "ref-1", status: "SUCCEEDED" })] },
      });
      expect(types(r)).toContain("STATUS_MISMATCH");
    });

    it("does NOT raise STATUS_MISMATCH when one side is merely still pending", () => {
      const r = run({
        internal: { available: true, records: [rec({ externalRef: "ref-1", status: "PENDING" })] },
        provider: { available: true, records: [rec({ externalRef: "ref-1", status: "SUCCEEDED" })] },
        settlement: { available: true, records: [rec({ externalRef: "ref-1", status: "SUCCEEDED" })] },
      });
      expect(types(r)).not.toContain("STATUS_MISMATCH");
    });

    it("DUPLICATE_PROVIDER — the same ref recorded twice on one side", () => {
      const r = run({
        provider: {
          available: true,
          records: [
            rec({ externalRef: "ref-1", note: "pay_a" }),
            rec({ externalRef: "ref-1", note: "pay_b" }),
          ],
        },
        internal: { available: true, records: [rec({ externalRef: "ref-1" })] },
        settlement: { available: true, records: [rec({ externalRef: "ref-1" })] },
      });
      const e = r.exceptions.find((x) => x.type === "DUPLICATE_PROVIDER")!;
      expect(e.severity).toBe("FATAL");
      expect(e.detail).toMatchObject({ first: "pay_a", second: "pay_b" });
    });

    it("reports a duplicate once, not once per extra copy", () => {
      const r = run({
        provider: {
          available: true,
          records: [rec({ externalRef: "d" }), rec({ externalRef: "d" }), rec({ externalRef: "d" })],
        },
      });
      expect(r.exceptions.filter((x) => x.type === "DUPLICATE_PROVIDER")).toHaveLength(1);
    });

    it("STALE_PENDING — pending far past the threshold is a WARN, not a FATAL", () => {
      const r = run({
        internal: {
          available: true,
          records: [rec({ externalRef: "slow", status: "PENDING", observedAt: "2026-09-01T00:00:00.000Z" })],
        },
        provider: {
          available: true,
          records: [rec({ externalRef: "slow", status: "PENDING", observedAt: "2026-09-01T00:00:00.000Z" })],
        },
        settlement: {
          available: true,
          records: [rec({ externalRef: "slow", status: "PENDING", observedAt: "2026-09-01T00:00:00.000Z" })],
        },
        stalePendingAfterHours: 24,
      });
      const e = r.exceptions.find((x) => x.type === "STALE_PENDING")!;
      expect(e.severity).toBe("WARN");
      expect(e.message).toContain("168.0h");
    });

    it("does not flag a recent pending record as stale", () => {
      const r = run({
        internal: {
          available: true,
          records: [rec({ externalRef: "fresh", status: "PENDING", observedAt: "2026-09-07T23:00:00.000Z" })],
        },
        provider: {
          available: true,
          records: [rec({ externalRef: "fresh", status: "PENDING", observedAt: "2026-09-07T23:00:00.000Z" })],
        },
        settlement: {
          available: true,
          records: [rec({ externalRef: "fresh", status: "PENDING", observedAt: "2026-09-07T23:00:00.000Z" })],
        },
      });
      expect(types(r)).not.toContain("STALE_PENDING");
    });

    it("covers every declared exception type across the suite", () => {
      // Guards against adding a type to the vocabulary without a test.
      const covered = new Set<ExceptionType>([
        "MISSING_INTERNAL",
        "MISSING_PROVIDER",
        "MISSING_SETTLEMENT",
        "AMOUNT_MISMATCH",
        "CURRENCY_MISMATCH",
        "STATUS_MISMATCH",
        "DUPLICATE_PROVIDER",
        "STALE_PENDING",
      ]);
      expect([...covered].sort()).toEqual([...EXCEPTION_TYPES].sort());
    });
  });

  describe("an absent side is not an empty side", () => {
    it("an UNAVAILABLE provider produces no MISSING_PROVIDER exceptions at all", () => {
      const r = run({
        internal: { available: true, records: [rec({ externalRef: "a" }), rec({ externalRef: "b" })] },
        provider: { available: false, reason: "no active provider connection" },
        settlement: { available: true, records: [rec({ externalRef: "a" }), rec({ externalRef: "b" })] },
      });
      expect(types(r)).not.toContain("MISSING_PROVIDER");
      expect(r.exceptions).toEqual([]);
      expect(r.partial).toBe(true);
      expect(r.unavailableReasons.PROVIDER).toBe("no active provider connection");
    });

    it("a partial run never reports a cleanliness percentage", () => {
      const r = run({ settlement: { available: false, reason: "bank file not delivered" } });
      expect(reconciliationCleanliness(r)).toBeNull();
    });

    it("still compares the two sides it does have", () => {
      const r = run({
        internal: { available: true, records: [rec({ externalRef: "a", amount: minor(1, "IDR") })] },
        provider: { available: true, records: [rec({ externalRef: "a", amount: minor(2, "IDR") })] },
        settlement: { available: false, reason: "bank file not delivered" },
      });
      expect(types(r)).toEqual(["AMOUNT_MISMATCH"]);
    });
  });

  describe("expected absences are not exceptions", () => {
    it("a failed internal record the provider never created is not a discrepancy", () => {
      const r = run({
        internal: { available: true, records: [rec({ externalRef: "declined", status: "FAILED" })] },
      });
      expect(r.exceptions).toEqual([]);
      expect(r.matched).toEqual(["declined"]);
    });
  });

  describe("tenant safety (INV-T2)", () => {
    it("ignores records belonging to another organization", () => {
      const r = run({
        internal: { available: true, records: [rec({ externalRef: "mine" })] },
        provider: {
          available: true,
          records: [rec({ externalRef: "mine" }), rec({ externalRef: "theirs", organizationId: "org-2" })],
        },
        settlement: { available: true, records: [rec({ externalRef: "mine" })] },
      });
      expect(r.totals.recordsCompared).toBe(1);
      expect(r.matched).toEqual(["mine"]);
      expect(r.exceptions).toEqual([]);
    });

    it("a foreign-tenant record cannot create a phantom exception", () => {
      const r = run({
        provider: { available: true, records: [rec({ externalRef: "theirs", organizationId: "org-2" })] },
      });
      expect(r.totals.recordsCompared).toBe(0);
      expect(r.exceptions).toEqual([]);
    });
  });

  describe("determinism", () => {
    it("produces an identical run for the same input in a different order", () => {
      const a = rec({ externalRef: "a" });
      const b = rec({ externalRef: "b" });
      const forward = run({
        internal: { available: true, records: [a, b] },
        provider: { available: true, records: [a, b] },
        settlement: { available: true, records: [a, b] },
      });
      const reversed = run({
        internal: { available: true, records: [b, a] },
        provider: { available: true, records: [b, a] },
        settlement: { available: true, records: [b, a] },
      });
      expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
    });

    it("sorts the compared references", () => {
      const r = run({
        internal: {
          available: true,
          records: [rec({ externalRef: "z" }), rec({ externalRef: "a" }), rec({ externalRef: "m" })],
        },
        provider: {
          available: true,
          records: [rec({ externalRef: "z" }), rec({ externalRef: "a" }), rec({ externalRef: "m" })],
        },
        settlement: {
          available: true,
          records: [rec({ externalRef: "z" }), rec({ externalRef: "a" }), rec({ externalRef: "m" })],
        },
      });
      expect(r.matched).toEqual(["a", "m", "z"]);
    });
  });

  describe("cleanliness SLI", () => {
    it("is the matched fraction of a complete run", () => {
      const r = run({
        internal: { available: true, records: [rec({ externalRef: "ok" }), rec({ externalRef: "bad" })] },
        provider: {
          available: true,
          records: [rec({ externalRef: "ok" }), rec({ externalRef: "bad", amount: minor(1, "IDR") })],
        },
        settlement: { available: true, records: [rec({ externalRef: "ok" }), rec({ externalRef: "bad" })] },
      });
      expect(reconciliationCleanliness(r)).toBe(0.5);
    });
  });
});
