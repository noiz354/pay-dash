import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { recordInbound, rejectInbound } from "@/server/data/webhooks";
import { verifyStripeSignature } from "@/server/webhooks/verify";

// Stripe webhook ingress (ADR-0028): provider-specific endpoint at
// `/api/webhooks/stripe`. This app RECEIVES callbacks; it never delivers them.
//
// Security boundary, in order:
//   1. VERIFY the raw-body signature with the pinned webhook secret before any
//      mutation (never reuse Xendit's callback-token logic).
//   2. Parse + validate the payload shape.
//   3. Persist (dedupe by `stripe:<event_id>` — a retried event id logs a
//      DUPLICATED row instead of a second RECEIVED).
//   4. Respond 200 fast — non-2xx triggers Stripe retries.
//
// No Stripe SDK model leaks here; this is a thin, server-only boundary.

const StripeEventPayloadSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    created: z.number().int().positive().optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");

  // 1. VERIFY raw-body signature (ADR-0028 webhook scope).
  const signature = req.headers.get("stripe-signature");
  const secret = env.STRIPE_WEBHOOK_SECRET;

  if (secret) {
    const verification = verifyStripeSignature({ rawBody: raw, signatureHeader: signature ?? "", secret });
    if (!verification.verified) {
      rejectInbound({ reason: `Invalid Stripe signature: ${verification.reason}`, raw, source: "stripe" });
      return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
    }
  } else if (process.env.NODE_ENV === "production") {
    rejectInbound({ reason: "Stripe webhook secret not configured", raw, source: "stripe" });
    return NextResponse.json({ error: "Stripe webhook secret not configured" }, { status: 500 });
  }
  // In dev without a secret, allow but warn (mirrors the Xendit route).

  // 2. Parse & validate.
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : undefined;
    if (body === undefined) throw new Error("empty body");
  } catch {
    rejectInbound({ reason: "Invalid JSON", raw, source: "stripe" });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = StripeEventPayloadSchema.safeParse(body);
  if (!parsed.success) {
    rejectInbound({ reason: "Invalid payload", raw, source: "stripe" });
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 422 });
  }

  const payload = parsed.data as { id: string; type: string; created?: number };
  const eventId = payload.id;
  const type = payload.type;

  // 3. Persist — provider-scoped dedupe so a Stripe event id can never collide
  //    with an Xendit event id of the same value.
  const { deduped } = recordInbound({ eventId, type, payload: body, source: "stripe", dedupeKey: `stripe:${eventId}` });

  // 4. Respond 200 fast; async processing is downstream (QUEUES.md).
  void processStripeWebhookAsync(type, body).catch((e) => {
    console.error("[webhook] stripe async processing failed", e);
  });

  return NextResponse.json(deduped ? { received: true, deduped: true } : { received: true, event: type }, {
    status: 200,
  });
}

async function processStripeWebhookAsync(type: string, payload: unknown) {
  // TODO: update the canonical status via event-projection. Stripe event ids
  // arrive both as `id` (event id) and `data.object.id` (resource id); the
  // projector must map `type` → canonical status and reconcile the correct
  // persisted connection/account (never the current default provider).
  switch (type) {
    case "payment_intent.succeeded":
    case "charge.succeeded":
    case "charge.refunded":
    case "payout.paid":
    case "payout.failed":
    case "transfer.created":
    case "account.updated":
      // handleStripeEvent(payload as ...) — placeholder for projection wiring.
      break;
    default:
      console.log(`[webhook] unhandled stripe event: ${type}`, payload);
  }
}

export async function GET() {
  return NextResponse.json({ status: "webhook endpoint — POST with stripe-signature" });
}
