import { beforeEach, describe, expect, it } from "vitest";
import {
  getSystemWebhookSummary,
  getWebhookEvent,
  listWebhooks,
  recordInbound,
  rejectInbound,
  UNATTRIBUTED_ORGANIZATION_ID,
} from "./webhooks";
import { getLedgerRows } from "./transactions";
import { DEMO_CONTEXT } from "@/test/organization-context";

function resetAllStores() {
  const g = globalThis as unknown as {
    __kineticTxStore?: unknown;
    __kineticWebhooksStore?: unknown;
  };
  g.__kineticTxStore = undefined;
  g.__kineticWebhooksStore = undefined;
}

beforeEach(resetAllStores);

describe("seed coverage", () => {
  it("lists seven seeded callbacks with a full status spread", () => {
    const data = listWebhooks(DEMO_CONTEXT, { pageSize: 100 });
    expect(data.total).toBe(7);

    const byStatus = new Map<string, number>();
    for (const row of data.rows) byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
    expect(byStatus.get("RECEIVED")).toBe(4);
    expect(byStatus.get("DUPLICATED")).toBe(1);
    expect(byStatus.get("REJECTED")).toBe(2);
  });

  it("sorts by receivedAt descending and keeps the duplicate next to its original", () => {
    const rows = listWebhooks(DEMO_CONTEXT, { pageSize: 100 }).rows;
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].receivedAt >= rows[i].receivedAt).toBe(true);
    }
    const pair = rows.filter((r) => r.eventId === "evt_a1b2c3d4");
    expect(pair).toHaveLength(2);
    // Newest first: the provider's retry (later receivedAt) sits above the
    // original delivery it duplicates.
    expect(pair[0].status).toBe("DUPLICATED");
    expect(pair[0].reason).toMatch(/Duplicate — first received/);
    expect(pair[1].status).toBe("RECEIVED");
  });

  it("ties the seeded money events to real ledger rows", () => {
    const ledger = getLedgerRows(DEMO_CONTEXT);
    const succeeded = ledger.find((t) => t.status === "SUCCEEDED");
    const refunded = ledger.find((t) => t.status === "REFUNDED");

    const paid = getWebhookEvent(DEMO_CONTEXT, "whk_seed_1");
    expect(paid?.status).toBe("RECEIVED");
    expect((paid?.payload as { data: { id: string } }).data.id).toBe(succeeded?.referenceId);

    const refund = getWebhookEvent(DEMO_CONTEXT, "whk_seed_3");
    expect((refund?.payload as { data: { id: string } }).data.id).toBe(refunded?.referenceId);
  });

  it("seeds both refusal paths with their reasons", () => {
    expect(getWebhookEvent(DEMO_CONTEXT, "whk_seed_4")?.reason).toBe("Invalid x-callback-token");
    expect(getWebhookEvent(DEMO_CONTEXT, "whk_seed_6")?.reason).toBe("Invalid JSON");
    expect(getWebhookEvent(DEMO_CONTEXT, "whk_seed_4")?.status).toBe("REJECTED");
  });

  it("flags the unknown seeded event as unhandled", () => {
    const row = getWebhookEvent(DEMO_CONTEXT, "whk_seed_5");
    expect(row?.type).toBe("invoice.issued");
    expect(row?.unhandled).toBe(true);
    expect(getWebhookEvent(DEMO_CONTEXT, "whk_seed_1")?.unhandled).toBe(false);
  });

  it("returns null for unknown ids", () => {
    expect(getWebhookEvent(DEMO_CONTEXT, "whk_nope")).toBeNull();
  });
});

describe("filters and pagination", () => {
  it("filters by status", () => {
    expect(listWebhooks(DEMO_CONTEXT, { status: "RECEIVED", pageSize: 100 }).total).toBe(4);
    expect(listWebhooks(DEMO_CONTEXT, { status: "DUPLICATED", pageSize: 100 }).total).toBe(1);
    expect(listWebhooks(DEMO_CONTEXT, { status: "REJECTED", pageSize: 100 }).total).toBe(2);
  });

  it("filters by type, with 'unknown' as the unhandled bucket", () => {
    expect(listWebhooks(DEMO_CONTEXT, { type: "payment.succeeded", pageSize: 100 }).total).toBe(3);
    expect(listWebhooks(DEMO_CONTEXT, { type: "refund.succeeded", pageSize: 100 }).total).toBe(1);
    expect(listWebhooks(DEMO_CONTEXT, { type: "unknown", pageSize: 100 }).total).toBe(3); // invoice.issued + 2 rejections
    expect(listWebhooks(DEMO_CONTEXT, { type: "invoice.paid", pageSize: 100 }).total).toBe(0);
  });

  it("searches event id, type and payload", () => {
    expect(listWebhooks(DEMO_CONTEXT, { q: "evt_a1b2c3d4" }).total).toBe(2);
    expect(listWebhooks(DEMO_CONTEXT, { q: "refund.succeeded" }).total).toBe(1);
    // A ledger reference inside a payload is searchable.
    const ref = (getWebhookEvent(DEMO_CONTEXT, "whk_seed_1")?.payload as { data: { id: string } }).data.id;
    expect(listWebhooks(DEMO_CONTEXT, { q: ref }).total).toBeGreaterThanOrEqual(1);
    expect(listWebhooks(DEMO_CONTEXT, { q: "no-such-event-xyz" }).total).toBe(0);
  });

  it("pages correctly and clamps out-of-range pages", () => {
    const first = listWebhooks(DEMO_CONTEXT, { pageSize: 3, page: 1 });
    expect(first.total).toBe(7);
    expect(first.pageCount).toBe(3);
    expect(first.rows).toHaveLength(3);

    const clamped = listWebhooks(DEMO_CONTEXT, { pageSize: 3, page: 99 });
    expect(clamped.page).toBe(3);
    expect(clamped.rows).toHaveLength(1);
  });
});

