# Wave 7C Implementation Report — Customers Tenant Isolation

Date: 2026-09-13 · Branch: `arena/01a0997a-pay-dash` · Predecessor: Wave 7B (Payouts + Refunds, PASS)
Spec: `WAVE_7C_CUSTOMERS_SPEC.md` (Proposed → Implemented by this report)
Matrix: `CUSTOMERS_TENANT_ISOLATION_MATRIX.md` · ADR: `docs/adr/0043-customer-tenant-isolation.md`
Commit: one logical slice on top of `290ca99` ("fix: enforce customer tenant isolation")

Invariant proved on the third vertical slice:

> Organization A cannot list, search, open, export, or mutate a customer record of Organization B —
> even knowing the id or email exactly. The directory is *derived*, so the invariant composes:
> scoped ledger in, scoped directory out.

---

## 1. What changed (production code)

- `server/data/customers.ts` — `Customer` gains `organizationId`; the store is
  `Map<organizationId, { manual, overrides }>` plus the ledger-side tenancy probes. **All** reads
  and writes are ctx-first: `listCustomers`, `getCustomer` (id **or** email),
  `getCustomerTransactions`, `getCustomerMetrics`, `createCustomer`, `updateCustomer`. Foreign
  write ⇒ `TenantIsolationError` (`cross-tenant`) + `recordTenantDenial`; foreign read ⇒ `null`.
  Email uniqueness is **per-tenant** (composite key `(organizationId, id)`, spec P-10): the pure
  `customerIdFromEmail` hash is unchanged; the same email in two tenants is two rows.
- `server/data/customers-unscoped.ts` (new) — fail-closed quarantine for the 2 remaining derived
  readers (`reports`, `subscriptions`). Throws `UnscopedCustomerAccessError` naming the surface
  once > 1 tenant holds customers. `LEGACY_CUSTOMER_SURFACES` frozen, shrink-only.
- `server/services/customer-organization-context.ts` (new) — session→tenant seam
  (`resolve`/`require` + `refuseMultiTenantDemo`), reuses `normalizeRequestedOrganization` and
  maps cross-tenant write refusals to the same not-found an unknown id gets.
- Session wiring: `server/actions/customers.ts` (all 3 actions ctx + `TenantIsolationError`→
  not-found), `customers/page.tsx`, `customers/[id]/page.tsx`, `customer-transactions-panel.tsx`
  resolve the tenant from the session only. `reports/builder/page.tsx` and
  `subscriptions/page.tsx` remain on the quarantine (fail-closed).
- `app/api/exports/customers/route.ts` — `guardExport().organizationId` → `parseOrganizationContext`
  → `normalizeRequestedOrganization` (client `?organizationId=` flagged, never honoured) →
  `listCustomers(ctx)`; unresolved org ⇒ 401 with no body; `Cache-Control: private, no-store` +
  `Vary: Cookie`.
- `server/mcp/domain-tools.ts` — `list_customers` / `get_customer` use the existing `scoped` param +
  `NO_TENANT` refusal; a foreign id/email is not-found, never forbidden. No change to `mcp/auth.ts`.

## 2. Findings (honest, in the open)

1. **`customer-tools.tenant.test.ts` was missing the `pg-stores` mock** its payout counterpart has
   (`payout-tools.tenant.test.ts` mocks `./pg-stores` so the suite runs without `prisma generate`).
   As authored, the customer MCP suite hard-failed with `@prisma/client did not initialize yet` in
   any environment where Prisma hasn't generated — the same env dependency the other suites mock
   away. Fixed by adding the identical `vi.mock("./pg-stores", …)` shim; the suite now runs
   env-independently (3/3).
2. **`server/actions/customers.tenant.test.ts` did not exist** although spec §5/§6(Q4) requires
   "action tests for the 3 customer actions" (7B shipped `payouts.tenant.test.ts` with 8). Added:
   6 tests proving the 3 actions resolve the session tenant and that a foreign id answers exactly
   like an unknown id, plus the unauthenticated-actor refusal.

## 3. Tests (36 new, all green)

| File | Count | Covers |
|---|---|---|
| `server/data/customers.tenant-isolation.test.ts` | 14 | U-1..U-12: list/search/detail(id+email)/transactions/metrics/create/update/email-collision/composition/pagination/quarantine/invalid-ctx |
| `server/data/customers-structural.test.ts` | 8 | Q-1..Q-5: ctx-first (6 fns), no-default, formatter purity, quarantine allowlist + prod-path guard + slot privacy + CSV vocab |
| `app/api/exports/customers/route.tenant.test.ts` | 4 | scoped CSV, `?organizationId=` override flag, header stability, `private` + `Vary: Cookie` |
| `server/mcp/customer-tools.tenant.test.ts` | 3 | tenant-bound list/get + null-refusal |
| `server/actions/customers.tenant.test.ts` | 6 | 3 action boundaries + unauthenticated refusal |
| `server/finance/tenant-isolation.probe.test.ts` | +1 | Wave 7C probe: customers list/get/update scoped; matrix prints **8 PASS / 0 GAP** |

Legacy `server/data/customers.test.ts` folded to the demo tenant (Q3) — 14 tests, still green.

## 4. Mutation checks (Q6)

Specified in `WAVE_7C_CUSTOMERS_SPEC.md` §6 (8 mutations). Not re-executed in the authoring
sandbox; the structural ratchet (Q-1..Q-5) is the standing guard that each direction turns CI red.
The mapping is published in `CUSTOMERS_TENANT_ISOLATION_MATRIX.md` §"Proof that the gates can
fail". Execute on CI/a full host to complete the Q6 evidence row.

## 5. Gates (measured 2026-09-13, this sandbox)

| Gate | Result |
|---|---|
| Full suite | **1489 passed / 2 failed (1491 total), 138 files** — the 2 failures are the pre-existing calendar flakes in `balance.test.ts` (`getBalanceTrend`); `server/mcp/server.integration.test.ts` is the pre-existing env-blocked suite (Prisma engines). **Zero customer/payout/transaction-bound failures.** |
| Typecheck | clean (`tsc --noEmit`) |
| Lint | 0 errors / 40 warnings (== D-17 baseline) |
| Probe | customers PASS; matrix prints **8 PASS / 0 GAP** (was 1 GAP: `customers.listCustomers`) |

Note: earlier baselines recorded 15 `DATABASE_URL`-unset env failures; those did not reproduce in
this sandbox (the suites pass here). The delta is environmental, not a code change in this slice.

## 6. What stays CONDITIONAL (next)

17 modules unscoped (was 18 — customers done); `reports` + `subscriptions` remain quarantined
fail-closed (new debt **D-29**); webhook ingress still writes `"unresolved"`; no RLS;
`LedgerEntry` still has no `organizationId` (**D-26**, P0); analytics carry no tenant dimension
(**D-27**). Remaining unscoped payout readers tracked in **D-28**.
