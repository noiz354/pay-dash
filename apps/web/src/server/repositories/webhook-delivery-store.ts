import "server-only";

import {
  DurableWebhookDeliveryStore,
  InMemoryWebhookDeliveryStore,
  webhookDedupeKey,
  type WebhookDeliveryDb,
  type WebhookDeliveryIdentity,
  type WebhookDeliveryRecordInput,
  type WebhookDeliveryStore,
} from "./webhook-deliveries";

/** Prisma-backed executor for the durable `WebhookDelivery` table. */
export class PrismaWebhookDeliveryDb implements WebhookDeliveryDb {
  constructor(private readonly prisma: { webhookDelivery: unknown }) {}

  available(): boolean {
    // The Prisma client only exists after `prisma generate`; construction of
    // the client throws otherwise, so this executor is only ever built when the
    // module imported successfully.
    return true;
  }

  async findByProviderEvent(provider: string, providerEventId: string): Promise<WebhookDeliveryIdentity | null> {
    const client = this.prisma.webhookDelivery as {
      findUnique(args: { where: { provider_providerEventId: { provider: string; providerEventId: string } } }): Promise<Record<string, unknown> | null>;
    };
    const row = await client.findUnique({
      where: { provider_providerEventId: { provider, providerEventId } },
    });
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async insert(input: Required<WebhookDeliveryRecordInput>): Promise<WebhookDeliveryIdentity> {
    const client = this.prisma.webhookDelivery as {
      create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>>;
    };
    const row = await client.create({
      data: {
        provider: input.provider,
        providerEventId: input.providerEventId,
        type: input.type,
        connectionId: input.connectionId ?? null,
        organizationId: input.organizationId,
        verificationStatus: input.verificationStatus,
        processingStatus: input.processingStatus,
        attemptCount: input.attemptCount,
        redactedPayload: input.payload,
      },
    });
    return mapRow(row as Record<string, unknown>);
  }
}

/** Prisma row → provider-neutral identity (no SDK/Prisma model leak). */
function mapRow(row: Record<string, unknown>): WebhookDeliveryIdentity {
  return {
    id: String(row.id),
    provider: (row.provider as "xendit" | "stripe"),
    providerEventId: String(row.providerEventId),
    type: String(row.type),
    connectionId: (row.connectionId as string | null) ?? null,
    organizationId: String(row.organizationId),
    verificationStatus: row.verificationStatus as WebhookDeliveryIdentity["verificationStatus"],
    processingStatus: row.processingStatus as WebhookDeliveryIdentity["processingStatus"],
    attemptCount: Number(row.attemptCount ?? 0),
  };
}

let cached: WebhookDeliveryStore | null = null;

/**
 * Build the webhook delivery store. Returns the durable Prisma-backed store
 * when the Prisma client is usable (after `prisma generate` + a live DB);
 * otherwise falls back to an in-memory store (dev/test). Falls back by loading
 * Prisma lazily so an uninitialized client never crashes an unrelated request.
 */
export async function buildWebhookDeliveryStore(): Promise<WebhookDeliveryStore> {
  if (cached) {
    return cached;
  }
  const durable = await tryBuildDurableStore();
  cached = durable ?? new InMemoryWebhookDeliveryStore();
  return cached;
}

async function tryBuildDurableStore(): Promise<WebhookDeliveryStore | null> {
  try {
    const mod = await import("@/lib/db/prisma");
    const prisma = mod.prisma ?? mod.default;
    if (!prisma?.webhookDelivery) {
      return null;
    }
    return new DurableWebhookDeliveryStore(new PrismaWebhookDeliveryDb(prisma));
  } catch {
    // `prisma generate` not run / engine unavailable → keep in-memory dev store.
    return null;
  }
}

/** Provider-scoped dedupe key derived for a delivery record (for tests/logs). */
export function deliveryDedupeKey(provider: "xendit" | "stripe", providerEventId: string): string {
  return webhookDedupeKey(provider, providerEventId);
}
