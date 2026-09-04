import "server-only";

import { RepositoryError } from "@/domain/payments/errors";

/** Webhook delivery contract (provider-neutral, no Prisma leak). */
export type WebhookDeliveryIdentity = {
  id: string;
  provider: "xendit" | "stripe";
  providerEventId: string;
  type: string;
  connectionId: string | null;
  organizationId: string;
  verificationStatus: "VERIFIED" | "UNVERIFIED" | "INVALID" | "UNCONFIGURED";
  processingStatus: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "DEAD_LETTER";
  attemptCount: number;
};

export const WEBHOOK_DELIVERY_PROVIDERS = ["xendit", "stripe"] as const;

export interface WebhookDeliveryRepository {
  findForEvent(provider: "xendit" | "stripe", providerEventId: string): Promise<WebhookDeliveryIdentity | null>;
}

/** Provider-scoped dedupe key so the same provider event id cannot mutate twice. */
export function webhookDedupeKey(provider: "xendit" | "stripe", providerEventId: string): string {
  return `${provider}:${providerEventId}`;
}

/**
 * A delivery is considered "already accepted" (deduplicated) when a record with
 * the same provider-scoped event id exists in a terminal or processing state.
 * Reproducing the same id does not create a new delivery; it returns the existing one.
 */
export function classifyDuplicateDelivery(existing: WebhookDeliveryIdentity | null): {
  duplicate: boolean;
  reason: string | null;
} {
  if (!existing) {
    return { duplicate: false, reason: null };
  }
  if (existing.verificationStatus === "INVALID") {
    return { duplicate: false, reason: "RECORD_EXISTS_BUT_INVALID" };
  }
  return { duplicate: true, reason: "DUPLICATE_EVENT" };
}

export function assertKnownProvider(provider: string): asserts provider is "xendit" | "stripe" {
  if (!WEBHOOK_DELIVERY_PROVIDERS.includes(provider as "xendit" | "stripe")) {
    throw new RepositoryError("INVALID_TOPOLOGY", `Unknown webhook provider "${provider}"`);
  }
}
