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

/* ---------------------------------------------------------------------- */
/* Durable delivery store (WebhookDelivery table, ADR-0028 / webhook-ingress) */
/*                                                                          */
/* The dedupe key is the provider-scoped event id (`xendit:<id>` /          */
/* `stripe:<id>`), backed by the `@@unique([provider, providerEventId])`    */
/* constraint. `find→insert` with a unique-violation race re-check makes     */
/* the store correct under concurrent delivery, so a retried event can never */
/* double-process.                                                          */
/* ---------------------------------------------------------------------- */

export type WebhookDeliveryRecordInput = {
  provider: "xendit" | "stripe";
  providerEventId: string;
  type: string;
  organizationId: string;
  connectionId?: string | null;
  /** Stored as redacted payload — caller guarantees no secrets (webhook-ingress). */
  payload: unknown;
  verificationStatus?: WebhookDeliveryIdentity["verificationStatus"];
  processingStatus?: WebhookDeliveryIdentity["processingStatus"];
  attemptCount?: number;
};

export type WebhookDeliveryRecordResult = {
  identity: WebhookDeliveryIdentity;
  deduped: boolean;
  created: boolean;
};

export interface WebhookDeliveryStore {
  record(input: WebhookDeliveryRecordInput): Promise<WebhookDeliveryRecordResult>;
  findForEvent(provider: "xendit" | "stripe", providerEventId: string): Promise<WebhookDeliveryIdentity | null>;
  /** True when backed by the durable `WebhookDelivery` table (Prisma/PGlite). */
  isAvailable(): boolean;
}

/** Minimal DB executor so the durable store is testable over the real engine. */
export interface WebhookDeliveryDb {
  findByProviderEvent(provider: string, providerEventId: string): Promise<WebhookDeliveryIdentity | null>;
  insert(input: Required<WebhookDeliveryRecordInput>): Promise<WebhookDeliveryIdentity>;
  available(): boolean;
}

export class DurableWebhookDeliveryStore implements WebhookDeliveryStore {
  constructor(private readonly db: WebhookDeliveryDb) {}

  isAvailable(): boolean {
    return this.db.available();
  }

  findForEvent(provider: "xendit" | "stripe", providerEventId: string): Promise<WebhookDeliveryIdentity | null> {
    return this.db.findByProviderEvent(provider, providerEventId);
  }

  async record(input: WebhookDeliveryRecordInput): Promise<WebhookDeliveryRecordResult> {
    assertKnownProvider(input.provider);
    const existing = await this.db.findByProviderEvent(input.provider, input.providerEventId);
    if (existing) {
      const c = classifyDuplicateDelivery(existing);
      return { identity: existing, deduped: c.duplicate, created: false };
    }
    try {
      const created = await this.db.insert({
        provider: input.provider,
        providerEventId: input.providerEventId,
        type: input.type,
        organizationId: input.organizationId,
        connectionId: input.connectionId ?? null,
        payload: input.payload,
        verificationStatus: input.verificationStatus ?? "VERIFIED",
        processingStatus: input.processingStatus ?? "PENDING",
        attemptCount: input.attemptCount ?? 0,
      });
      return { identity: created, deduped: false, created: true };
    } catch (err) {
      // Race: a concurrent delivery inserted the same provider-scoped event id
      // between our find and insert. Re-read and treat as duplicate.
      const raced = await this.db.findByProviderEvent(input.provider, input.providerEventId);
      if (raced) {
        const c = classifyDuplicateDelivery(raced);
        return { identity: raced, deduped: c.duplicate, created: false };
      }
      throw err;
    }
  }
}

/** Dev/test in-memory store; mirrors the durable dedupe semantics (provider-scoped). */
export class InMemoryWebhookDeliveryStore implements WebhookDeliveryStore {
  private readonly map = new Map<string, WebhookDeliveryIdentity>();
  private counter = 0;

  isAvailable(): boolean {
    return false;
  }

  async findForEvent(provider: "xendit" | "stripe", providerEventId: string): Promise<WebhookDeliveryIdentity | null> {
    return this.map.get(webhookDedupeKey(provider, providerEventId)) ?? null;
  }

  async record(input: WebhookDeliveryRecordInput): Promise<WebhookDeliveryRecordResult> {
    assertKnownProvider(input.provider);
    const key = webhookDedupeKey(input.provider, input.providerEventId);
    const existing = this.map.get(key);
    if (existing) {
      const c = classifyDuplicateDelivery(existing);
      return { identity: existing, deduped: c.duplicate, created: false };
    }
    const identity: WebhookDeliveryIdentity = {
      id: `webhook_${++this.counter}`,
      provider: input.provider,
      providerEventId: input.providerEventId,
      type: input.type,
      connectionId: input.connectionId ?? null,
      organizationId: input.organizationId,
      verificationStatus: input.verificationStatus ?? "VERIFIED",
      processingStatus: input.processingStatus ?? "PENDING",
      attemptCount: input.attemptCount ?? 0,
    };
    this.map.set(key, identity);
    return { identity, deduped: false, created: true };
  }
}
