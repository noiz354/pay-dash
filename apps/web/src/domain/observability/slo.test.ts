import { describe, expect, it } from "vitest";

import { SLO_CATALOGUE, errorBudget, releaseGate, sloById, type SliMeasurement } from "./slo";

const WINDOW = { windowStart: "2026-08-13T00:00:00.000Z", windowEnd: "2026-09-12T00:00:00.000Z" };

function m(sloId: SliMeasurement["sloId"], good: number, valid: number): SliMeasurement {
  return { sloId, good, valid, ...WINDOW };
}

describe("SLO catalogue", () => {
  it("defines every SLO with a human-readable user impact", () => {
    for (const slo of SLO_CATALOGUE) {
      expect(slo.userImpact.length).toBeGreaterThan(20);
      expect(slo.validEvents).toBeTruthy();
      expect(slo.goodEvents).toBeTruthy();
      expect(slo.objective).toBeGreaterThan(0.9);
      expect(slo.objective).toBeLessThan(1);
    }
  });

  it("declares the source of each SLI, including where it is not yet instrumented", () => {
    const api = sloById("api-availability");
    // Honesty over optics: an uninstrumented SLI says so in its own definition.
    expect(api.source).toContain("NOT_INSTRUMENTED");
  });

  it("has unique ids", () => {
    const ids = SLO_CATALOGUE.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("throws on an unknown SLO rather than inventing a default", () => {
    // @ts-expect-error deliberately invalid id
    expect(() => sloById("does-not-exist")).toThrowError(/Unknown SLO/);
  });
});

describe("error budget", () => {
  it("reports OK with budget remaining", () => {
    // 99% objective over 1000 events => 10 allowed failures; 2 spent.
    const b = errorBudget(m("payout-success", 998, 1000));
    expect(b.budgetEvents).toBe(10);
    expect(b.spentEvents).toBe(2);
    expect(b.remainingEvents).toBe(8);
    expect(b.severity).toBe("OK");
    expect(b.sli).toBeCloseTo(0.998);
  });

  it("escalates to WARNING at half the budget", () => {
    expect(errorBudget(m("payout-success", 995, 1000)).severity).toBe("WARNING");
  });

  it("escalates to CRITICAL at 90% burn", () => {
    expect(errorBudget(m("payout-success", 991, 1000)).severity).toBe("CRITICAL");
  });

  it("reports EXHAUSTED exactly at the objective boundary", () => {
    const b = errorBudget(m("payout-success", 990, 1000));
    expect(b.spentEvents).toBe(10);
    expect(b.remainingEvents).toBe(0);
    expect(b.severity).toBe("EXHAUSTED");
    expect(b.summary).toContain("Freeze risky changes");
  });

  it("goes negative once breached, so the depth of the breach is visible", () => {
    const b = errorBudget(m("payout-success", 950, 1000));
    expect(b.remainingEvents).toBe(-40);
    expect(b.severity).toBe("EXHAUSTED");
  });

  it("expresses the budget in whole events an operator can act on", () => {
    const b = errorBudget(m("payment-success", 1990, 2000));
    // 0.5% of 2000 = 10 exactly.
    expect(b.budgetEvents).toBe(10);
    expect(Number.isInteger(b.budgetEvents)).toBe(true);
  });

  it("floors a fractional budget rather than rounding it up", () => {
    // 1% of 150 = 1.5 allowed failures -> 1, never 2.
    expect(errorBudget(m("payout-success", 150, 150)).budgetEvents).toBe(1);
  });

  describe("unmeasured is not healthy", () => {
    it("returns NO_DATA, not 100%, when nothing was observed", () => {
      const b = errorBudget(m("api-availability", 0, 0));
      expect(b.severity).toBe("NO_DATA");
      expect(b.sli).toBeNull();
      expect(b.burnedFraction).toBeNull();
      expect(b.summary).toContain("NOT a pass");
    });

    it("a tiny window where the budget rounds to zero still fails on any error", () => {
      // 1% of 10 events floors to 0 allowed failures; one failure is a breach.
      const b = errorBudget(m("payout-success", 9, 10));
      expect(b.budgetEvents).toBe(0);
      expect(b.burnedFraction).toBe(Infinity);
      expect(b.severity).toBe("EXHAUSTED");
    });

    it("a tiny perfect window is OK, not exhausted", () => {
      const b = errorBudget(m("payout-success", 10, 10));
      expect(b.burnedFraction).toBe(0);
      expect(b.severity).toBe("OK");
    });
  });

  describe("input validation", () => {
    it("rejects more good than valid events", () => {
      expect(() => errorBudget(m("payout-success", 11, 10))).toThrowError(/inconsistently/);
    });

    it("rejects negative counts", () => {
      expect(() => errorBudget(m("payout-success", -1, 10))).toThrowError(/Negative/);
    });
  });
});

describe("release gate", () => {
  const ok = errorBudget(m("payout-success", 1000, 1000));
  const exhausted = errorBudget(m("payment-success", 900, 1000));
  const critical = errorBudget(m("webhook-processing", 9991, 10000));
  const noData = errorBudget(m("api-availability", 0, 0));

  it("is READY when every budget is healthy and measured", () => {
    expect(releaseGate([ok]).decision).toBe("READY");
  });

  it("is BLOCKED by an exhausted money-path budget", () => {
    const gate = releaseGate([ok, exhausted]);
    expect(gate.decision).toBe("BLOCKED");
    expect(gate.blocking).toContain("payment-success");
  });

  it("is CONDITIONAL when an SLI is merely unmeasured", () => {
    const gate = releaseGate([ok, noData]);
    expect(gate.decision).toBe("CONDITIONAL");
    expect(gate.unmeasured).toContain("api-availability");
  });

  it("is CONDITIONAL at CRITICAL burn without an outright breach", () => {
    expect(releaseGate([ok, critical]).decision).toBe("CONDITIONAL");
  });

  it("lets a breach outrank an unmeasured indicator", () => {
    const gate = releaseGate([exhausted, noData]);
    expect(gate.decision).toBe("BLOCKED");
    // The unmeasured one is still reported — it is not swallowed by the breach.
    expect(gate.unmeasured).toContain("api-availability");
  });
});
