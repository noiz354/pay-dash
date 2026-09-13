# ADR-0043: Customer tenant isolation on the Wave 7A contract

Date: 2026-09-13
Status: **Accepted** (Wave 7C, Customers slice)

## Context

ADR-0041 proved the canonical tenant-scoping contract on one vertical slice (Transactions):
`OrganizationContext` required-first, no default organization, fail-closed quarantine for the rest.
ADR-0042 proved it generalises to a second slice with direct money movement (Payouts).
Wave 7C applies the unchanged contract to the third slice — customers — where the twist is
that the directory is *derived* (ledger rows + manual records), so the invariant must compose:
scoped ledger in, scoped directory out. The open design question was the global email-hash id
(`customerIdFromEmail`): the same email in two tenants yields the same `cus_` id shape.

## Decision

1. Reuse `domain/tenancy/organization-context.ts` unchanged; partition the customer store by org
   (`Map<org, { manual, overrides }>`, demo partition eagerly seeded); scope all 6
   reads/writes ctx-first, with the composite key `(organizationId, id)` resolving the P-10
   collision (same email, two tenants ⇒ two rows — 7A `txn_shared` pattern).
2. Quarantine the 2 remaining derived readers in `server/data/customers-unscoped.ts`
   (`reports`, `subscriptions` — seeded at 2, shrink-only); fail-closed, surface-naming.
3. Bind the export route to `guardExport().organizationId` (`private, no-store` +
   `Vary: Cookie`) and MCP customer tools to the existing `registerDomainTools`
   organization param (refuse when absent).
4. Tenancy probes (`countCustomerTenants`, `soleCustomerOrganizationId`) are exempt from
   ctx-first exactly like pure formatters: they answer *about* the store, never a row —
   and they compose on the 7A probes, which required amending S-1c to admit `customers.ts`
   as the second (justified, row-free) consumer.

## Consequences

- Good: third slice proves the contract generalises to derived data; no pre-existing auth
  gap found (unlike 7B); probe gaps reach **0** (transactions, payouts, customers all PASS).
- Bad: 2 customer readers + 6 payout readers remain quarantined (fail-closed, not scoped) —
  Wave 7D+ work (D-28).

## Alternatives

- Global email uniqueness (one email ⇒ one row worldwide): rejected — it would make
  tenant B's signup fail because tenant A registered first, a cross-tenant oracle by itself.
- Separate MCP tenant resolver for customers: rejected (7B user decision stands) — the shared
  param is the same trust root transaction and payout tools use.

## Verification

29 new tests green (14 isolation + 8 structural + 4 route + 3 MCP; probe GAP→PASS rewritten,
3 legacy files moved to demo ctx); 8/8 Q6 mutations reddened then reverted (incl. two surgical
single-test pins, U-8 and U-9); suite 1472/17 (all pre-existing, +29/−0 vs baseline),
typecheck clean, lint 0/40; matrix `CUSTOMERS_TENANT_ISOLATION_MATRIX.md`.
