# Wave 7D — Ledger Entry Tenant Isolation (Spec)

Date: 2026-09-13 · Branch: `arena/01a0997a-pay-dash` (Wave 7C committed) · Predecessors: Wave 7A (Transactions), 7B (Payouts), 7C (Customers)
Status: **Proposed** · Follows ADR-0041/0042/0043 · Decision: ADR-0044
Scope: close debt **D-26** (P0) — `LedgerEntry` tenant isolation at the database layer.

---

## 0. Why this is the last big slice

Wave 7A–7C scoped the in-memory dashboard surfaces (transactions, payouts, customers). The Postgres
ledger was deliberately *refused*, not scoped: `LedgerEntry` has no `organizationId`, so
`server/dal/ledger.ts` throws on every entry point and `pg-stores.ts#getBalanceOverviewPostgres`
still aggregates the table unscoped. This spec lands the column, backfills it, re-opens the DAL
tenant-scoped, and adds Row-Level Security as the database backstop.

## 1. Invariant

> Organization A cannot read, write, aggregate, or export a `LedgerEntry` row belonging to
> Organization B — even with raw SQL, a forgotten `where`, or a pooled connection that carried
> another tenant's context. A connection with no tenant context returns **zero rows**, never all rows.

## 2. Gaps (file:line, checkout `52db029`)

- **L-1** `prisma/schema.prisma:75` — `LedgerEntry` has no `organizationId`; every other
  tenant-scoped model does.
- **L-2** `server/dal/ledger.ts:31` — `requireTenantBoundLedger()` throws on
  `createLedgerEntry` / `listLedgerEntries` / `getLedgerEntryByReferenceId`.
- **L-3** `server/mcp/pg-stores.ts:41` — `getBalanceOverviewPostgres()` runs
  `prisma.ledgerEntry.findMany({ select: { amount, status, currency } })` with **no** organization
  predicate — the live unscoped read of the money table.
- **L-4** `server/mcp/auth.ts:46` — `resolveMcpOrganization()` returns `null` (no per-token tenant
  binding), so the MCP ledger tools stay refused even after the column lands.
- **L-5** No `pg` (node-postgres) driver is installed; `DATABASE_URL` is consumed only by Prisma.

## 3. Migration (draft — review before applying)

New migration `apps/web/prisma/migrations/20260913000000_add_ledger_entry_organization/migration.sql`
(Prisma raw-SQL style, quoted identifiers, `id`/`organizationId` are `TEXT` cuids — **no `::uuid`**):

```sql
-- 1. Column (nullable first; backfill then tighten in a later migration if desired)
ALTER TABLE "LedgerEntry" ADD COLUMN "organizationId" TEXT;

-- 2. Backfill from membership (the only attribution the ledger has is userId)
UPDATE "LedgerEntry" le
SET "organizationId" = om."organizationId"
FROM "OrganizationMember" om
WHERE le."userId" = om."userId"
  AND le."organizationId" IS NULL;

-- Rows with no userId, or no membership, stay NULL → invisible under RLS (fail-closed).

-- 3. FK + composite unique + leading-tenant index
ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "LedgerEntry_id_organizationId_key" ON "LedgerEntry"("id", "organizationId");
CREATE INDEX "LedgerEntry_organizationId_createdAt_idx" ON "LedgerEntry"("organizationId", "createdAt");

-- 4. Row-Level Security (the backstop)
ALTER TABLE "LedgerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LedgerEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "LedgerEntry_tenant_isolation" ON "LedgerEntry"
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));
```

Prisma schema change on `LedgerEntry`:

```prisma
organizationId String?  // null = unattributed, invisible under RLS
organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: Restrict)

@@unique([id, organizationId])
@@index([organizationId, createdAt])
```

Notes / open items for review:
- **`NULL` vs `NOT NULL`**: spec goes nullable (fail-closed on unattributed rows); a follow-up
  migration can tighten to `NOT NULL` once backfill coverage is measured (`SELECT count(*) FROM
  "LedgerEntry" WHERE "organizationId" IS NULL`).
- **App role**: the migration must also ensure the runtime DB role is not `SUPERUSER`/`BYPASSRLS`
  and has `row_security = on` (else RLS is decorative). Env already uses a least-privilege
  `paydash_app` role per `.env.gcp.example` — verify its attributes in the GCP migration path.
