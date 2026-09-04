import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Webhook ingress (webhook-ingress). Provider-specific authenticity verification
 * BEFORE any mutation. Xendit uses a callback-token contract; Stripe uses a
 * signed raw-body signature. The two are never reused. Payloads are normalized
 * and redacted; events are deduped by a provider-scoped key.
 *
 * This module holds pure verification/normalization logic. Durable delivery,
 * DB receipt, outbox, and projectors are downstream.
 */

export type WebhookVerification = { verified: true } | { verified: false; reason: string };

/** Constant-time string compare; always returns false for empty expected. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ba, bb);
}

export function verifyXenditCallbackToken(input: {
  presented: string | null;
  expected: string | null;
}): WebhookVerification {
  if (!input.expected) {
    return { verified: false, reason: "WEBHOOK_TOKEN_NOT_CONFIGURED" };
  }
  if (!input.presented) {
    return { verified: false, reason: "MISSING_CALLBACK_TOKEN" };
  }
  if (!constantTimeEqual(input.presented, input.expected)) {
    return { verified: false, reason: "INVALID_CALLBACK_TOKEN" };
  }
  return { verified: true };
}

const STRIPE_SIGNATURE_RE = /t=(\d+),?(v1=([0-9a-f]+))?/;

export function verifyStripeSignature(input: {
  rawBody: string;
  signatureHeader: string;
  secret: string;
  toleranceSeconds?: number;
  timestamp?: number;
}): WebhookVerification {
  if (!input.secret) {
    return { verified: false, reason: "WEBHOOK_SECRET_NOT_CONFIGURED" };
  }
  const match = STRIPE_SIGNATURE_RE.exec(input.signatureHeader);
  if (!match) {
    return { verified: false, reason: "MALFORMED_SIGNATURE" };
  }
  const t = Number(match[1]);
  const v1 = match[3];
  if (!v1) {
    return { verified: false, reason: "MISSING_SIGNATURE" };
  }
  const now = input.timestamp ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? 300;
  if (Math.abs(now - t) > tolerance) {
    return { verified: false, reason: "STALE_TIMESTAMP" };
  }
  const signed = `${t}.${input.rawBody}`;
  const expected = createHmac("sha256", input.secret).update(signed).digest("hex");
  if (!constantTimeEqual(v1, expected)) {
    return { verified: false, reason: "SIGNATURE_MISMATCH" };
  }
  return { verified: true };
}

export function xenditEventDedupeKey(eventId: string): string {
  return `xendit:${eventId}`;
}

export function stripeEventDedupeKey(eventId: string): string {
  return `stripe:${eventId}`;
}

/* ---------------------------------------------------------------------- */
/* Canonical, redacted event envelope                                     */
/* ---------------------------------------------------------------------- */

const RedactUser = z.string().transform((v) => "[redacted]");
const RedactEmail = z.string().regex(/@/).transform(() => "[redacted]");
const RedactAmount = z.string();

const ProviderEventPayloadSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    data: z
      .object({
        id: z.string().optional(),
        status: z.string().optional(),
        amount: RedactAmount.optional(),
        currency: z.string().optional(),
        customer_email: RedactEmail.optional(),
        customer_name: RedactUser.optional(),
      })
      .passthrough()
      .strict(),
  })
  .strict();

export const CanonicalProviderEventSchema = z.object({
  provider: z.enum(["xendit", "stripe"]),
  eventId: z.string().min(1),
  type: z.string().min(1),
  occurredAt: z.string().datetime().nullable(),
  rawType: z.string().min(1),
  payload: z.unknown(),
});

export type CanonicalProviderEvent = z.infer<typeof CanonicalProviderEventSchema>;

export function normalizeProviderEvent(input: {
  provider: "xendit" | "stripe";
  eventId: string;
  type: string;
  occurredAt?: string | null;
  rawPayload: unknown;
}): CanonicalProviderEvent {
  // Validate the outer shape; individual payload fields that are sensitive are
  // redacted by the per-provider schema before persistence.
  const parsed = ProviderEventPayloadSchema.parse({
    id: input.eventId,
    type: input.type,
    data: input.rawPayload,
  });
  return CanonicalProviderEventSchema.parse({
    provider: input.provider,
    eventId: parsed.id,
    type: parsed.type,
    occurredAt: input.occurredAt ?? null,
    rawType: parsed.type,
    payload: parsed.data,
  });
}
