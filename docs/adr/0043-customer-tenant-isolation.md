# ADR-0043: Customer tenant isolation on the Wave 7A contract

Date: 2026-09-13
Status: **Accepted** (Wave 7C, Customers slice)

## Context

ADR-0041 proved the canonical tenant-scoping contract on one vertical slice (Transactions): `OrganizationContext` required-first, no default organization, fail-closed quarantine for the rest. ADR-0042 reused the unchanged contract on the second slice — payouts+refunds — and closed one unauthenticated money-movement gap while proving the store-partition + `TenantIsolationError` + `NO_TENANT` + `private, no-store` pattern generalises. Wave 7C applies the same contract to the third slice — the customer directory — where the data is *derived* (manual records + ledger-derived rows) and the pre-existing gaps were:

- `server/data/customers.ts:241` `listCustomers` unscoped, `buildDirectory` read `legacyListTransactions("customers")` + process-wide `manual`/`overrides`.
- `customers.ts:284` `getCustomer(idOrEmail)` global email lookup, `290` `getCustomerTransactions` unscoped ledger filter, `304` `getCustomerMetrics` unscoped aggregates, `324/352` `createCustomer`/`updateCustomer` global writes (email uniqueness global).
- `app/api/exports/customers/route.ts` discarded `guardExport()` org (same shape as 7A #3).
- `server/mcp/domain-tools.ts:205-213` `list_customers`/`get_customer` unscoped.
- `server/actions/customers.ts:78,120,142` three actions without ctx.
- Pages/components session wiring vs quarantine per caller (spec P-9).
- Design corner P-10: `customerIdFromEmail` is a pure global email hash — same email in two tenants yields same `cus_` id — so isolation must be the composite key `(organizationId, id)`, not id uniqueness.

The brief forbids a mega-diff and forbids defaulting to a demo tenant so call sites compile; it also forbids inventing permissions (`customer.create`/`update` do not exist in `roles.ts`).

## Decision

1. Reuse `domain/tenancy/organization-context.ts` unchanged; partition the customer store by org (`Map<organizationId, { manual, overrides }>`) with the demo prototype rows eagerly seeded into `DEFAULT_DEMO_ORG` only (so the demo tenant always counts in `countCustomerTenants`); scope every read/write ctx-first (`listCustomers`, `getCustomer`, `getCustomerTransactions`, `getCustomerMetrics`, `createCustomer`, `updateCustomer`) and keep `customersToCsv`/`customerIdFromEmail` pure (no store, no ctx). Email uniqueness is per-tenant (`getCustomer(ctx,email)` composite key); `updateCustomer` on foreign id throws `TenantIsolationError` (`CROSS_TENANT_WRITE`, denial audited) after `customerOwnedByAnotherTenant`, unknown id ⇒ `null`.
2. Quarantine the 2 remaining derived readers in `server/data/customers-unscoped.ts` (`LEGACY_CUSTOMER_SURFACES = ["reports","subscriptions"]`, fail-closed, surface-naming, shrink-only); `legacyListCustomers` is NOT async so the gate throws synchronously, served path delegates to `listCustomers(legacyContext(surface), …)` with `soleCustomerOrganizationId()` single-tenant assumption. Probes `countCustomerTenants`/`soleCustomerOrganizationId` are row-free and compose on the 7A ledger probes.
3. Add seam `server/services/customer-organization-context.ts` (`resolve`/`require` + `refuseMultiTenantDemo`, mirrors payout seam, reuses `normalizeRequestedOrganization`).
4. Bind export route to `guardExport().organizationId` (`private, no-store` + `Vary: Cookie`, client `?organizationId=` flagged) and MCP customer tools to the existing `registerDomainTools` organization param (refuse when absent, uniform not-found for foreign id/email, no quarantine, no separate resolver per 7B user decision).
5. Keep the transaction structural fix S-1c amended to exactly `[customers.ts, transactions-unscoped.ts]` with justification (sibling scoped DAL composing its own fail-closed gate — no rows flow through the probes).

## Consequences

- Good: third slice proves the contract generalises to derived data (scoped ledger in, scoped directory out); the whole directory is now tenant-scoped with the same 4 test shapes (isolation, structural, route, MCP) plus the composition pin (U-10); probe `customers.listCustomers` flips GAP→PASS.
- Bad: 2 customer derived readers remain quarantined (fail-closed, not scoped) — wave 7C+ work; `LedgerEntry` still has no `organizationId` (D-26), analytics still have no tenant dimension (D-27), and 6 payout readers remain quarantined (D-28).
- Cost: 4 production pages now import the customer seam; 2 pages still import the quarantine (intentionally, shrink-only).

## Alternatives

- Filter in the UI / per-route predicate: rejected (same as 7A/7B — N callers, each able to forget it; `guardExport` had the org and the route dropped it).
- `getCustomer(ctx?, …)` optional during migration: rejected — optional context is no context.
- Default to `DEFAULT_DEMO_ORG` for unscoped callers: rejected — makes the demo tenant a global namespace.
- Separate MCP tenant resolver for customers: rejected (user decision, 7B) — the shared `registerDomainTools` param is the trust root transaction tools use.
- Scoping `customerIdFromEmail` per tenant: rejected — the id shape is intentionally stable and global; isolation is the composite key, not the hash.
- Adding a new permission `customer.create`: rejected — none exists in `roles.ts`; the slice uses `customer.read` (handoff constraint).

## Verification

- `server/data/customers.tenant-isolation.test.ts` 14 (U-1..U-12) green; `customers-structural.test.ts` 8 (Q-1..Q-5) green; `exports/customers/route.tenant.test.ts` 4 green; `customer-tools.tenant.test.ts` 3 green; `tenant-isolation.probe.test.ts` 9/9 green (customers PASS).
- 8/8 Q6 mutations reddened then reverted (partition merge → 9 fails, hardcoded export org → 2 fails, MCP guard removal → 1 fail via throw, quarantine import → 2 fails, org column in CSV → 2 fails, ctx-first removal → 1 fail, cross-tenant write removal → 1 fail (U-8), global email scan → 1 fail (U-9)); residue grep 0.
- Full suite 1472 passed / 17 failed (all pre-existing: 15 env + 2 calendar flakes), typecheck clean, lint 0/40; matrix `CUSTOMERS_TENANT_ISOLATION_MATRIX.md`.