- **`pg-stores.ts#getBalanceOverviewPostgres`**: after RLS, this aggregate is auto-scoped *only if*
  `app.org_id` is set on the Prisma connection — which it is not. It must be rewritten to the
  tenant-scoped path (see §5) or removed; it is the one reader the column alone does not fix.

## 4. Runtime tenant context — `pg` pool + helper (draft)

Add `pg` (node-postgres) as a dependency. One small pool, one helper:

```ts
// server/dal/tenant-pg.ts (new)
import { Pool, type PoolClient } from "pg";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

export async function withTenantLedger<T>(
  ctx: OrganizationContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const { organizationId } = parseOrganizationContext(ctx);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // transaction-local (is_local=true): auto-resets at COMMIT/ROLLBACK — safe under pooling
    await client.query("SELECT set_config('app.org_id', $1, true)", [organizationId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
```

Pooling rule (the #1 footgun, per RLS literature): **never** a bare session `SET`; always
`set_config(..., true)` inside `BEGIN`/`COMMIT`.

## 5. Re-open `server/dal/ledger.ts`

Rewrite the three entry points on `withTenantLedger`, each with the explicit predicate *and* under
RLS (defense in depth):

- `createLedgerEntry(ctx, input)` → `INSERT ... (organizationId, userId, amount, ...) VALUES ($1, …)`.
- `listLedgerEntries(ctx, { userId?, take })` → `SELECT ... WHERE "organizationId" = $1 … ORDER BY
  "createdAt" DESC LIMIT $2`.
- `getLedgerEntryByReferenceId(ctx, referenceId)` → `SELECT ... WHERE "organizationId" = $1 AND
  "referenceId" = $2`.

`pg-stores.ts#getBalanceOverviewPostgres(ctx)` takes a context and aggregates through the same path.
Update `transactions-structural.test.ts` (S-6) so the scoped read is the accepted state (the refusal
list shrinks to zero; the scoped readers cite D-26 no longer as a refusal but as "landed").

## 6. MCP token binding (L-4)

Add an `mcpOrganizationId` (or a token → org map) to `runtime-settings`; `resolveMcpOrganization`
returns `parseOrganizationContext({ organizationId })` when configured, else `null` (fail-closed).
Restore the MCP transaction/ledger tools scoped to that context; keep the "no tenant ⇒ refuse"
behaviour for unconfigured deployments.

## 7. Tests (planned, all green before close)

- **Migration/backfill**: unit/verify a real Postgres: `organizationId` populated from membership,
  NULL rows invisible, RLS + `FORCE` in place, policy present.
- **RLS negative tests** (the security proof): a `pg` query with **no** `app.org_id` returns 0 rows;
  `set_config` to org B returns only B's rows; a `set_config`-less pooled connection leaks nothing.
- **DAL isolation**: foreign id read → empty; foreign write → rejected (RLS `WITH CHECK`).
- **Structural (extend S-6)**: no server module reads `prisma.ledgerEntry.*` unscoped; the DAL's
  predicate is the documented scoped path.
- **MCP**: tenant-bound ledger tools + null-refusal.
- **Regression**: full suite green (currently 1489/2 pre-existing flakes), typecheck clean,
  lint 0/40.

## 8. Plan Q0..Q6

Q0 this spec (done) → **Q1 migration + backfill DONE**
(`prisma/migrations/20260913000000_add_ledger_entry_organization/migration.sql` + `schema.prisma`
`LedgerEntry.organizationId`/`@@unique`/`@@index` + `Organization.ledgerEntries`) → **Q2 `pg`
dependency + pool/helper DONE** (`pg@^8.23.0` + `@types/pg@^8.23.1`, `server/dal/tenant-pg.ts`
with `withTenantLedger` + `__setTenantPoolFactory` seam, `tenant-pg.test.ts` 4/4) → Q3 DAL reopen +
`pg-stores` scope → Q4 MCP token binding + ledger tools → Q5 RLS negative + isolation + structural
tests → Q6 report + matrix + ADR flip to Accepted + D-26 close in `KNOWN_DEBT_REGISTER.md`.
