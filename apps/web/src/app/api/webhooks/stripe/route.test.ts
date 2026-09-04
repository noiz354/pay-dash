// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { POST, GET } from "./route";
import { listWebhooks } from "@/server/data/webhooks";

// No STRIPE_WEBHOOK_SECRET configured → dev pass-through (verification covered
// in route.auth.test.ts). Exercises the full pipeline as HTTP would.

function resetAllStores() {
  const g = globalThis as unknown as {
    __kineticTxStore?: unknown;
    __kineticWebhooksStore?: unknown;
  };
  g.__kineticTxStore = undefined;
  g.__kineticWebhooksStore = undefined;
}

beforeEach(resetAllStores);

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    })
  );
}

describe("POST /api/webhooks/stripe (no secret configured)", () => {
  it("accepts a valid Stripe event and logs it as RECEIVED with source stripe", async () => {
    const body = JSON.stringify({
      id: "evt_stripe_1",
      type: "payment_intent.succeeded",
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: "pi_123", amount: 5_000_000, currency: "idr" } },
    });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event: "payment_intent.succeeded" });

    const rows = listWebhooks({ q: "evt_stripe_1", pageSize: 100 });
    expect(rows.total).toBe(1);
    expect(rows.rows[0]?.status).toBe("RECEIVED");
    expect(rows.rows[0]?.type).toBe("payment_intent.succeeded");
    expect(rows.rows[0]?.source).toBe("stripe");
    // Provider-scoped dedupe key kept for a later retry to collide on.
    expect(rows.rows[0]?.dedupeKey).toBe("stripe:evt_stripe_1");
    // Stripe events are in KNOWN_WEBHOOK_EVENTS → not flagged unhandled.
    expect(rows.rows[0]?.unhandled).toBe(false);
  });

  it("dedupes a replayed Stripe event id", async () => {
    const body = JSON.stringify({ id: "evt_stripe_2", type: "charge.succeeded", data: { object: { id: "ch_123" } } });
    const first = await post(body);
    expect(first.status).toBe(200);
    expect((await first.json()).deduped).toBeUndefined();

    const second = await post(body);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, deduped: true });

    const rows = listWebhooks({ q: "evt_stripe_2", pageSize: 100 });
    expect(rows.total).toBe(2);
    expect(rows.rows.map((r) => r.status).sort()).toEqual(["DUPLICATED", "RECEIVED"]);
  });

  it("does not collide with an Xendit event of the same id (provider-scoped dedupe)", async () => {
    // A Xendit callback with the same event id arrives first.
    const { recordInbound } = await import("@/server/data/webhooks");
    recordInbound({ eventId: "evt_shared", type: "payment.succeeded", payload: {}, source: "xendit" });

    const res = await post(JSON.stringify({ id: "evt_shared", type: "charge.succeeded", data: { object: { id: "ch_1" } } }));
    expect(res.status).toBe(200);
    expect((await res.json()).deduped).toBeUndefined();

    const rows = listWebhooks({ q: "evt_shared", pageSize: 100 });
    expect(rows.total).toBe(2);
    expect(rows.rows.filter((r) => r.source === "stripe" && r.status === "RECEIVED")).toHaveLength(1);
    expect(rows.rows.filter((r) => r.source === "xendit" && r.status === "RECEIVED")).toHaveLength(1);
  });

  it("rejects invalid JSON with 400 and logs a REJECTED row", async () => {
    const res = await post("not-json{{");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");
    const rejected = listWebhooks({ status: "REJECTED", pageSize: 100 }).rows;
    expect(rejected.some((r) => r.reason === "Invalid JSON" && r.source === "stripe")).toBe(true);
  });

  it("rejects an empty body with 400", async () => {
    const res = await post("");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");
  });
});

describe("GET /api/webhooks/stripe", () => {
  it("describes the endpoint", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toContain("POST");
  });
});
