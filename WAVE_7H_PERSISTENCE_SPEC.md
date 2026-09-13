# Wave 7H — Persistence Hardening: Tenant Column, RLS & Analytics Dimension (Spec)

Date: 2026-09-13 · Branch: `wave-7d-derived-scoping` (main@a4b595a, Waves 7A–7G done or Proposed)
Predecessors: 7A Transactions, 7B Payouts+Refunds, 7C Customers, 7D Billing, 7E Derived, 7F Identity, 7G Ingest (Proposed where noted)
Status: **Proposed** · Follows ADR-0041/0042/0043 · Closes **D-26** (P0) and **D-27** (P2)

---

## 0. Runtime baseline (measured, not carried over)

| Gate | Result 2026-09-13 |
|---|---|
| Full suite | **1472 passed / 17 failed** (15 pre-existing env `DATABASE_URL` unset + 2 pre-existing calendar flakes) |
| Typecheck | clean · Lint 0 errors / 40 warnings (== D-17) |
| Probe matrix | 0 GAPs — Q1 *adds* persistence GAP pins (Postgres read refused ⇒ still refused; analytics event without org dimension ⇒ rejected), Q5 closes them |

## 1. Invariant

> Tenancy is enforced by the database, not just by application code. Every `LedgerEntry`
> row carries its owner; Postgres returns only the caller's rows under RLS even if every
> application predicate is removed; analytics events carry a tenant dimension so per-tenant
> SLO attribution is possible without ever shipping a raw organization id to the wire.

## 2. Contract reuse (C-1..C-7, unchanged — now with a second enforcer)

`OrganizationContext` required-first everywhere as before; additionally the database refuses
what the application must not ask for. RLS policy: `organization_id = current_setting('app.org_id')`.
Application sets `app.org_id` per request from the resolved ctx; the setting is never taken
from browser input. Analytics `org` dimension is the *hashed* org id (never raw), routed
through the allowlisted `trackEvent` catalog.

## 3. Gaps (file:line evidence, checkout `a4b595a`)

- **P-1** `prisma/schema.prisma:75` — `LedgerEntry` has no `organizationId` column (D-26):
  migration adds `organizationId` + `@@unique([id, organizationId])` +
  `@@index([organizationId, createdAt])`, backfills from `OrganizationMember`/`userId`.
- **P-2** `server/dal/ledger.ts:42-82` — every entry point *refuses* (`requireTenantBoundLedger`);
  re-open with `where: { organizationId }` on all three functions once P-1 lands (the fix is
  "add the column", never "re-thread call sites" — signatures are already tenant-explicit).
- **P-3** RLS policies on `LedgerEntry` (+ every tenant-owned table the migration touches —
  enumerate at Q2): `CREATE POLICY … USING (organization_id = current_setting('app.org_id'))`;
  app sets `app.org_id` per request; direct SQL without the setting returns 0 rows (pinned).
- **P-4** `server/mcp/pg-stores.ts` (`getBalanceOverviewPostgres`) + `dataSource=postgres`
  MCP paths — re-open tenant-scoped under RLS once P-1..P-3 land (still refused until then).
- **P-5** `lib/analytics.ts#track()` vs allowlisted `trackEvent()`: transaction components
  bypass the catalog (D-27); route them through `trackEvent` with catalog entries.
- **P-6** No `org` dimension on analytics events: add hashed org id to the allowlisted prop
  set; assert the allowlist in `analytics-events.test.ts` (raw org id on the wire ⇒ red).
- **P-7** Backfill audit: every pre-migration row must resolve to exactly one org; orphans
  are reported (count + ids in migration output), never defaulted to demo.
- **P-8** Prisma-engines red file (`mcp/server.integration.test.ts` — pre-existing per 7A
  report) must be re-checked: if it greens under the org-aware schema, close it; if not,
  carry it explicitly.
- **P-9** Pages/actions: no direct changes expected (DAL signatures already tenant-explicit
  since 7A) — verify at Q2 that no caller needs re-threading.
- **P-10** Design decision — defense in depth, stated plainly: after 7H the partition
  predicate (7A), the owner filter (7B finding), AND the RLS policy must all agree. The Q6
  RLS-bypass mutation (direct query without `app.org_id`) proves the third layer is real:
  0 rows, not an error — unreachable data, not shared data.

## 4. Quarantine design (none — this wave removes refusals, not readers)

No quarantine modules. `server/dal/ledger.ts` refusals are *replaced* by scoped queries
(the S-6 structural test is updated at Q2 to assert `where: { organizationId }` presence
instead of refusal presence — the ratchet flips direction, documented here so the flip
reads as intentional). D-26/D-27 rows in `KNOWN_DEBT_REGISTER.md` close in Q7.

## 5. Tests

- **H-1..H-8** persistence: migration applies cleanly on a seeded DB; backfill attributes
  every row (orphan report asserted); RLS returns only the set org's rows; direct query
  without `app.org_id` returns 0 rows; `createLedgerEntry`/`listLedgerEntries`/
  `getLedgerEntryByReferenceId` scope by ctx; Postgres MCP balance overview scoped;
  analytics event carries hashed (never raw) org; catalog allowlist rejects raw org id.
- **H-9** composite uniqueness: same invoice/ledger id in two orgs coexists; duplicate id
  in one org is rejected by the database (not just the app).
- **HS-1..HS-3** structural: S-6 flip (refusal → scoped-query assertion), RLS policy files
  present and referencing `app.org_id`, analytics catalog entries carry the hashed org prop.
- Probe: persistence GAP tests added in Q1, flipped to PASS in Q5 (gaps stay 0 — these pins
  assert the *new* enforcer, not a new leak).

## 6. Plan Q0..Q7 (serial, same gates; migration runs in Q2 behind a flag if needed)

Q0 spec (this doc) → Q1 failing test files (DB-gated tests skip-cleanly without
`DATABASE_URL`, red-with-DB for missing scoping) → Q2 migration + backfill + RLS + DAL
re-open + analytics routing → Q3 (folded: legacy tests) → Q4 MCP postgres paths + export
verification → Q5 probe final + full gates (incl. integration file re-check P-8) → Q6
8 mutations (drop RLS policy, unset app.org_id, backfill-to-demo, raw org id event,
bypass-catalog track, remove where-clause, duplicate-id same-org, postgres-tool without
org) → Q7 report + matrix + ADR + close D-26/D-27 + commit one slice.
