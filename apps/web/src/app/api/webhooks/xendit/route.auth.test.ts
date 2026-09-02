// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listWebhooks } from "@/server/data/webhooks";

// Token-verification path. The env module reads XENDIT_WEBHOOK_TOKEN at
// import time (createEnv), so stub the variable BEFORE the route module is
// loaded — a separate file from route.test.ts keeps the no-token behaviour
// tests on their own module instance.
vi.stubEnv("XENDIT_WEBHOOK_TOKEN", "wh_test_token");

const { POST } = await import("./route");

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

describe("POST /api/webhooks/xendit (token configured)", () => {
  it("rejects a missing token with 401 and logs a REJECTED row", async () => {
    const res = await post(JSON.stringify({ id: "evt_auth_1", event: "payment.succeeded" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Invalid x-callback-token");

    const rejected = listWebhooks({ status: "REJECTED", pageSize: 100 }).rows;
    expect(rejected.some((r) => r.reason === "Invalid x-callback-token")).toBe(true);
    // Nothing was RECEIVED (the raw body is still searchable on the rejected
    // row — that is deliberate, it is how you debug a bad callback).
    const matches = listWebhooks({ q: "evt_auth_1", pageSize: 100 }).rows;
    expect(matches.every((r) => r.status === "REJECTED")).toBe(true);
  });

  it("rejects a wrong token with 401", async () => {
    const res = await post(
      JSON.stringify({ id: "evt_auth_2", event: "payment.succeeded" }),
      { "x-callback-token": "wh_wrong" }
    );
    expect(res.status).toBe(401);
  });

  it("accepts the correct token and logs RECEIVED", async () => {
    const res = await post(
      JSON.stringify({ id: "evt_auth_3", event: "payment.succeeded", data: { id: "txn_auth_3" } }),
      { "x-callback-token": "wh_test_token" }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).event).toBe("payment.succeeded");
    expect(listWebhooks({ q: "evt_auth_3", pageSize: 100 }).rows[0]?.status).toBe("RECEIVED");
  });
});
