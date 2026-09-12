import { describe, expect, it } from "vitest";

import {
  TIMELINE_ACTIONS,
  actionForLabel,
  buildTimeline,
  dedupeTimeline,
  sortTimeline,
  timelineFromPayoutEvents,
  timelineFromTransactionEvents,
  timelineKey,
  type TimelineEntry,
} from "./timeline";

// CMP-009 / spec §17 — the canonical Timeline model.
//
// The bug this module exists to prevent: SCR-006 showed "Refund issued" twice,
// because the seed carried the event *and* the refund mutation appended another.
// The dedupe rule therefore has to be deterministic and shared, not per-render.

function entry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id: "evt_1",
    entityId: "txn_1",
    entityType: "transaction",
    action: "PAYMENT_CREATED",
    actor: "persona_agus",
    timestamp: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("timelineKey — the dedupe identity", () => {
  it("collapses the same logical event recorded with different ISO spellings", () => {
    const a = timelineKey(entry({ timestamp: "2026-08-01T10:00:00.000Z" }));
    const b = timelineKey(entry({ timestamp: "2026-08-01T10:00:00Z" }));
    expect(a).toBe(b);
  });

  it("distinguishes actor, action, entity and instant", () => {
    const base = timelineKey(entry());
    expect(timelineKey(entry({ actor: "persona_hendri" }))).not.toBe(base);
    expect(timelineKey(entry({ action: "PAYMENT_SUCCEEDED" }))).not.toBe(base);
    expect(timelineKey(entry({ entityId: "txn_2" }))).not.toBe(base);
    expect(timelineKey(entry({ timestamp: "2026-08-01T10:00:01.000Z" }))).not.toBe(base);
  });

  it("treats a null actor as system, not as a distinct identity from 'system'", () => {
    expect(timelineKey(entry({ actor: null }))).toBe(timelineKey(entry({ actor: "system" })));
  });

  it("falls back to the raw string for an unparseable timestamp instead of colliding everything", () => {
    const a = timelineKey(entry({ timestamp: "not-a-date" }));
    const b = timelineKey(entry({ timestamp: "also-not-a-date" }));
    expect(a).not.toBe(b);
  });

  it("keeps sub-second differences that cross a second boundary distinct", () => {
    expect(timelineKey(entry({ timestamp: "2026-08-01T10:00:00.900Z" }))).not.toBe(
      timelineKey(entry({ timestamp: "2026-08-01T10:00:01.100Z" })),
    );
  });
});

