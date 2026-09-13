-- Wave 7D (Q1) — LedgerEntry tenant isolation (debt D-26, P0).
--
-- Adds the `organizationId` column that every other tenant-scoped model already
-- carries, backfills it from the only attribution the ledger has (userId →
-- OrganizationMember), and lands Row-Level Security so a forgotten `where` (or a
-- pooled connection that carried another tenant's context) cannot read or write
-- the money ledger unscoped.
--
-- Companion Prisma schema change: `LedgerEntry.organizationId String?` +
-- `organization Organization? @relation(... onDelete: Restrict)` +
-- `@@unique([id, organizationId])` + `@@index([organizationId, createdAt])`,
-- and `Organization.ledgerEntries LedgerEntry[]`.

-- 1. Column (nullable first — rows with no attributable membership stay NULL,
--    which RLS makes invisible; a follow-up migration tightens to NOT NULL once
--    backfill coverage is measured).
ALTER TABLE "LedgerEntry" ADD COLUMN "organizationId" TEXT;

-- 2. Backfill from membership. `organization_member` is unique on
--    (organizationId, userId), so a user belongs to exactly one organization and
--    the join is unambiguous. Rows with no userId, or a userId with no
--    membership, remain NULL (fail-closed, matching the "unresolved" convention).
UPDATE "LedgerEntry" le
SET "organizationId" = om."organizationId"
FROM "organization_member" om
WHERE le."userId" = om."userId"
  AND le."organizationId" IS NULL;

-- 3. Foreign key + composite unique + leading-tenant index (RLS performance).
ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "LedgerEntry_id_organizationId_key" ON "LedgerEntry"("id", "organizationId");
CREATE INDEX "LedgerEntry_organizationId_createdAt_idx" ON "LedgerEntry"("organizationId", "createdAt");

-- 4. Row-Level Security (the backstop). `FORCE` applies RLS even to the table
--    owner; `current_setting('app.org_id', true)` returns NULL when unset so the
--    predicate is false → zero rows (fail-closed), never all rows.
--
--    The application role that runs tenant queries MUST be neither SUPERUSER nor
--    BYPASSRLS and should have `row_security = on`. The runtime connection uses
--    `SELECT set_config('app.org_id', $1, true)` inside a transaction (the
--    pool-leak-safe form of SET LOCAL); see server/dal/tenant-pg.ts.
ALTER TABLE "LedgerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LedgerEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "LedgerEntry_tenant_isolation" ON "LedgerEntry"
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));
