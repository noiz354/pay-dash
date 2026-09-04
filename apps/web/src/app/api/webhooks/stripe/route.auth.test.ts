// @vitest-environment node
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listWebhooks } from "@/server/data/webhooks";

// Signature-verification path. The env module reads STRIPE_WEBHOOK_SECRET at
// import time (createEnv), so stub the variable BEFORE the route module is
// loaded — a separate file from route.test.ts keeps the no-secret behaviour
// tests on their own module instance.
vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_secret");

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

const SECRET = "whsec_test_secret";

function signatureFor(rawBody: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    })
  );
}

describe("POST /api/webhooks/stripe (signature verification)", () => {
  it("rejects a missing signature with 400 and logs a REJECTED row", async () => {
    const res = await post(JSON.stringify({ id: "evt_sig_1", type: "charge.succeeded" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid Stripe signature");

    const rejected = listWebhooks({ status: "REJECTED", pageSize: 100 }).rows;
    expect(rejected.some((r) => (r.reason ?? "").endsWith("MALFORMED_SIGNATURE") && r.source === "stripe")).toBe(true);
  });

  it("rejects a tampered body with 400", async () => {
    const body = JSON.stringify({ id: "evt_sig_2", type: "charge.succeeded" });
    const sig = signatureFor(body);
    const tampered = body.replace("charge.succeeded", "payout.paid");
    const res = await post(tampered, { "stripe-signature": sig });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid Stripe signature");
  });

  it("rejects a stale timestamp outside tolerance", async () => {
    const body = JSON.stringify({ id: "evt_sig_3", type: "charge.succeeded" });
    const sig = signatureFor(body, SECRET, Math.floor(Date.now() / 1000) - 10_000);
    const res = await post(body, { "stripe-signature": sig });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid Stripe signature");
  });

  it("accepts a valid signature and logs RECEIVED", async () => {
    const body = JSON.stringify({ id: "evt_sig_4", type: "charge.succeeded", data: { object: { id: "ch_1" } } });
    const res = await post(body, { "stripe-signature": signatureFor(body) });
    expect(res.status).toBe(200);
    expect((await res.json()).event).toBe("charge.succeeded");

    const rows = listWebhooks({ q: "evt_sig_4", pageSize: 100 });
    expect(rows.rows[0]?.status).toBe("RECEIVED");
    expect(rows.rows[0]?.unhandled).toBe(false);
  });
});
