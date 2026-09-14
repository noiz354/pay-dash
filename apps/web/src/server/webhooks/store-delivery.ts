import "server-only";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { recordInbound, recordUnattributedInbound, UNATTRIBUTED_ORGANIZATION_ID } from "@/server/data/webhooks";
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
    // Wave 7G attribution debt (D-30): until a connection→org mapping resolves
    // the tenant at the door, an unattributable event is persisted as
    // "unresolved" — visible to no tenant, never defaulted to demo.
    organizationId: input.organizationId ?? UNATTRIBUTED_ORGANIZATION_ID, // "unresolved"; refined by event-projection
    connectionId: input.connectionId ?? null,
    payload: input.payload,
  });

  // UI log (same key). Wave 7G invariant: attributable ⇒ the owner's tenant;
  // unattributable ⇒ the door partition, visible to no tenant and never
  // defaulting to demo. The organizationId arrives only when a connection→org
  // mapping resolved it upstream; until then the event is a dead letter that
  // operators can inspect but no merchant can read.
  const logInput = {
    eventId: input.eventId,
    type: input.type,
    payload: input.payload,
    source: input.provider,
    dedupeKey,
  };
  const log = input.organizationId
    ? recordInbound(parseOrganizationContext({ organizationId: input.organizationId }), logInput)
    : recordUnattributedInbound(logInput);

  const deduped = durable.deduped || log.deduped;
  return { received: true, deduped, event: input.type };
}
