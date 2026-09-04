import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  normalizeProviderEvent,
  stripeEventDedupeKey,
  verifyStripeSignature,
  verifyXenditCallbackToken,
  xenditEventDedupeKey,
} from "./verify";

describe("xendit callback token", () => {
  it("verifies a matching token", () => {
    expect(verifyXenditCallbackToken({ presented: "abc123", expected: "abc123" })).toEqual({ verified: true });
  });

  it("rejects a missing or mismatched token", () => {
    expect(verifyXenditCallbackToken({ presented: null, expected: "abc" })).toMatchObject({ verified: false, reason: "MISSING_CALLBACK_TOKEN" });
    expect(verifyXenditCallbackToken({ presented: "abc", expected: "def" })).toMatchObject({ verified: false, reason: "INVALID_CALLBACK_TOKEN" });
    expect(verifyXenditCallbackToken({ presented: "abc", expected: null })).toMatchObject({ verified: false, reason: "WEBHOOK_TOKEN_NOT_CONFIGURED" });
  });

  it("is constant-time safe", () => {
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("same", "diff")).toBe(false);
    expect(constantTimeEqual("", "same")).toBe(false);
  });
});

describe("stripe signature", () => {
  const secret = "whsec_test_synthetic_secret";
  const rawBody = '{"id":"evt_1","type":"payment_intent.succeeded"}';
  const t = 1700000000;

  const signatureFor = (body: string, timestamp: number, key = secret): string => {
    const signed = `${timestamp}.${body}`;
    const v1 = createHmac("sha256", key).update(signed).digest("hex");
    return `t=${timestamp},v1=${v1}`;
  };

  it("verifies a valid raw-body signature within tolerance", () => {
    const header = signatureFor(rawBody, t);
    const res = verifyStripeSignature({ rawBody, signatureHeader: header, secret, timestamp: t });
    expect(res).toEqual({ verified: true });
  });

  it("rejects a tampered body", () => {
    const header = signatureFor(rawBody, t);
    expect(verifyStripeSignature({ rawBody: '{"id":"evt_2"}', signatureHeader: header, secret, timestamp: t })).toMatchObject({ verified: false, reason: "SIGNATURE_MISMATCH" });
  });

  it("rejects an unknown secret", () => {
    const header = signatureFor(rawBody, t);
    expect(verifyStripeSignature({ rawBody, signatureHeader: header, secret: "wrong", timestamp: t })).toMatchObject({ verified: false, reason: "SIGNATURE_MISMATCH" });
  });

  it("rejects a stale timestamp outside tolerance", () => {
    const header = signatureFor(rawBody, t);
    expect(verifyStripeSignature({ rawBody, signatureHeader: header, secret, timestamp: t + 500 })).toMatchObject({ verified: false, reason: "STALE_TIMESTAMP" });
  });

  it("rejects malformed signature headers", () => {
    expect(verifyStripeSignature({ rawBody, signatureHeader: "nonsense", secret, timestamp: t })).toMatchObject({ verified: false, reason: "MALFORMED_SIGNATURE" });
    expect(verifyStripeSignature({ rawBody, signatureHeader: "t=1," , secret, timestamp: t })).toMatchObject({ verified: false, reason: "MISSING_SIGNATURE" });
  });

  it("rejects when no secret is configured", () => {
    expect(verifyStripeSignature({ rawBody, signatureHeader: "t=1,v1=abc", secret: "", timestamp: t })).toMatchObject({ verified: false, reason: "WEBHOOK_SECRET_NOT_CONFIGURED" });
  });
});

describe("event dedupe and normalization", () => {
  it("scopes dedupe keys per provider", () => {
    expect(xenditEventDedupeKey("evt")).toBe("xendit:evt");
    expect(stripeEventDedupeKey("evt")).toBe("stripe:evt");
  });

  it("normalizes a provider envelope and redacts email/name", () => {
    const event = normalizeProviderEvent({
      provider: "xendit",
      eventId: "evt_1",
      type: "invoice.paid",
      rawPayload: { id: "inv_1", status: "PAID", amount: "1000", currency: "IDR", customer_email: "jane@example.com", customer_name: "Jane Doe" },
    });
    expect(event.provider).toBe("xendit");
    expect(event.eventId).toBe("evt_1");
    expect(event.payload).toMatchObject({ status: "PAID" });
    expect(JSON.stringify(event.payload)).not.toContain("jane@example.com");
  });
});
