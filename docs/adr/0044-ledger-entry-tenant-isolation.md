# ADR-0044: Ledger entry tenant isolation — column + RLS, enforced through a dedicated `pg` path

Date: 2026-09-13
Status: **Proposed** (plan reviewed before code lands; flip to Accepted on implementation)

## Context

Every tenant-scoped model (`CanonicalPayment`, `CanonicalCustomer`, `PayoutBatch`, …) carries
`organizationId` + `@@unique([id, organizationId])`, but `LedgerEntry` — the money ledger itself —
does not (debt **D-26**, P0). Consequences, already enforced in code:

- `server/dal/ledger.ts` throws on every entry point (`requireTenantBoundLedger`) rather than serve
  an unscoped read of the money table.
- `server/mcp/pg-stores.ts#getBalanceOverviewPostgres` still aggregates the table with **no**
  organization predicate — the one live unscoped read (owned by Wave 7B, cited D-26).
- `transactions-structural.test.ts` (S-6) fails CI if any server module reads `prisma.ledgerEntry.*`
  without citing D-26, so the seam cannot be re-opened quietly.

The application-layer `where: { organizationId }` fix alone is necessary but not sufficient: the
same "a function cannot be made safe by asking callers to remember a `where`" argument that drove
Wave 7A points to **Row-Level Security** as the database-level backstop that a forgotten predicate
cannot bypass.

## Decision

1. **Add `organizationId` to `LedgerEntry`** + `@@unique([id, organizationId])` +
   `@@index([organizationId, createdAt])`; backfill from `OrganizationMember`/`userId`. Rows with
   no attributable membership stay `NULL` and are therefore invisible (fail-closed), matching the
   `"unresolved"` webhook convention.
2. **Enable RLS** — `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` (so the table owner
   is not exempt) + a policy
   `USING ("organizationId" = current_setting('app.org_id', true))` / `WITH CHECK (…)`. The `true`
   makes a missing context return `NULL` → the predicate is false → **zero rows**, so an unattributed
   connection leaks nothing.
3. **Drive the tenant context through a dedicated `pg` (node-postgres) pool**, not Prisma. Prisma
   cannot run `SET` (prisma/prisma#4303) and its pooled connections are opaque; `set_config` is
   per-connection, so it must be issued on the same connection that runs the query. A small
   `pg` pool with a `withTenantLedger(ctx, fn)` helper opens a transaction, runs
   `SELECT set_config('app.org_id', $1, true)` (transaction-local — the pool-leak-safe form of
   `SET LOCAL`), executes, and commits/rolls back.
4. **Re-open `server/dal/ledger.ts`** on that path: parameterized SQL that also carries the
   explicit `organizationId` predicate (defense in depth: RLS is the backstop, the `where` is the
   documentation of intent).
5. **Bind MCP tokens to an organization** in runtime settings so `resolveMcpOrganization` stops
   returning `null` and the MCP ledger tools can be restored tenant-scoped.

## Consequences

- Good: the last unscoped money path becomes isolated at two layers (RLS + app predicate); the
  "no context → zero rows" default makes pooling and misconfiguration fail closed; the S-6 ratchet
  is satisfied by scoped reads instead of refusals.
- Bad: a second Postgres driver (`pg`) alongside Prisma — a small, clearly-bounded surface (one
  pool + one helper + the reopened DAL), not a general-purpose client.

## Alternatives

- **Stay on Prisma** with `prisma.$transaction([$executeRawUnsafe('SELECT set_config(...)'), query])`
  or a client extension per query: rejected as the default — it works but is clunkier on every
  tenant query, and the user chose the dedicated `pg` path.
- **`postgres.js`** instead of `pg`: viable; `pg` chosen as the canonical, best-documented minimal
  client.
- **Application-layer `where` only, defer RLS**: rejected — that reproduces the exact single-layer
  trust Wave 7A was built to remove.

## Verification (planned)

Migration + backfill tested against a real Postgres; DAL reopen covered by isolation + structural
tests (extend S-6); RLS proven by a mutation/negative test that a query with no `app.org_id`
returns zero rows and a `set_config` to org B returns only B's rows; MCP binding tested tenant-bound.
See `WAVE_7D_LEDGER_TENANT_ISOLATION_SPEC.md`.
