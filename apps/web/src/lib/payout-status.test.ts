import { describe, expect, it } from "vitest";
import { nextRunForCadence } from "./payout-status";

// Fixed reference points — 2026-09-01 is a Tuesday, 2026-09-04 a Friday.
describe("nextRunForCadence", () => {
  it("is null for a manual schedule", () => {
    expect(nextRunForCadence("manual", "Friday", 1, new Date("2026-09-01T10:00:00Z"))).toBeNull();
  });

  it("daily: today 02:00 UTC when the run has not passed, otherwise tomorrow", () => {
    expect(nextRunForCadence("daily", "Friday", 1, new Date("2026-09-01T01:00:00Z"))).toBe(
      "2026-09-01T02:00:00.000Z"
    );
    expect(nextRunForCadence("daily", "Friday", 1, new Date("2026-09-01T10:00:00Z"))).toBe(
      "2026-09-02T02:00:00.000Z"
    );
  });

  it("weekly: the next occurrence of the configured weekday", () => {
    // Tuesday morning → Friday 2026-09-04
    expect(nextRunForCadence("weekly", "Friday", 1, new Date("2026-09-01T10:00:00Z"))).toBe(
      "2026-09-04T02:00:00.000Z"
    );
    // Friday after the run → the following Friday
    expect(nextRunForCadence("weekly", "Friday", 1, new Date("2026-09-04T10:00:00Z"))).toBe(
      "2026-09-11T02:00:00.000Z"
    );
    // Friday before the run → that same Friday
    expect(nextRunForCadence("weekly", "Friday", 1, new Date("2026-09-04T01:00:00Z"))).toBe(
      "2026-09-04T02:00:00.000Z"
    );
    // Monday is the first entry in WEEKDAYS, not Sunday
    expect(nextRunForCadence("weekly", "Monday", 1, new Date("2026-09-01T10:00:00Z"))).toBe(
      "2026-09-07T02:00:00.000Z"
    );
  });

  it("monthly: the configured day at 02:00 UTC, rolling over into the next month", () => {
    expect(nextRunForCadence("monthly", "Friday", 15, new Date("2026-09-01T10:00:00Z"))).toBe(
      "2026-09-15T02:00:00.000Z"
    );
    expect(nextRunForCadence("monthly", "Friday", 15, new Date("2026-09-15T10:00:00Z"))).toBe(
      "2026-10-15T02:00:00.000Z"
    );
    // December rolls into January
    expect(nextRunForCadence("monthly", "Friday", 28, new Date("2026-12-29T03:00:00Z"))).toBe(
      "2027-01-28T02:00:00.000Z"
    );
  });

  it("clamps the monthly day into 1–28", () => {
    expect(nextRunForCadence("monthly", "Friday", 31, new Date("2026-09-01T10:00:00Z"))).toBe(
      "2026-09-28T02:00:00.000Z"
    );
    // day 0 clamps to 1 — whose 02:00 run has already passed at 10:00, so
    // it rolls into the next month
    expect(nextRunForCadence("monthly", "Friday", 0, new Date("2026-09-01T10:00:00Z"))).toBe(
      "2026-10-01T02:00:00.000Z"
    );
  });
});
