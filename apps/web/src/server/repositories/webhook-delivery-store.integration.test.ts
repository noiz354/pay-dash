import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

import {
  DurableWebhookDeliveryStore,
  type WebhookDeliveryDb,
  type WebhookDeliveryIdentity,
  type WebhookDeliveryRecordInput,
} from "./webhook-deliveries";

const migrationsRoot = resolve(__dirname, "../../../prisma/migrations");

function migrationChainSql(): string {
  return readdirSync(migrationsRoot)
    .filter((name) => statSync(join(migrationsRoot, name)).isDirectory())
    .sort()
    .map((name) => readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8"))
    .join("\n");
}

/** Raw-SQL executor driving the durable store against real Postgres (PGlite). */
class PGliteWebhookDeliveryDb implements WebhookDeliveryDb {
  constructor(private readonly db: InstanceType<typeof PGlite>) {}

  available(): boolean {
    return true;
  }

  async findByProviderEvent(provider: string, providerEventId: string): Promise<WebhookDeliveryIdentity | null> {
    const res = await this.db.query(
      `SELECT "id","provider","providerEventId","type","connectionId","organizationId",
              "verificationStatus","processingStatus","attemptCount"
         FROM "WebhookDelivery"
        WHERE "provider" = $1 AND "providerEventId" = $2`,
      [provider, providerEventId],
    );
    const row = res.rows?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      provider: row.provider as "xendit" | "stripe",
      providerEventId: String(row.providerEventId),
      type: String(row.type),
      connectionId: (row.connectionId as string | null) ?? null,
      organizationId: String(row.organizationId),
      verificationStatus: row.verificationStatus as WebhookDeliveryIdentity["verificationStatus"],
      processingStatus: row.processingStatus as WebhookDeliveryIdentity["processingStatus"],
      attemptCount: Number(row.attemptCount ?? 0),
    };
  }

  async insert(input: Required<WebhookDeliveryRecordInput>): Promise<WebhookDeliveryIdentity> {
    const res = await this.db.query(
      `INSERT INTO "WebhookDelivery"
        ("id","provider","providerEventId","type","connectionId","organizationId",
         "verificationStatus","processingStatus","attemptCount","redactedPayload")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING "id","provider","providerEventId","type","connectionId","organizationId",
                 "verificationStatus","processingStatus","attemptCount"`,
      [
        `wh_${Math.random().toString(36).slice(2, 10)}`,
        input.provider,
        input.providerEventId,
        input.type,
        input.connectionId ?? null,
        input.organizationId,
        input.verificationStatus,
        input.processingStatus,
        input.attemptCount,
        JSON.stringify(input.payload),
      ],
    );
    const row = res.rows?.[0] as Record<string, unknown>;
    return {
      id: String(row.id),
      provider: row.provider as "xendit" | "stripe",
      providerEventId: String(row.providerEventId),
      type: String(row.type),
      connectionId: (row.connectionId as string | null) ?? null,
      organizationId: String(row.organizationId),
      verificationStatus: row.verificationStatus as WebhookDeliveryIdentity["verificationStatus"],
      processingStatus: row.processingStatus as WebhookDeliveryIdentity["processingStatus"],
      attemptCount: Number(row.attemptCount ?? 0),
    };
  }
}

let db: InstanceType<typeof PGlite>;
let store: DurableWebhookDeliveryStore;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(migrationChainSql());
  store = new DurableWebhookDeliveryStore(new PGliteWebhookDeliveryDb(db));
});

const base = (overrides: Partial<WebhookDeliveryRecordInput> = {}): WebhookDeliveryRecordInput => ({
  provider: "xendit",
  providerEventId: "evt_001",
  type: "payment.succeeded",
  organizationId: "org-1",
  payload: { id: "txn_1", status: "settle", amount: 5_000_000, currency: "IDR" },
  ...overrides,
});

describe("durable webhook delivery store (real Postgres via PGlite)", () => {
  it("records a delivery on the first observation and classifies it as created", async () => {
    const result = await store.record(base());
    expect(result.created).toBe(true);
    expect(result.deduped).toBe(false);
    expect(result.identity.provider).toBe("xendit");
    expect(result.identity.providerEventId).toBe("evt_001");
    expect(result.identity.verificationStatus).toBe("VERIFIED");
    expect(result.identity.processingStatus).toBe("PENDING");
  });

  it("dedupes a replayed provider event id (find→existing, not a second row)", async () => {
    const first = await store.record(base());
    const second = await store.record(base());
    expect(second.deduped).toBe(true);
    expect(second.created).toBe(false);
    expect(second.identity.id).toBe(first.identity.id);

    const count = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM "WebhookDelivery"`);
    expect(Number(count.rows[0].n)).toBe(1);
  });

  it("does not collide across providers with the same event id", async () => {
    await store.record(base({ provider: "xendit", providerEventId: "evt_shared" }));
    const stripe = await store.record(base({ provider: "stripe", providerEventId: "evt_shared", type: "charge.succeeded" }));
    expect(stripe.created).toBe(true);
    expect(stripe.deduped).toBe(false);
    expect(stripe.identity.provider).toBe("stripe");
  });

  it("raises on an unknown provider (fail closed)", async () => {
    await expect(store.record(base({ provider: "paypal" as never }))).rejects.toThrow();
  });

  it("exposes a durable (isAvailable) backend", () => {
    expect(store.isAvailable()).toBe(true);
  });
});
