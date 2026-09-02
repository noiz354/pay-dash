// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { POST, GET } from "./route";
import { listWebhooks } from "@/server/data/webhooks";

// The route is a plain function — exercise the full pipeline as HTTP would,
// including the QUEUES.md verification step ("replay webhook twice → second
// is deduped"). No token is configured in the test env, so the dev
// pass-through path applies (verification is covered in route.auth.test.ts).

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
    new Request("http://localhost/api/webhooks/xendit", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    })
  );
}

describe("POST /api/webhooks/xendit (no token configured)", () => {
  it("accepts a valid callback and logs it as RECEIVED", async () => {
    const body = JSON.stringify({
      id: "evt_route_1",
      event: "payment.succeeded",
      data: { id: "txn_route_1", status: "settle", amount: 5_000_000 },
    });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event: "payment.succeeded" });

    const rows = listWebhooks({ q: "evt_route_1", pageSize: 100 });
    expect(rows.total).toBe(1);
    expect(rows.rows[0]?.status).toBe("RECEIVED");
    expect(rows.rows[0]?.type).toBe("payment.succeeded");
    expect(rows.rows[0]?.source).toBe("xendit");
  });

  it("dedupes a replayed event id — the QUEUES.md verification step", async () => {
    const body = JSON.stringify({ id: "evt_route_2", event: "refund.succeeded", data: { id: "txn_route_2" } });
    const first = await post(body);
    expect(first.status).toBe(200);
    expect((await first.json()).deduped).toBeUndefined();

    const second = await post(body);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, deduped: true });

    const rows = listWebhooks({ q: "evt_route_2", pageSize: 100 });
    expect(rows.total).toBe(2);
    expect(rows.rows.map((r) => r.status).sort()).toEqual(["DUPLICATED", "RECEIVED"]);
    expect(rows.rows[0]?.reason).toMatch(/Duplicate — first received/);
  });

  it("rejects invalid JSON with 400 and logs a REJECTED row", async () => {
    const res = await post("not-json{{");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");

    const rejected = listWebhooks({ status: "REJECTED", pageSize: 100 }).rows;
    const row = rejected.find((r) => r.reason === "Invalid JSON" && typeof r.payload === "string");
    expect(row).toBeTruthy();
    expect(row?.payload).toBe("not-json{{");
  });

  it("rejects an empty body with 400", async () => {
    const res = await post("");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");
  });

  it("logs unknown event types as RECEIVED + unhandled", async () => {
    const res = await post(JSON.stringify({ id: "evt_route_3", event: "bank.account.updated" }));
    expect(res.status).toBe(200);
    expect((await res.json()).event).toBe("bank.account.updated");

    const rows = listWebhooks({ q: "evt_route_3", pageSize: 100 });
    expect(rows.rows[0]?.status).toBe("RECEIVED");
    expect(rows.rows[0]?.unhandled).toBe(true);
  });

  it("falls back to the event_id field when present", async () => {
    const res = await post(JSON.stringify({ event_id: "evt_route_4", event: "invoice.paid" }));
    expect(res.status).toBe(200);
    const rows = listWebhooks({ q: "evt_route_4", pageSize: 100 });
    expect(rows.total).toBe(1);
    expect(rows.rows[0]?.eventId).toBe("evt_route_4");
  });
});

describe("GET /api/webhooks/xendit", () => {
  it("describes the endpoint", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toContain("POST");
  });
});
