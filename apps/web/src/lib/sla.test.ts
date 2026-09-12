import { describe, expect, it } from "vitest";

import {
  SLA_BANDS,
  SLA_POLICIES,
  SLA_SEVERITY,
  compareSla,
  evaluateSla,
  formatSlaRemaining,
  isOverdueBand,
  slaBandLabel,
  slaPolicyFor,
} from "./sla";

// Wave 4 §3 — SLA / overdue model.
//
// Every assertion pins a band to an explicit `now`, because the whole point of
// the module is that the band comes from a real timestamp arithmetic rather than
// from a hard-coded flag on a record.

const ANCHOR = "2026-09-01T00:00:00.000Z";
const at = (seconds: number) => new Date(new Date(ANCHOR).getTime() + seconds * 1000).toISOString();

const HOUR = 3600;

describe("evaluateSla — payout batch (4h window, critical after 24h total)", () => {
  const policy = slaPolicyFor("payout_batch");

  it("exposes a 4h window and escalates 20h after due", () => {
    expect(policy.dueSeconds).toBe(4 * HOUR);
    expect(policy.criticalAfterSeconds).toBe(20 * HOUR);
    expect(policy.approachingAt).toBe(0.75);
  });

  it("is NORMAL well inside the window", () => {
    const sla = evaluateSla("payout_batch", ANCHOR, { now: at(HOUR) });
    expect(sla?.band).toBe("NORMAL");
    expect(sla?.breached).toBe(false);
    expect(sla?.remainingSeconds).toBe(3 * HOUR);
    expect(sla?.ageSeconds).toBe(HOUR);
  });

  it("becomes APPROACHING at exactly 75% of the window", () => {
    const threshold = policy.dueSeconds * policy.approachingAt; // 3h
    expect(evaluateSla("payout_batch", ANCHOR, { now: at(threshold - 1) })?.band).toBe("NORMAL");
    expect(evaluateSla("payout_batch", ANCHOR, { now: at(threshold) })?.band).toBe("APPROACHING");
    expect(evaluateSla("payout_batch", ANCHOR, { now: at(threshold + 60) })?.band).toBe("APPROACHING");
  });

  it("is OVERDUE the instant the window elapses", () => {
    expect(evaluateSla("payout_batch", ANCHOR, { now: at(policy.dueSeconds - 1) })?.band).toBe("APPROACHING");
    const sla = evaluateSla("payout_batch", ANCHOR, { now: at(policy.dueSeconds) });
    expect(sla?.band).toBe("OVERDUE");
    expect(sla?.breached).toBe(true);
    expect(sla?.remainingSeconds).toBe(0);
  });

  it("escalates to CRITICAL after the escalation threshold", () => {
    const criticalAt = policy.dueSeconds + policy.criticalAfterSeconds; // 24h
    expect(evaluateSla("payout_batch", ANCHOR, { now: at(criticalAt - 1) })?.band).toBe("OVERDUE");
    expect(evaluateSla("payout_batch", ANCHOR, { now: at(criticalAt) })?.band).toBe("CRITICAL");
    expect(evaluateSla("payout_batch", ANCHOR, { now: at(criticalAt + 10 * HOUR) })?.band).toBe("CRITICAL");
  });

  it("reports a negative remaining time once overdue", () => {
    const sla = evaluateSla("payout_batch", ANCHOR, { now: at(policy.dueSeconds + 1800) });
    expect(sla?.remainingSeconds).toBe(-1800);
    expect(sla?.progress).toBeGreaterThan(1);
  });
});

describe("evaluateSla — policy differences are real, not uniform", () => {
  it("failed payouts are the tightest window and KYC the loosest of the two", () => {
    expect(SLA_POLICIES.failed_payout.dueSeconds).toBe(2 * HOUR);
    expect(SLA_POLICIES.kyc_submission.dueSeconds).toBe(24 * HOUR);
    // The same age is CRITICAL for a failed payout and NORMAL for KYC.
    const age = 3 * HOUR;
    expect(evaluateSla("failed_payout", ANCHOR, { now: at(age) })?.band).toBe("OVERDUE");
    expect(evaluateSla("kyc_submission", ANCHOR, { now: at(age) })?.band).toBe("NORMAL");
  });

  it("every entity type has a positive window and a critical escalation", () => {
    for (const [entityType, policy] of Object.entries(SLA_POLICIES)) {
      // `invoice` carries its own dueDate, so its policy window is 0 by design.
      if (entityType === "invoice") {
        expect(policy.dueSeconds).toBe(0);
      } else {
        expect(policy.dueSeconds, entityType).toBeGreaterThan(0);
      }
      expect(policy.criticalAfterSeconds, entityType).toBeGreaterThan(0);
      expect(policy.approachingAt, entityType).toBeGreaterThan(0);
      expect(policy.approachingAt, entityType).toBeLessThan(1);
      expect(policy.commitment, entityType).toBeTruthy();
    }
  });
});

