import "server-only";

import { recordInbound } from "@/server/data/webhooks";
import { buildWebhookDeliveryStore } from "@/server/repositories/webhook-delivery-store";

/**
 * Record a verified inbound provider event through BOTH layers:
 *   1. the durable `WebhookDelivery` store (ADR-0028 / webhook-ingress) — the
 *      real idempotency gate backed by the `@@unique([provider,providerEventId])`
 *      constraint, so a retried event can never double-process across restarts
 *      or instances;
 *   2. the in-memory receive log (`server/data/webhooks`) — the /webhooks page
 *      projection (ADR-0014).
 *
 * Both dedupe on the SAME provider-scoped key (`<provider>:<eventId>`), so the
 * response and the UI never disagree.
 */
export async function recordWebhookDelivery(input: {
  provider: "xendit" | "stripe";
  eventId: string;
  type: string;
  payload: unknown;
  organizationId?: string;
  connectionId?: string | null;
}): Promise<{ received: boolean; deduped: boolean; event: string }> {
  const dedupeKey = `${input.provider}:${input.eventId}`;

  // Durable gate.
  const store = await buildWebhookDeliveryStore();
  const durable = await store.record({
    provider: input.provider,
    providerEventId: input.eventId,
    type: input.type,
    organizationId: input.organizationId ?? "unresolved", // refined by event-projection
    connectionId: input.connectionId ?? null,
    payload: input.payload,
  });

  // UI log (same key).
  const log = recordInbound({
    eventId: input.eventId,
    type: input.type,
    payload: input.payload,
    source: input.provider,
    dedupeKey,
  });

  const deduped = durable.deduped || log.deduped;
  return { received: true, deduped, event: input.type };
}