describe("recordInbound (shared pipeline)", () => {
  it("records a new event as RECEIVED", () => {
    const { event, deduped } = recordInbound(DEMO_CONTEXT, {
      eventId: "evt_new_1",
      type: "payment.succeeded",
      payload: { id: "evt_new_1", event: "payment.succeeded" },
      source: "xendit",
    });
    expect(deduped).toBe(false);
    expect(event.status).toBe("RECEIVED");
    expect(event.unhandled).toBe(false);
    expect(getWebhookEvent(DEMO_CONTEXT, event.id)?.status).toBe("RECEIVED");
  });

  it("records a repeated event id as DUPLICATED with the first-received reference", () => {
    recordInbound(DEMO_CONTEXT, {
      eventId: "evt_new_2",
      type: "payment.succeeded",
      payload: { id: "evt_new_2" },
      source: "xendit",
      receivedAt: "2026-09-02T01:00:00.000Z",
    });
    const second = recordInbound(DEMO_CONTEXT, {
      eventId: "evt_new_2",
      type: "payment.succeeded",
      payload: { id: "evt_new_2" },
      source: "xendit",
    });
    expect(second.deduped).toBe(true);
    expect(second.event.status).toBe("DUPLICATED");
    expect(second.event.reason).toContain("2026-09-02T01:00:00.000Z");
  });

  it("flags types outside the known set as unhandled", () => {
    const { event } = recordInbound(DEMO_CONTEXT, {
      eventId: "evt_new_3",
      type: "bank.account.updated",
      payload: { id: "evt_new_3" },
      source: "simulate",
    });
    expect(event.status).toBe("RECEIVED");
    expect(event.unhandled).toBe(true);
    expect(event.source).toBe("simulate");
  });

  it("dedupe spans sources — a simulated retry of a real event is still a duplicate", () => {
    const { deduped } = recordInbound(DEMO_CONTEXT, {
      eventId: "evt_a1b2c3d4", // seeded
      type: "payment.succeeded",
      payload: { id: "evt_a1b2c3d4" },
      source: "replay",
    });
    expect(deduped).toBe(true);
    const rows = listWebhooks(DEMO_CONTEXT, { q: "evt_a1b2c3d4", pageSize: 100 });
    expect(rows.rows.filter((r) => r.status === "DUPLICATED")).toHaveLength(2);
  });
});

describe("getSystemWebhookSummary (the /system page)", () => {
  it("counts the last 24h by outcome — deterministically", () => {
    // The seeds are now-relative offsets: seed_1 (2h) and seed_2 (1h59m)
    // are inside the window, seed_3 (27h) is not — independent of the
    // wall clock at run time.
    const s = getSystemWebhookSummary(DEMO_CONTEXT);
    expect(s.last24h).toEqual({ total: 2, received: 1, duplicated: 1, rejected: 0 });
  });

  it("lists the five most recent callbacks and the newest timestamp", () => {
    const s = getSystemWebhookSummary(DEMO_CONTEXT);
    expect(s.recent).toHaveLength(5);
    expect(s.recent[0]?.id).toBe("whk_seed_2"); // the retry is the newest row
    expect(s.lastReceivedAt).toBe(getWebhookEvent(DEMO_CONTEXT, "whk_seed_2")?.receivedAt);
  });

  it("a door rejection is recorded at the door, invisible to every tenant", () => {
    // Wave 7G: rejectInbound is a door writer — it lands in the unattributed
    // partition, never in demo. The tenant summary must not gain a row.
    const before = getSystemWebhookSummary(DEMO_CONTEXT);
    rejectInbound({ reason: "Invalid x-callback-token", raw: "{}" });
    const after = getSystemWebhookSummary(DEMO_CONTEXT);
    expect(after.last24h.total).toBe(before.last24h.total);
    // Demo's seed has its own "Invalid x-callback-token" rejection, so identify
    // the door's row by its distinctive raw payload ("{}") rather than reason.
    expect(after.recent.some((e) => e.payload === "{}")).toBe(false);
  });
});

describe("rejectInbound", () => {
  it("records a refusal with its reason and raw body, at the door", () => {
    const event = rejectInbound({ reason: "Invalid x-callback-token", raw: `{"id":"evt_x"}` });
    expect(event.status).toBe("REJECTED");
    expect(event.reason).toBe("Invalid x-callback-token");
    expect(event.eventId).toMatch(/^rej_/);
    // Wave 7G: the refusal lives in the unattributed partition, not demo.
    expect(getWebhookEvent(DEMO_CONTEXT, event.id)).toBeNull();
    const g = globalThis as unknown as {
      __kineticWebhooksStore?: { tenants?: Map<string, { events: { id: string; status: string }[] }> };
    };
    const door = g.__kineticWebhooksStore?.tenants?.get(UNATTRIBUTED_ORGANIZATION_ID)?.events ?? [];
    expect(door.some((e) => e.id === event.id && e.status === "REJECTED")).toBe(true);
  });
});
