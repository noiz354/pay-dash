import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { recordInbound, rejectInbound } from "@/server/data/webhooks";
import { verifyXenditCallbackToken } from "@/server/webhooks/verify";

// Reusable webhook handler — INTEGRATION.md #7 (x-callback-token), NEXTJS_CONCEPTS.md #6 Route Handlers, #31 route.ts, #138 Zod
// Verify → dedupe → 200 fast → queue (docs/QUEUES.md ladder: no Redis until needed)
//
// ADR-0014: every callback is persisted to the webhook log before the
// response — the route's public contract (status codes, dedupe no-op,
// 200-fast) is unchanged; the log is what the /webhooks page renders.

const WebhookPayloadSchema = z
  .object({
    event: z.string().optional(),
    id: z.string().optional(),
    event_id: z.string().optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");

  // 1. VERIFY x-callback-token (INTEGRATION.md:292, ARCHITECTURE.md:27).
  // Constant-time compare via webhook-ingress (verify.ts) — never a `!==`.
  const token = req.headers.get("x-callback-token") ?? req.headers.get("X-CALLBACK-TOKEN");
  const expected = env.XENDIT_WEBHOOK_TOKEN;

  if (expected) {
    const verification = verifyXenditCallbackToken({ presented: token, expected });
    if (!verification.verified) {
      rejectInbound({ reason: "Invalid x-callback-token", raw });
      return NextResponse.json({ error: "Invalid x-callback-token" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    rejectInbound({ reason: "Webhook token not configured", raw });
    return NextResponse.json({ error: "Webhook token not configured" }, { status: 500 });
  }
  // In dev without token, allow but warn (reuse pino logger #36)

  // 2. Parse & validate body (Zod #138)
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : undefined;
    if (body === undefined) throw new Error("empty body");
  } catch {
    rejectInbound({ reason: "Invalid JSON", raw });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = WebhookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    rejectInbound({ reason: "Invalid payload", raw });
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 422 });
  }

  const payload = parsed.data as Record<string, unknown> & { id?: string; event_id?: string; event?: string };
  const eventId = (payload.event_id as string) ?? (payload.id as string) ?? JSON.stringify(payload).slice(0, 64);
  const event = (payload.event as string) ?? "unknown";

  // 3. Persist — dedupe by event id (idempotency — ARCHITECTURE.md:42).
  // A retried event id logs a DUPLICATED row instead of a second RECEIVED.
  const { deduped } = recordInbound({ eventId, type: event, payload, source: "xendit" });

  // 4. Respond 200 fast — non-2xx triggers Xendit retries (INTEGRATION.md:301)
  // Queue work async (placeholder — docs/QUEUES.md: Inngest/Trigger.dev/BullMQ when needed)
  void processWebhookAsync(event, payload).catch((e) => {
    console.error("[webhook] async processing failed", e);
  });

  return NextResponse.json(deduped ? { received: true, deduped: true } : { received: true, event }, {
    status: 200,
  });
}

async function processWebhookAsync(event: string, payload: unknown) {
  // TODO: update ledger via DAL (server/dal/ledger.ts) — handlePaymentSucceeded etc.
  // (QUEUES.md design: queue → worker → idempotent ledger update. Out of scope
  // for the log pass, ADR-0014 — the callback is stored, not yet processed.)
  // Reusable handlers per INTEGRATION.md #7:
  //   payment.succeeded → PaymentCallback, invoice.paid → InvoiceCallback, refund.succeeded → RefundCallback
  switch (event) {
    case "payment.succeeded":
    case "payment.completed":
      // handlePaymentSucceeded(payload as PaymentCallback)
      break;
    case "invoice.paid":
    case "invoice.completed":
      // handleInvoicePaid(payload as InvoiceCallback)
      break;
    case "refund.succeeded":
      // handleRefundSucceeded(payload as RefundCallback)
      break;
    default:
      // unknown event — log for observability (Sentry #203, pino #36)
      console.log(`[webhook] unhandled event: ${event}`, payload);
  }
}

// Optional: verify via GET for dashboard testing
export async function GET() {
  return NextResponse.json({ status: "webhook endpoint — POST with x-callback-token" });
}
