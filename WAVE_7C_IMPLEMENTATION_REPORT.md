# Wave 7C Implementation Report — Customers Tenant Isolation

Date: 2026-09-13 · Branch: `arena/01a09adf-pay-dash` · Predecessor: Wave 7B (Payouts+Refunds slice, PASS) · Base: `main@d337a13`
Spec: `WAVE_7C_CUSTOMERS_SPEC.md` (Proposed → Implemented by this report)
Matrix: `CUSTOMERS_TENANT_ISOLATION_MATRIX.md` · ADR: `docs/adr/0043-customer-tenant-isolation.md`
Commit: Q1+Q2+Q6+Q7 as one logical slice (follows 7B `PAYOUTS_TENANT_ISOLATION_MATRIX.md` + ADR-0042)

Invariant proved on the third vertical slice:

> Organization A cannot list, search, open, export, or mutate a customer record of Organization B —
> even knowing the id or email exactly. The customer directory is *derived* (scoped ledger in, scoped directory out), so a customer's lifetime value and their payment list can never disagree.

---

## 1. What changed (production code)

- `server/data/customers.ts` — `Customer` gains `organizationId`; store is `Map<org, { manual, overrides }>` + `PROTOTYPE_SEED` eagerly seeded into `DEFAULT_DEMO_ORG` (demo tenant always counts as #1). **All 6 repository reads/writes are ctx-first**: `listCustomers`, `getCustomer`, `getCustomerTransactions`, `getCustomerMetrics`, `createCustomer` (owner from ctx only, per-tenant email uniqueness via `getCustomer(ctx,email)` — composite key `(organizationId, id)` per spec P-10, `customerIdFromEmail` is pure global hash), `updateCustomer` (own→override / foreign→`TenantIsolationError` + `CROSS_TENANT_WRITE` denial audit / unknown→`null`). `buildDirectory` composes on the 7A slice (`scopedLedgerRows` pages through `listTransactions(ctx)`), and `readPartition(organizationId)` is the tenant predicate before any search/filter/sort/pagination. `BatchSummary`-style owner not needed — the row itself carries `organizationId`. CSV header frozen without org columns (`customersToCsv` pure); `customerIdFromEmail` pure. Probes `countCustomerTenants`/`soleCustomerOrganizationId` compose on `countLedgerTenants`/`soleLedgerOrganizationId` (ledger side folded in; quarantine fails closed on `>1`).
- `server/data/customers-unscoped.ts` (new) — quarantine for the 2 remaining derived readers (`reports`, `subscriptions`). Hard-fails with `UnscopedCustomerAccessError` naming the surface once >1 tenant has customers. `LEGACY_CUSTOMER_SURFACES` frozen shrink-only. `legacyListCustomers` is **NOT async** so the gate throws synchronously (U-12 pins `expect(() => …).toThrow()`), while the served path returns `listCustomers(legacyContext(surface), filters)` with `soleCustomerOrganizationId()` single-tenant assumption. `legacyCustomerMetrics` same gate.
- `server/services/customer-organization-context.ts` (new) — session→tenant seam (`resolveCustomerOrganizationContext`/`requireCustomerOrganizationContext` + `refuseMultiTenantDemo`), reuses `normalizeRequestedOrganization`, mirrors `payout-organization-context.ts` (Wave 7B). No change to `mcp/auth.ts` (reuse `registerDomainTools` org param — 7B decision stands). Provider wiring in `actions/customers.ts` keeps `customer.read` (no `customer.create`/`update` permission exists in `roles.ts` — not invented).
- Session wiring: `server/actions/customers.ts` (ctx + `TenantIsolationError`→not-found uniform message `"That customer no longer exists."`), `app/api/exports/customers/route.ts` (Q4-equivalent), `server/mcp/domain-tools.ts` (Q4-equivalent), `app/[locale]/customers/page.tsx`, `app/[locale]/customers/[id]/page.tsx`, `components/customers/customer-transactions-panel.tsx`, `recovery-agent` page (seam), `subscriptions` + `reports/builder` pages (quarantine).
- `app/api/exports/customers/route.ts` — `guardExport().organizationId` → `parseOrganizationContext` → `normalizeRequestedOrganization` (client `?organizationId=` flagged, never honoured) → `listCustomers(ctx)`; unresolved org `UNRESOLVED_ORGANIZATION_ID` (`"unknown"`) → 401 with `Cache-Control: no-store`; `Cache-Control: private, no-store` + `Vary: Cookie`.
- `server/mcp/domain-tools.ts` — customer tools `list_customers`/`get_customer` tenant-bound via the existing `scoped` param + `NO_TENANT` refusal (mirrors transaction/payout pattern). `customerIdFromEmail` stays pure; `customersToCsv` stays pure.
- Structural fixes that must NOT regress (Q2):
  1. eager demo seeding in `store()` (prototype rows are manual records, so demo tenant counts);
  2. Q-1b `PROBE_EXPORTS` exemption (`countCustomerTenants`, `soleCustomerOrganizationId` are row-free probes);
  3. S-1c in `transactions-structural.test.ts` amended to exactly `[customers.ts, transactions-unscoped.ts]` with justification comment (sibling scoped DAL composing its own fail-closed gate — no rows flow through the probes).

## 2. Security findings

No new unauthenticated money-movement surface was found in this slice (unlike Wave 7B's `withdrawBalanceAction`). The finding is the **confirmation of the derived-directory invariant**: before this slice, `server/data/customers.ts:241` (`listCustomers`) and `:284` (`getCustomer`) and `:324/:352` (`createCustomer`/`updateCustomer`) were process-wide, and `buildDirectory` read `legacyListTransactions("customers")` (line 152) + process-wide `manual`/`overrides` (line 78). Any customer id/email was globally resolvable, any write was globally writable, and the ledger-derived directory leaked across tenants because the ledger read was unscoped. The fix threads the 7A tenant predicate through the derived layer: one scoped ledger read, one partitioned manual store, one composite key. The quarantine now fails closed with the surface name instead of returning a neighbour's directory.

Deferred but now visible: the customer email's `cus_` id is intentionally **shared shape** across tenants (same email → same id). The isolation does not rely on id uniqueness; it relies on the `(organizationId, id)` pair. This is the same pattern as 7A `txn_shared` and is covered by U-9 (same email in two tenants → two rows, same id, different owners).

## 3. Tests (29 new, all green)

| File | Count | Covers |
|---|---|---|
| `server/data/customers.tenant-isolation.test.ts` | 14 | U-1..U-12 (list, search, detail-by-id, detail-by-email, ledger-transactions, metrics, create, update, per-tenant email uniqueness composite-key, derived composition, pagination×sort, quarantine dynamic-import + invalid ctx) |
| `server/data/customers-structural.test.ts` | 8 | Q-1 ctx-first (all 6 fns + PROBE_EXPORTS exemption), Q-2 quarantine allowlist + prod-path guard + slot privacy, Q-3 pure formatters, Q-4 CSV vocab, Q-5 owner column |
| `app/api/exports/customers/route.tenant.test.ts` | 4 | scoped CSV, `?organizationId=` override flag, header stability (no org column), `private, no-store` + `Vary: Cookie` |
| `server/mcp/customer-tools.tenant.test.ts` | 3 | tenant-bound list + foreign not-found + null-refusal (no default, no demo fallback) |
| `server/finance/tenant-isolation.probe.test.ts` | +0 (flipped) | customers probe GAP→PASS (was `listCustomers.length === 0` process-wide, now scoped composition) |

No new action tenant test file was added (the 3 customer actions reuse `customer.read` and are covered by the structural prod-path guard and the 7B-pattern seam; the handoff's "actions/customers.ts uses customer.read permission — NO customer.create/update permission exists" is honoured).

## 4. Mutation checks (Q6 — 8/8 reddened, all reverted, residue grep 0)

| # | Gate to break | Change | Expected RED | Observed | Notes |
|---|---|---|---|---|---|
| M1 | Partition predicate in `buildDirectory` | `customers.ts:282` replace `readPartition(organizationId)` with all-tenants manual+overrides merge (`Array.from(store().tenants.values()).flatMap(...)`) | U-1, U-8 | **9/14 failed** (U-1 list leak, U-2 search leak, U-3/U-4 foreign detail now resolves, U-6 metrics inflate, U-7 create visible to B, U-8 foreign update no longer throws (overwrites), U-9 global dup blocks cross-tenant create) — RED | The ledger half stayed scoped, so U-5 (ledger transactions) and U-10 (ledger-derived) still passed. Defense in depth: partition lookup + scoped ledger are two predicates; breaking one leaks manual records but not ledger-derived rows. |
| M2 | Export route guard | `exports/customers/route.ts` replace `guardExport().organizationId` with `DEFAULT_DEMO_ORG` | route.tenant.test.ts (2-3 tests) | **2/4 failed** (Org A's CSV missing alpha, `?organizationId=` still missing) — 2 passed (header, cache) — RED | Mirrors 7A shape #3; demo org's seeded rows (contact@acmecorp.com etc.) render instead of the caller's; cache headers unaffected. |
| M3 | MCP `scoped` param | `domain-tools.ts` remove `if (!scoped) return textResult(NO_TENANT)` from `list_customers`/`get_customer` (keep `scoped!`) | customer-tools.tenant.test.ts | **1/3 failed** (`without a tenant … refuse` → `OrganizationContextError: MISSING_ORGANIZATION_CONTEXT` thrown instead of tenant string) — RED | Skipping the guard does not create a leak-by-default; it creates a throw-by-null (no default org). Honest: the test failed via exception, not via leaked payload, but the gate is still required — without it the tool would not answer tenant-less. |
| M4 | Quarantine prod-path guard | `server/actions/customers.ts` add `import { legacyListCustomers } from "@/server/data/customers-unscoped"` | structural Q-2 | **2/8 failed** (quarantine allowlist + prod-path guard) — RED | The structural scan froze the consumer set to `reports/builder` + `subscriptions` only; any wired path importing the quarantine fails. |
| M5 | CSV vocab (no org column) | `customers.ts` `customersToCsv` add `"organization_id"` to header | structural Q-4 (also Q-3) | **2/8 failed** (Q-4 `not.toMatch(/organization/i)` + Q-3 pure check) — RED | Header vocabulary frozen; body rows already omit org; adding column is a metadata leak, not a data leak, but still blocked. |
| M6 | ctx-first contract | `customers.ts` `createCustomer` remove `ctx: OrganizationContext` first param | structural Q-1 | **1/8 failed** (`createCustomer takes ctx first`) — RED | Only signature checked; body still references `ctx` (would throw at runtime). |
| M7 | Cross-tenant write check | `customers.ts` `updateCustomer` remove `customerOwnedByAnotherTenant` + `TenantIsolationError` block (return `null` for foreign) | U-8 (handoff says U-9) | **1/14 failed** (U-8 `B's id refuses loudly` → `null` instead of throw) — RED | Handoff table lists U-9 but the correct pin is U-8 (foreign update); U-9 is per-tenant email uniqueness. Observed RED matches U-8; U-9 unaffected. No new pin needed — order not involved. |
| M8 | Per-tenant email uniqueness | `customers.ts` `createCustomer` replace `getCustomer(ctx,email)` dup-check with global cross-tenant manual scan | U-9 (handoff says U-6) | **1/14 failed** (U-9 `same email in other tenant is allowed` → `already exists` thrown) — RED | Global scan leaks tenant boundary via uniqueness; per-tenant check is the gate. Handoff table lists U-6 (metrics) but correct is U-9. |

All 8 mutations **reddened** (at least the expected tests failed), were **fully reverted** (each followed by a GREEN run of its named tests), and `grep -R MUTATION` is **0** after. 7B lesson applied: each mutation's observable set was reported honestly; no mutation was unobservable (contrast 7B M8 which needed new U-13b). The only table-label mismatches were Handoff's M7/M8 Expected RED columns (U-9/U-6) vs actual U-8/U-9 — the gates themselves are correct; the report records the honest observed mapping (see Notes).

## 5. Gates (measured 2026-09-13)

| Gate | Result |
|---|---|
| Full suite | **1472 passed / 17 failed** — 15 pre-existing env (`DATABASE_URL` unset: stripe/xendit webhooks 9, payment-flows 5, project webhook 1) + 2 pre-existing calendar flakes (`balance.test.ts` trend, fail identically on clean main). **Zero customer failures.** |
| Typecheck | clean (`tsc --noEmit`) |
| Lint | 0 errors / 40 warnings (== D-17 baseline) |
| Probe | customers **PASS** (was GAP); payouts PASS (still); gap moves explicitly to next slice (no new GAP in matrix — remaining derived readers are quarantined fail-closed) |
| Tenant-isolation probe | `tenant-isolation.probe.test.ts` GREEN 9/9 (transactions/payouts/customers all PASS) |

## 6. What stays CONDITIONAL (next)

17 modules unscoped (was 18 — customers done); webhook ingress still writes `"unresolved"`; no RLS; analytics carry no tenant dimension (D-27); `LedgerEntry` still has no `organizationId` (D-26, P0). Quarantine debt:

- **Customers:** 2 surfaces remain quarantined (`reports`, `subscriptions`) — fail-closed today, scope in next wave(s) by threading `resolveCustomerOrganizationContext` like Q2 did for the directory.
- **Payouts:** 6 surfaces remain quarantined (`balance`, `audit`, `command-center`, `handoff`, `finance/snapshot`, `reports`) — D-28, fail-closed.
- Remaining derived readers across other slices are similarly quarantined (transactions: 11).

No new P0 introduced. The store remains `Map<org, ...>` (swap for Prisma in one place per slice).
