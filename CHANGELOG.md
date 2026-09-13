# Changelog

All notable changes. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: SemVer once `apps/web` ships (prototype is `0.x`).

## [Unreleased]

### Added
- **Wave 7B — Payouts + Refunds tenant isolation** (ADR-0042). Tenant-partitioned payout DAL
  (`server/data/payouts.ts`: `organizationId` + `createdBy`, ctx-first reads/writes/mutations,
  per-org settings/bank, dual-control after the tenant check), fail-closed quarantine for the 6
  remaining derived readers (`server/data/payouts-unscoped.ts`, allowlist shrunk 8 → 6),
  session→tenant seam (`server/services/payout-organization-context.ts`), scoped CSV export routes
  (`private, no-store` + `Vary: Cookie`) and tenant-bound MCP payout tools. 56 new tests
  (isolation, structural, route, MCP, actions, probe) + 8 mutation checks; probe payouts PASS,
  GAP moves to `customers.listCustomers` (Wave 7C).
- `WAVE_7B_IMPLEMENTATION_REPORT.md`, `PAYOUTS_TENANT_ISOLATION_MATRIX.md`; debt **D-28**
  (remaining unscoped payout readers).

### Fixed
- **Unauthenticated money movement closed** (found during the Wave 7B retrofit):
  `withdrawBalanceAction` previously required no session. It now requires authentication and a
  tenant-scoped account (cross-tenant ⇒ same not-found as an unknown account), locked by
  action-level regression tests. Reported as a security finding, not cleanup.
- **Wave 7A — Transactions tenant isolation** (`arena/01a095f2-pay-dash`, ADR-0041). `domain/tenancy/organization-context.ts`
  (`OrganizationContext`: required, no default organization) + tenant-scoped transaction DAL
  (`server/data/transactions.ts`, store partitioned by `(organizationId, id)`), fail-closed quarantine for
  the 11 not-yet-scoped readers (`server/data/transactions-unscoped.ts`), session→tenant seam
  (`server/services/transaction-organization-context.ts`), and a `TENANT_ISOLATION_DENIED` audit action
  with a bounded denial sink. 136 new tests (isolation, structural, route, MCP, seam) and 1 more in the Wave 6 probe — plus 10 mutation checks proving each gate can fail; the Wave 6
  isolation probe now prints 5 PASS / 1 GAP. Gates: list/search/detail/mutation/export/IDOR all PASS.
- `WAVE_7A_TENANT_ISOLATION_SPEC.md`, `TRANSACTIONS_TENANT_ISOLATION_MATRIX.md`,
  `WAVE_7A_IMPLEMENTATION_REPORT.md`; debt **D-26** (no tenant column on `LedgerEntry` → Postgres
  transaction reads refused) and **D-27** (analytics tenant dimension).

### Fixed
- **Cross-tenant exposure closed on the transaction slice** (Wave 7A): ledger list/search/detail, retry,
  refund request/approve/reject/execute, create, CSV export, dashboard/AI-journal aggregates, and the MCP
  `list_transactions`/`get_transaction`/`refund_transaction` tools now all require the caller's
  organization. `guardExport()`'s resolved organization is finally used as the CSV query predicate; the
  provider transaction read no longer defaults to the demo organization; the unscoped Postgres ledger
  readers (`pg-stores`, `server/dal/ledger.ts`) are deleted or refused pending D-26.
- Console triage (2026-09-02): locale-strip for `/_next/static` in `proxy.ts`, `eslint` ignores for `.next`, `PAYMENT_METHODS` client-safe boundary, `web-vitals` guard, `/api/vitals` 204, Sentry dedupe, support `nativeButton` — 286 tests pass, lint 0 errors, `PROGRESS.md` Milestone 7 → ✅.

### Added
- `docs/adr/` with 5 accepted ADRs (0001 App Router, 0002 Tailwind+shadcn, 0003 Postgres+Prisma, 0004 Auth, 0005 Observability).
- `docs/STACK.md` (golden-path deps/commands) and `docs/ARCHITECTURE.md` (layout + boundaries).
- `docs/STORYBOOK.md`, `docs/SEARCH.md`, `docs/QUEUES.md` (previously deferred — now unskipped).
- `CONTRIBUTING.md`, `CHANGELOG.md`.
- `SCREENS.md` Migrated Route column; `PROGRESS.md` phased tracker (0 Scaffold → 6 Testing/CI).

### Changed
- `AGENTS.md` → compact structure + Docs + Tooling note (`codegraph init` for `apps/web`).
- `README.md` → Production Migration section.

## [0.1.0] - 2026-08-29

- Reorganized into `design-system/` and `screens/{mobile,desktop}`; added `README.md`, `AGENTS.md`, `PROGRESS.md`, `SCREENS.md` (14 mobile + 19 desktop prototypes).
