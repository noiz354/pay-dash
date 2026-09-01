import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";

// Reusable webhook handler — INTEGRATION.md #7 (x-callback-token), NEXTJS_CONCEPTS.md #6 Route Handlers, #31 route.ts, #138 Zod
// Verify → dedupe → 200 fast → queue (docs/QUEUES.md ladder: no Redis until needed)

// In-memory dedupe for dev; production: persist to DB `WebhookEvent` table (PHASE0_PLAN.md T6, docs/QUEUES.md)
// Reuse: globalThis to survive HMR in dev
const globalForDedupe = globalThis as unknown as { webhookSeen: Set<string> | undefined };
const seenIds = globalForDedupe.webhookSeen ?? new Set<string>();
if (!globalForDedupe.webhookSeen) globalForDedupe.webhookSeen = seenIds;

const WebhookPayloadSchema = z
  .object({
    event: z.string().optional(),
    id: z.string().optional(),
    event_id: z.string().optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

export async function POST(req: Request) {
  // 1. VERIFY x-callback-token (INTEGRATION.md:292, ARCHITECTURE.md:27)
  const token = req.headers.get("x-callback-token") ?? req.headers.get("X-CALLBACK-TOKEN");
  const expected = env.XENDIT_WEBHOOK_TOKEN;

  if (expected) {
    if (!token || token !== expected) {
      return NextResponse.json({ error: "Invalid x-callback-token" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Webhook token not configured" }, { status: 500 });
  }
  // In dev without token, allow but warn (reuse pino logger #36)
  // console.warn("[webhook] XENDIT_WEBHOOK_TOKEN not set — skipping verification (dev only)");

  // 2. Parse & validate body (Zod #138)
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = WebhookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 422 });
  }

  const payload = parsed.data as Record<string, unknown> & { id?: string; event_id?: string; event?: string };
  const eventId = (payload.event_id as string) ?? (payload.id as string) ?? JSON.stringify(payload).slice(0, 64);

  // 3. Dedupe by event_id (idempotency — docs/ARCHITECTURE.md:42 idempotency_key)
  if (seenIds.has(eventId)) {
    return NextResponse.json({ received: true, deduped: true }, { status: 200 });
  }
  seenIds.add(eventId);

  // Cap memory
  if (seenIds.size > 1000) {
    const first = seenIds.values().next().value as string | undefined;
    if (first) seenIds.delete(first);
  }

  // 4. Respond 200 fast — non-2xx triggers Xendit retries (INTEGRATION.md:301)
  // Queue work async (placeholder — docs/QUEUES.md: Inngest/Trigger.dev/BullMQ when needed)
  const event = (payload.event as string) ?? "unknown";
  // Fire-and-forget processing (do not await before response)
  void processWebhookAsync(event, payload).catch((e) => {
    // Use pino if available; console as fallback
    console.error("[webhook] async processing failed", e);
  });

  return NextResponse.json({ received: true, event }, { status: 200 });
}

async function processWebhookAsync(event: string, payload: unknown) {
  // TODO: persist to DB for webhook_logs + system_health_monitoring screens (no fetch API — persist inbound)
  // Example: await prisma.webhookEvent.create({ data: { event, payload, eventId } });
  // TODO: update ledger via DAL (server/dal/ledger.ts) — handlePaymentSucceeded etc.
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