describe("evaluateSla — explicit deadlines (invoices, invites)", () => {
  it("uses the record's own dueDate rather than the policy window", () => {
    const dueAt = at(10 * HOUR);
    // 8h in: 80% of a 10h window -> APPROACHING even though the policy window is 0.
    expect(evaluateSla("invoice", ANCHOR, { now: at(8 * HOUR), explicitDueAt: dueAt })?.band).toBe("APPROACHING");
    // Past the invoice's own due date -> OVERDUE.
    expect(evaluateSla("invoice", ANCHOR, { now: at(11 * HOUR), explicitDueAt: dueAt })?.band).toBe("OVERDUE");
    // 8 days past due exceeds the 7d escalation -> CRITICAL.
    expect(evaluateSla("invoice", ANCHOR, { now: at(10 * HOUR + 8 * 24 * HOUR), explicitDueAt: dueAt })?.band).toBe("CRITICAL");
  });

  it("measures the approaching fraction against the explicit window", () => {
    const sla = evaluateSla("invoice", ANCHOR, { now: at(5 * HOUR), explicitDueAt: at(10 * HOUR) });
    expect(sla?.dueSeconds).toBe(10 * HOUR);
    expect(sla?.progress).toBe(0.5);
  });
});

describe("evaluateSla — bad input degrades honestly", () => {
  it("returns null for a missing or unparseable anchor instead of claiming NORMAL", () => {
    expect(evaluateSla("payout_batch", null)).toBeNull();
    expect(evaluateSla("payout_batch", undefined)).toBeNull();
    expect(evaluateSla("payout_batch", "not-a-date")).toBeNull();
  });

  it("clamps a future anchor to zero age rather than going negative", () => {
    const sla = evaluateSla("payout_batch", at(HOUR), { now: ANCHOR });
    expect(sla?.ageSeconds).toBe(0);
    expect(sla?.band).toBe("NORMAL");
  });

  it("accepts Date, ISO string and epoch-number anchors identically", () => {
    const now = at(5 * HOUR);
    const fromIso = evaluateSla("payout_batch", ANCHOR, { now });
    const fromDate = evaluateSla("payout_batch", new Date(ANCHOR), { now });
    const fromEpoch = evaluateSla("payout_batch", new Date(ANCHOR).getTime(), { now });
    expect(fromDate?.band).toBe(fromIso?.band);
    expect(fromEpoch?.band).toBe(fromIso?.band);
    expect(fromEpoch?.ageSeconds).toBe(fromIso?.ageSeconds);
  });
});

describe("band ordering and helpers", () => {
  it("orders the four bands by severity", () => {
    expect(SLA_BANDS).toEqual(["NORMAL", "APPROACHING", "OVERDUE", "CRITICAL"]);
    expect(SLA_SEVERITY.NORMAL).toBeLessThan(SLA_SEVERITY.APPROACHING);
    expect(SLA_SEVERITY.APPROACHING).toBeLessThan(SLA_SEVERITY.OVERDUE);
    expect(SLA_SEVERITY.OVERDUE).toBeLessThan(SLA_SEVERITY.CRITICAL);
  });

  it("compareSla puts the most urgent first, then the oldest", () => {
    const items = [
      { band: "NORMAL" as const, ageSeconds: 999 },
      { band: "CRITICAL" as const, ageSeconds: 1 },
      { band: "OVERDUE" as const, ageSeconds: 10 },
      { band: "OVERDUE" as const, ageSeconds: 500 },
    ];
    const sorted = [...items].sort(compareSla);
    expect(sorted.map((i) => i.band)).toEqual(["CRITICAL", "OVERDUE", "OVERDUE", "NORMAL"]);
    // Within OVERDUE the older item wins.
    expect(sorted[1].ageSeconds).toBe(500);
  });

  it("isOverdueBand covers exactly the two breached bands", () => {
    expect(isOverdueBand("NORMAL")).toBe(false);
    expect(isOverdueBand("APPROACHING")).toBe(false);
    expect(isOverdueBand("OVERDUE")).toBe(true);
    expect(isOverdueBand("CRITICAL")).toBe(true);
  });

  it("every band has a distinct human label", () => {
    const labels = SLA_BANDS.map(slaBandLabel);
    expect(new Set(labels).size).toBe(SLA_BANDS.length);
    expect(slaBandLabel("CRITICAL")).toBe("Critically overdue");
  });
});

describe("formatSlaRemaining — hydration-safe, locale-independent", () => {
  it.each([
    [30, "30s left"],
    [-30, "30s overdue"],
    [60, "1m left"],
    [3599, "59m left"],
    [3600, "1h left"],
    [-7200, "2h overdue"],
    [86_400, "1d left"],
    [-259_200, "3d overdue"],
  ])("formats %s seconds as %s", (seconds, expected) => {
    expect(formatSlaRemaining(seconds)).toBe(expected);
  });

  it("never uses Intl, so server and client render the same string", () => {
    // A locale-dependent formatter would differ between the server snapshot and
    // the browser, causing a hydration mismatch on every badge.
    expect(formatSlaRemaining(3600)).not.toMatch(/hour|jam/i);
  });
});
