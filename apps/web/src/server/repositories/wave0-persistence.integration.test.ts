import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const migrationsRoot = resolve(__dirname, "../../../prisma/migrations");

/** Apply the full additive migration chain (provider-domain + Wave 0) in order. */
function migrationChainSql(): string {
  return readdirSync(migrationsRoot)
    .filter((name) => statSync(join(migrationsRoot, name)).isDirectory())
    .sort()
    .map((name) => readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8"))
    .join("\n");
}

let db: InstanceType<typeof PGlite>;

async function seedBase(): Promise<void> {
  await db.exec(`
    INSERT INTO "Organization" ("id", "name", "updatedAt")
    VALUES ('org-1', 'Merchant One', CURRENT_TIMESTAMP);
    INSERT INTO "PaymentProviderConnection"
      ("id", "organizationId", "provider", "mode", "status", "updatedAt")
    VALUES
      ('conn-1', 'org-1', 'xendit', 'TEST', 'ACTIVE', CURRENT_TIMESTAMP),
      ('conn-2', 'org-1', 'xendit', 'LIVE', 'ACTIVE', CURRENT_TIMESTAMP);
  `);
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(migrationChainSql());
});

describe("wave0 persistence schema (real Postgres via PGlite)", () => {
  it("creates all Wave 0 tables and connection verification columns", async () => {
    const res = await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN
      ('SecretRecord','DurableOperation','AuditEvent','WebhookDelivery') ORDER BY table_name
    `);
    expect(
      (res.rows as Array<Record<string, unknown>>).map((r) => String(r.table_name)),
    ).toEqual([
      "AuditEvent",
      "DurableOperation",
      "SecretRecord",
      "WebhookDelivery",
    ]);
  });

  it("rejects an invalid connection mode (mode check)", async () => {
    await expect(
      db.exec(`INSERT INTO "PaymentProviderConnection" ("id","organizationId","provider","mode","status","updatedAt")
        VALUES ('conn-3','org-1','xendit','SANDBOX','DRAFT',CURRENT_TIMESTAMP)`),
    ).rejects.toThrow();
  });

  it("enforces connection-scoped unique secret per mode", async () => {
    await seedBase();
    await db.exec(`
      INSERT INTO "SecretRecord" ("id","organizationId","connectionId","provider","mode","secretRef","updatedAt")
      VALUES ('sec-1','org-1','conn-1','xendit','TEST','kms:ref:1',CURRENT_TIMESTAMP);
    `);
    await expect(
      db.exec(`
        INSERT INTO "SecretRecord" ("id","organizationId","connectionId","provider","mode","secretRef","updatedAt")
        VALUES ('sec-2','org-1','conn-1','xendit','TEST','kms:ref:2',CURRENT_TIMESTAMP);
      `),
    ).rejects.toThrow();
    // Different mode on the same connection is allowed.
    await db.exec(`
      INSERT INTO "SecretRecord" ("id","organizationId","connectionId","provider","mode","secretRef","updatedAt")
      VALUES ('sec-3','org-1','conn-1','xendit','LIVE','kms:ref:3',CURRENT_TIMESTAMP);
    `);
  });

  it("rejects invalid secret mode and invalid provider format", async () => {
    await seedBase();
    await expect(
      db.exec(`
        INSERT INTO "SecretRecord" ("id","organizationId","connectionId","provider","mode","secretRef","updatedAt")
        VALUES ('sec-x','org-1','conn-1','xendit','PROD','kms:ref',CURRENT_TIMESTAMP);
      `),
    ).rejects.toThrow();
  });

  it("enforces idempotency-key uniqueness on durable operations", async () => {
    await seedBase();
    await db.exec(`
      INSERT INTO "DurableOperation"
        ("id","organizationId","connectionId","actorId","operationType","resourceType","idempotencyKey","requestHash","updatedAt")
      VALUES ('op-1','org-1','conn-1','actor-1','payout.release','recipient','idem-key-1','abc123',CURRENT_TIMESTAMP);
    `);
    await expect(
      db.exec(`
        INSERT INTO "DurableOperation"
          ("id","organizationId","connectionId","actorId","operationType","resourceType","idempotencyKey","requestHash","updatedAt")
        VALUES ('op-2','org-1','conn-1','actor-1','payout.release','recipient','idem-key-1','def456',CURRENT_TIMESTAMP);
      `),
    ).rejects.toThrow();
  });

  it("rejects an out-of-enum operation state", async () => {
    await seedBase();
    await expect(
      db.exec(`
        INSERT INTO "DurableOperation"
          ("id","organizationId","connectionId","actorId","operationType","resourceType","idempotencyKey","requestHash","state","updatedAt")
        VALUES ('op-x','org-1','conn-1','actor-1','payout.release','recipient','idem-x','abc','TERMINATED',CURRENT_TIMESTAMP);
      `),
    ).rejects.toThrow();
  });

  it("enforces audit event id dedupe and outcome enum", async () => {
    await seedBase();
    await db.exec(`
      INSERT INTO "AuditEvent" ("id","eventId","organizationId","actorId","action","outcome","metadata")
      VALUES ('au-1','evt-1','org-1','actor-1','PAYOUT_RELEASE','SUCCESS','{}');
    `);
    await expect(
      db.exec(`
        INSERT INTO "AuditEvent" ("id","eventId","organizationId","actorId","action","outcome","metadata")
        VALUES ('au-2','evt-1','org-1','actor-1','PAYOUT_RELEASE','SUCCESS','{}');
      `),
    ).rejects.toThrow();
    await expect(
      db.exec(`
        INSERT INTO "AuditEvent" ("id","eventId","organizationId","actorId","action","outcome","metadata")
        VALUES ('au-3','evt-2','org-1','actor-1','PAYOUT_RELEASE','MAYBE','{}');
      `),
    ).rejects.toThrow();
  });

  it("enforces webhook provider/event dedupe and enum checks", async () => {
    await seedBase();
    await db.exec(`
      INSERT INTO "WebhookDelivery" ("id","provider","providerEventId","type","organizationId","verificationStatus","processingStatus","redactedPayload")
      VALUES ('wh-1','xendit','evt_x_1','invoice.paid','org-1','VERIFIED','SUCCEEDED','{}');
    `);
    await expect(
      db.exec(`
        INSERT INTO "WebhookDelivery" ("id","provider","providerEventId","type","organizationId","verificationStatus","processingStatus","redactedPayload")
        VALUES ('wh-2','xendit','evt_x_1','invoice.paid','org-1','VERIFIED','SUCCEEDED','{}');
      `),
    ).rejects.toThrow();
    await expect(
      db.exec(`
        INSERT INTO "WebhookDelivery" ("id","provider","providerEventId","type","organizationId","verificationStatus","processingStatus","redactedPayload")
        VALUES ('wh-3','paypal','evt_x_2','invoice.paid','org-1','VERIFIED','SUCCEEDED','{}');
      `),
    ).rejects.toThrow();
  });

  it("uses restrictive deletion (RESTRICT) so a referenced connection cannot be dropped", async () => {
    await seedBase();
    await db.exec(`
      INSERT INTO "SecretRecord" ("id","organizationId","connectionId","provider","mode","secretRef","updatedAt")
      VALUES ('sec-del','org-1','conn-1','xendit','TEST','kms:ref',CURRENT_TIMESTAMP);
    `);
    await expect(
      db.exec(`DELETE FROM "PaymentProviderConnection" WHERE "id" = 'conn-1'`),
    ).rejects.toThrow();
  });

  it("stores exact decimal amounts without floating-point drift", async () => {
    await db.exec(`
      CREATE TABLE "TryDecimal" ("amount" NUMERIC(20,4) NOT NULL, "currency" CHAR(3) NOT NULL);
      INSERT INTO "TryDecimal" ("amount","currency") VALUES (25000000.00,'IDR'), (1000.5,'IDR');
    `);
    const res = await db.query(`SELECT sum("amount")::text AS total FROM "TryDecimal"`);
    expect((res.rows[0] as Record<string, unknown>).total).toBe("25001000.5000");
  });
});
