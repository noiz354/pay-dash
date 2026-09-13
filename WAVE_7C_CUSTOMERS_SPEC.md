# Wave 7C — Customers Tenant Isolation (Spec)

Date: 2026-09-13 · Branch: `main@d337a13` (Wave 7B committed) · Predecessors: Wave 7A (Transactions, PASS), Wave 7B (Payouts, PASS)
Status: **Proposed** · Follows ADR-0041/0042 · Reuses `domain/tenancy/organization-context.ts` unchanged

---

## 0. Runtime baseline (measured, not carried over)

| Gate | Result 2026-09-13 |
|---|---|
| Full suite | **1443 passed / 17 failed** (15 pre-existing env `DATABASE_URL` unset + 2 pre-existing calendar flakes; zero payout/customer-bound failures) |
| Typecheck | clean · Lint 0 errors / 40 warnings (== D-17) |
| Probe matrix | payouts PASS; **1 GAP: `server/data/customers.listCustomers`** (`tenant-isolation.probe.test.ts:202`, asserts `listCustomers.length === 0` — process-wide, Wave 7C) |

## 1. Invariant

> Organization A cannot list, search, open, export, or mutate a customer record of Organization B —
> even knowing the id or email exactly. The customer directory is *derived* (ledger + manual records),
> so the invariant composes: scoped ledger in, scoped directory out.

## 2. Contract reuse (C-1..C-7, unchanged from 7A/7B)

`OrganizationContext` required-first, `parseOrganizationContext` only constructor, no defaults,
reads → null / writes → `TenantIsolationError` + denial audit, wire answers uniform not-found,
session-only resolution (`normalizeRequestedOrganization` flags browser `?organizationId=`),
fail-closed quarantine with surface-naming for the not-yet-scoped.

## 3. Gaps (file:line evidence, checkout `d337a13`)

- **P-1** `server/data/customers.ts:241` — `listCustomers(filters)` unscoped; `buildDirectory()` reads
  `legacyListTransactions("customers")` (line 152) + process-wide `manual`/`overrides` store (line 78).
- **P-2** `customers.ts:284` — `getCustomer(idOrEmail)` unscoped; email lookup is global.
- **P-3** `customers.ts:290` — `getCustomerTransactions(email)` unscoped ledger filter.
- **P-4** `customers.ts:304` — `getCustomerMetrics()` unscoped aggregates.
- **P-5** `customers.ts:324,352` — `createCustomer`/`updateCustomer` unscoped writes; email-uniqueness
  check is global (line 326).
- **P-6** `app/api/exports/customers/route.ts` — discards `guardExport()` org (same defect 7A shape #3);
  needs `private, no-store` + `Vary: Cookie` (check current headers).
- **P-7** `server/mcp/domain-tools.ts:205-213` — `list_customers`/`get_customer` unscoped.
- **P-8** `server/actions/customers.ts:78,120,142` — 3 actions without ctx.
- **P-9** Pages/components: `customers/page.tsx:30`, `customers/[id]/page.tsx:30,36`,
  `customer-transactions-panel.tsx:9`, `subscriptions/page.tsx`, `reports/builder/page.tsx`,
  `recovery-agent/page.tsx` — session wiring vs quarantine per caller.
- **P-10** Design decision — `customerIdFromEmail` is a pure global email hash: the same email in two
  tenants yields the same `cus_` id. Resolution: composite key `(organizationId, id)`; each tenant
  resolves its own row (same pattern as 7A `txn_shared`). Manual store + overrides partitioned per org.

## 4. Quarantine design (`server/data/customers-unscoped.ts`)

`LEGACY_CUSTOMER_SURFACES` (seed: subscriptions, reports, recovery-agent, snapshot/audit if they read
customers — verify at Q2; frozen, shrink-only) + `UnscopedCustomerAccessError` naming the surface when
> 1 tenant has rows. `customersToCsv` stays pure (frozen header, no org columns — structural pin).

New seam: `server/services/customer-organization-context.ts` (resolve/require + refuseMultiTenantDemo,
mirrors payout seam). No change to `mcp/auth.ts` (reuse `registerDomainTools` org param — 7B decision stands).

## 5. Tests

- **U-1..U-12** isolation: list/search/detail/metrics/transactions/create/update/export/MCP/overrides-per-org/email-collision-composite-key/quarantine-dynamic-import/invalid-ctx.
- **U-13** order pin if any multi-check mutation exists (7B lesson: precedence claims need pins).
- **Q-1..Q-5** structural: ctx-first (all 6 fns), no-default, formatter purity (`customersToCsv` +
  `customerIdFromEmail` pure), quarantine allowlist + prod-path guard + slot privacy + CSV vocab.
- **Route (customers export) + MCP tenant tests** mirror 7B Q1 harness; **action tests** for the 3
  customer actions.
- Probe: GAP test flips to PASS + asserts scoped composition (seeded B-only email invisible to A).

## 6. Plan Q0..Q7 (serial, same gates as 7B)

Q0 spec (this doc) → Q1 4 failing test files (36-ish tests, red for missing ctx) → Q2 scoped DAL +
partitioned store + seam + session wiring vs quarantine → Q3 (folded: legacy tests to demo ctx) →
Q4 export route + MCP + action tests → Q5 probe final + full gates → Q6 8 mutations (predicate
removal, global lookup, hardcoded export org, MCP bypass, quarantine import in prod path, org col in
CSV, per-org override loosening, create-before-tenant-check) → Q7 report + matrix + ADR + commit one slice.