describe("dedupeTimeline", () => {
  it("removes the seed-plus-mutation duplicate that broke SCR-006", () => {
    const seeded = entry({ id: "evt_seed", action: "REFUND_EXECUTED", timestamp: "2026-08-02T09:00:00.000Z" });
    const appended = entry({ id: "evt_new", action: "REFUND_EXECUTED", timestamp: "2026-08-02T09:00:00.000Z" });
    const out = dedupeTimeline([seeded, appended]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("evt_seed"); // first occurrence wins
  });

  it("keeps two genuine refunds a second apart", () => {
    const a = entry({ id: "evt_a", action: "REFUND_EXECUTED", timestamp: "2026-08-02T09:00:00.000Z" });
    const b = entry({ id: "evt_b", action: "REFUND_EXECUTED", timestamp: "2026-08-02T09:00:01.000Z" });
    expect(dedupeTimeline([a, b])).toHaveLength(2);
  });

  it("keeps the same instant performed by two different actors (dual control)", () => {
    const at = "2026-08-02T09:00:00.000Z";
    const requested = entry({ id: "evt_a", actor: "persona_agus", action: "REFUND_REQUESTED", timestamp: at });
    const approved = entry({ id: "evt_b", actor: "persona_hendri", action: "REFUND_APPROVED", timestamp: at });
    expect(dedupeTimeline([requested, approved])).toHaveLength(2);
  });

  it("does not mutate its input and is idempotent", () => {
    const input = [entry(), entry({ id: "evt_2" })];
    const frozen = [...input];
    const once = dedupeTimeline(input);
    expect(input).toEqual(frozen);
    expect(dedupeTimeline(once)).toEqual(once);
  });
});

describe("sortTimeline", () => {
  it("orders newest first", () => {
    const out = sortTimeline([
      entry({ id: "a", timestamp: "2026-08-01T10:00:00.000Z" }),
      entry({ id: "b", timestamp: "2026-08-03T10:00:00.000Z" }),
      entry({ id: "c", timestamp: "2026-08-02T10:00:00.000Z" }),
    ]);
    expect(out.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks instant ties by id so ordering is stable across renders", () => {
    const at = "2026-08-01T10:00:00.000Z";
    const out = sortTimeline([entry({ id: "z", timestamp: at }), entry({ id: "a", timestamp: at })]);
    expect(out.map((e) => e.id)).toEqual(["a", "z"]);
    // Sorting the already-sorted list must not reshuffle it.
    expect(sortTimeline(out).map((e) => e.id)).toEqual(["a", "z"]);
  });

  it("does not mutate its input", () => {
    const input = [entry({ id: "a", timestamp: "2026-08-01T10:00:00.000Z" }), entry({ id: "b", timestamp: "2026-08-02T10:00:00.000Z" })];
    sortTimeline(input);
    expect(input.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("buildTimeline — the canonical pipeline", () => {
  it("dedupes then sorts", () => {
    const at = "2026-08-02T09:00:00.000Z";
    const out = buildTimeline([
      entry({ id: "evt_1", action: "PAYMENT_CREATED", timestamp: "2026-08-01T10:00:00.000Z" }),
      entry({ id: "evt_seed", action: "REFUND_EXECUTED", timestamp: at }),
      entry({ id: "evt_dup", action: "REFUND_EXECUTED", timestamp: at }),
    ]);
    expect(out.map((e) => e.id)).toEqual(["evt_seed", "evt_1"]);
  });

  it("returns an empty timeline for empty input rather than throwing", () => {
    expect(buildTimeline([])).toEqual([]);
  });
});

describe("actionForLabel — the legacy adapter", () => {
  // Every label the transaction/payout/refund stores actually append. If one of
  // these falls through to the generic fallback the timeline shows the wrong
  // icon and tone, and the refund handoff becomes invisible.
  const TRANSACTION_LABELS = [
    "Payment created",
    "Authorization requested",
    "Awaiting confirmation",
    "Payment captured",
    "Provider transaction",
    "Authorization declined",
    "Payment retried",
    "Refund requested",
    "Refund issued",
    "Refund rejected",
  ];
  const PAYOUT_LABELS = [
    "Batch created",
    "Scheduled",
    "Disbursement started",
    "Completed",
    "Completed with failures",
    "Batch cancelled",
    "Failures retried",
    "Recipient retried",
  ];

  it.each([...TRANSACTION_LABELS, ...PAYOUT_LABELS])("maps the store label %s to a canonical action", (label) => {
    expect(TIMELINE_ACTIONS).toContain(actionForLabel(label));
  });

  // Spelled out rather than "anything but the fallback": several pending-ish
  // labels legitimately map to PAYMENT_PENDING, so the interesting assertion is
  // the exact mapping — especially for money-moving and failure labels.
  it.each<[string, string]>([
    ["Payment created", "PAYMENT_CREATED"],
    ["Authorization requested", "PAYMENT_PENDING"],
    ["Awaiting confirmation", "PAYMENT_PENDING"],
    ["Provider transaction", "PAYMENT_PENDING"],
    ["Payment captured", "PAYMENT_SUCCEEDED"],
    ["Authorization declined", "PAYMENT_FAILED"],
    ["Payment retried", "PAYMENT_RETRIED"],
    ["Refund requested", "REFUND_REQUESTED"],
    ["Refund issued", "REFUND_EXECUTED"],
    ["Refund rejected", "REFUND_REJECTED"],
    ["Batch created", "PAYOUT_CREATED"],
    ["Scheduled", "PAYOUT_PENDING"],
    ["Disbursement started", "PAYOUT_PROCESSING"],
    ["Completed", "PAYOUT_PAID"],
    ["Completed with failures", "PAYOUT_PARTIAL"],
    ["Batch cancelled", "PAYOUT_CANCELLED"],
    ["Failures retried", "PAYOUT_RETRIED"],
    ["Recipient retried", "PAYOUT_RETRIED"],
  ])("maps %s to %s", (label, expected) => {
    expect(actionForLabel(label)).toBe(expected);
  });

  it("separates the two refund phases into distinct actions", () => {
    expect(actionForLabel("Refund requested")).toBe("REFUND_REQUESTED");
    expect(actionForLabel("Refund issued")).toBe("REFUND_EXECUTED");
    expect(actionForLabel("Refund rejected")).toBe("REFUND_REJECTED");
    expect(actionForLabel("Refund requested")).not.toBe(actionForLabel("Refund issued"));
  });

  it("falls back rather than throwing on an unknown label", () => {
    expect(actionForLabel("Something invented")).toBe("PAYMENT_PENDING");
  });
});

describe("timelineFromTransactionEvents / timelineFromPayoutEvents", () => {
  const events = [
    { id: "evt-1", at: "2026-08-01T10:00:00.000Z", label: "Payment created", detail: "QRIS" },
    { id: "evt-2", at: "2026-08-01T10:05:00.000Z", label: "Payment captured" },
  ];

  it("projects every legacy event onto the canonical shape", () => {
    const out = timelineFromTransactionEvents("txn_1", events, "persona_agus");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      id: "evt-1",
      entityId: "txn_1",
      entityType: "transaction",
      action: "PAYMENT_CREATED",
      actor: "persona_agus",
      timestamp: "2026-08-01T10:00:00.000Z",
      reason: "Payment created",
      detail: "QRIS",
    });
    expect(out[1].detail).toBeNull(); // absent detail is normalised, not undefined
  });

  it("defaults the actor to null (a provider callback has no human actor)", () => {
    expect(timelineFromTransactionEvents("txn_1", events)[0].actor).toBeNull();
  });

  it("tags payout entries with the payout entity type so ids cannot collide", () => {
    const out = timelineFromPayoutEvents("batch_1", events);
    expect(out[0].entityType).toBe("payout_batch");
    expect(out[0].entityId).toBe("batch_1");
    expect(timelineKey(out[0])).not.toBe(timelineKey(timelineFromTransactionEvents("batch_1", events)[0]));
  });

  it("produces entries buildTimeline accepts unchanged", () => {
    const out = buildTimeline(timelineFromTransactionEvents("txn_1", events));
    expect(out.map((e) => e.id)).toEqual(["evt-2", "evt-1"]);
  });
});

describe("vocabulary", () => {
  it("covers the cross-role handoff actions Wave 4 added", () => {
    for (const action of ["HANDOFF_OPENED", "HANDOFF_NOTIFIED", "HANDOFF_CLAIMED", "HANDOFF_COMPLETED"]) {
      expect(TIMELINE_ACTIONS).toContain(action);
    }
  });

  it("has no duplicate action names", () => {
    expect(new Set(TIMELINE_ACTIONS).size).toBe(TIMELINE_ACTIONS.length);
  });
});
