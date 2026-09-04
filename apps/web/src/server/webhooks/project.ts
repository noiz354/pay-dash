import "server-only";

import { STRIPE_WEBHOOK_MAP, XENDIT_WEBHOOK_MAP } from "@/domain/payments/webhook-maps";
import {
  buildPaymentProjectionStore,
  projectProviderEvent,
  type InMemoryPaymentProjectionStore,
} from "@/server/repositories/payment-projection-store";

/**
 * Webhook projection runtime (Rekomendasi #3). After a delivery is verified and
 * deduped, the route calls `projectWebhookEvent` to turn the provider event into
 * a canonical status update. The projector is idempotent, resolves the canonical
 * resource from the provider resource id (never the browser, never the event's
 * default provider), and refuses to invent a success for an unknown resource or
 * status. With no durable projection backend it defers (`UNAVAILABLE`).
 */

/** Extract the canonical provider resource id from a provider payload. */
function resourceIdFrom(payload: unknown): string {
  const data = (payload as { data?: Record<string, unknown> })?.data;
  const object = (data as { object?: Record<string, unknown> })?.object as { id?: string } | undefined;
  if (object?.id) {
    return object.id;
  }
  return (payload as { id?: string })?.id ?? "";
}

export async function projectWebhookEvent(input: {
  provider: "xendit" | "stripe";
  eventId: string;
  type: string;
  occurredAt?: string | null;
  payload: unknown;
  store?: InMemoryPaymentProjectionStore;
  /** Optional explicit org; resolved from the provider→canonical mapping when omitted. */
  organizationId?: string;
}): Promise<"PROJECTED" | "UNKNOWN_RESOURCE" | "UNAVAILABLE"> {
  const { provider, eventId, type, payload, store } = input;
  const projectionStore = store ?? (await buildPaymentProjectionStore());
  if (!projectionStore.available()) {
    return "UNAVAILABLE";
  }

  const resourceId = resourceIdFrom(payload);
  if (!resourceId) {
    return "UNKNOWN_RESOURCE";
  }

  // Resolve the canonical resource from the provider resource id. The join
  // (ProviderPayment → CanonicalPayment) is the authoritative mapping and is
  // never influenced by browser/request state or the event's default provider.
  let resource = await projectionStore.findResourceByProviderRef(provider, resourceId);
  if (!resource && input.organizationId) {
    // A caller-provided org allows a direct canonical id lookup as a fallback.
    resource = await projectionStore.findResource(input.organizationId, resourceId);
  }
  if (!resource) {
    return "UNKNOWN_RESOURCE";
  }

  const organizationId = resource.organizationId;
  if (input.organizationId && input.organizationId !== organizationId) {
    // A resource id can never be projected into a different organization.
    return "UNKNOWN_RESOURCE";
  }

  const map = provider === "stripe" ? STRIPE_WEBHOOK_MAP : XENDIT_WEBHOOK_MAP;
  const result = await projectProviderEvent({
    store: projectionStore,
    organizationId,
    event: {
      eventId,
      provider,
      resourceId: resource.id,
      observedProviderStatus: type,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
    },
    map,
    expectedVersion: resource.version,
  });
  return result ? "PROJECTED" : "UNKNOWN_RESOURCE";
}
