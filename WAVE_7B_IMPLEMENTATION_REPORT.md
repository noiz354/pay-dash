# Wave 7B Implementation Report — Payouts + Refunds Tenant Isolation

Date: 2026-09-13 · Branch: `main` · Predecessor: Wave 7A (Transactions slice, PASS)
Spec: `WAVE_7B_PAYOUTS_REFUNDS_SPEC.md` (Proposed → Implemented by this report)
Matrix: `PAYOUTS_TENANT_ISOLATION_MATRIX.md` · ADR: `docs/adr/0042-payout-tenant-isolation.md`
Commit: Q2–Q7 as one logical slice (follows 2526bd8, which carried the MCP fail-closed fix + this spec)

Invariant proved on the second vertical slice:

> Organization A cannot read, search, export, open the detail of, or mutate a payout batch of
> Organization B — even knowing the id exactly. Refunds ride the same boundary: every refund-phase
> read and write resolves the caller's tenant first.

---

## 1. What changed (production code)

- `server/data/payouts.ts` — `PayoutBatch` gains `organizationId` + `createdBy` (null for seeds, still
  releasable); store is `Map<org, { batches, accounts, settings }>` + global sequence. **All** reads
  and writes are ctx-first: `listBatches`, `getBatch`, `getPayoutBatches`, `getPayoutsOverview`,
  `createBatch` (owner from ctx only), `approveBatch` (+ dual-control creator≠approver **after** the
  tenant check), `cancelBatch`, `retryBatchFailures`, `retryRecipient`, timeline, and the 5
  settings/bank functions (P-6 decision: account numbers are direct money → per-org scope).
  Foreign write ⇒ `TenantIsolationError` (`cross-tenant`) + denial audit; foreign read ⇒ `null`.
  `BatchSummary` carries the owner; CSV headers frozen without org columns.
- `server/data/payouts-unscoped.ts` (new) — quarantine for the 6 remaining derived readers
  (audit, balance, command-center, finance-snapshot, handoff, reports). Hard-fails with
  `UnscopedPayoutAccessError` naming the surface once > 1 tenant has rows. **Q7 shrank the allowlist
  from 8 → 6**: `exports-payouts` and `mcp` were scoped in Q4 and removed (shrink-only rule).
- `server/services/payout-organization-context.ts` (new) — session→tenant seam
  (`resolve`/`require` + `refuseMultiTenantDemo`), reuses `normalizeRequestedOrganization`.
- Session wiring: `server/actions/payouts.ts` (ctx + actorId, `TenantIsolationError`→not-found),
  `server/actions/balance.ts` + `withdrawBalance(input, ctx)`, 4 payouts pages, balance page,
  2 ai-journal pages, setup-progress, onboarding.
- `app/api/exports/payouts/route.ts` + `[id]/route.ts` (Q4.1) — `guardExport().organizationId` →
  `parseOrganizationContext` → `normalizeRequestedOrganization` (client `?organizationId=` flagged,
  never honoured) → `listBatches(ctx)` / `getBatch(ctx)`; unresolved org → 401 with no body;
  `Cache-Control: private, no-store` + `Vary: Cookie`. `export-guard.ts` now exports
  `UNRESOLVED_ORGANIZATION_ID` (`"unknown"` sentinel, 3 literals replaced).
- `server/mcp/domain-tools.ts` (Q4.2) — payout tools use the existing `scoped` param + `NO_TENANT`
  refusal (mirrors the transaction pattern; user decision: reuse, no separate resolver). No change
  to `mcp/auth.ts`. Legacy payouts-unscoped import removed.

## 2. Security bug found during the retrofit (not incidental cleanup)

**`withdrawBalanceAction` previously had NO auth.** A money-movement entry point was reachable without
an authenticated session. Found while threading ctx through `server/actions/balance.ts`, fixed in the
same slice (`Authentication required` unauthenticated; cross-tenant ⇒ same not-found as unknown
account), and locked by regression tests (`actions/payouts.tenant.test.ts`). Reported here as a
finding, not as cleanup.

## 3. Tests (56 new, all green)

| File | Count | Covers |
|---|---|---|
| `server/data/payouts.tenant-isolation.test.ts` | 17 | U-1..U-15 + quarantine dynamic-import + invalid-ctx + **U-13b** (tenant-before-dual-control order pin, added in Q6) |
| `server/data/payouts-structural.test.ts` | 21 | ctx-first (incl. 5 settings/bank), owner column, no-default, formatter purity, quarantine allowlist + prod-path guard + slot privacy + CSV vocab |
| `app/api/exports/payouts/route.tenant.test.ts` | 5 | scoped CSV, `?organizationId=` override flag, 401, header stability |
| `server/mcp/payout-tools.tenant.test.ts` | 4 | tenant-bound + null-refusal |
| `server/actions/payouts.tenant.test.ts` | 8 | action boundaries incl. withdraw auth regression lock |
| `server/finance/tenant-isolation.probe.test.ts` | +1 | unauthenticated export 401 (both endpoints, no data in body) |

## 4. Mutation checks (Q6 — 8/8 reddened, all reverted, residue grep 0)

M1 partition-bypass → 6 isolation fails. **Finding: naive predicate-only removal did NOT redden —
the partition lookup IS the predicate and the owner filter is a second layer** (defense in depth,
now documented). M2 global `getBatch` → 3 fails. M3 hardcoded export org → 3 route fails.
M4 MCP `scoped` bypass → null-refusal fails. M5 quarantine import in a wired path → 2 structural
fails. M6 `organization_id` in CSV body → vocab test fails. M7 unscoped settings → ctx-first fails.
M8 dual-control-before-tenant-check → **initially UNOBSERVABLE** (suite always used distinct actors);
honest fix was a new pin (U-13b: same-actor cross-tenant approve must throw `cross-tenant`), which
the mutation then reddened. Lesson recorded: an order claim without a same-actor test is untested.

## 5. Gates (measured 2026-09-13)

| Gate | Result |
|---|---|
| Full suite | **1442 passed / 17 failed** — 15 pre-existing env (`DATABASE_URL` unset: stripe/xendit webhooks 9, payment-flows 5, project webhook 1) + 2 pre-existing calendar flakes (balance trend, fail identically on clean main). **Zero payout failures.** |
| Typecheck | clean (`tsc --noEmit`) |
| Lint | 0 errors / 40 warnings (== D-17 baseline) |
| Probe | payouts PASS (was GAP); GAP moves explicitly to `customers.listCustomers` (Wave 7C) |

## 6. What stays CONDITIONAL (next: Wave 7C)

18 modules unscoped (was 19 — payouts done); `customers.listCustomers` is the next vertical slice;
webhook ingress still writes `"unresolved"`; no RLS; analytics carry no tenant dimension (D-27);
`LedgerEntry` still has no `organizationId` (D-26, P0). New debt: **D-28** (remaining unscoped
payout readers: balance, audit, command-center, handoff, finance-snapshot, reports — fail-closed
today, scope in 7C+).
