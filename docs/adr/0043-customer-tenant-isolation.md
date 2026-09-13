# ADR-0043: Customer tenant isolation on the Wave 7A contract

Date: 2026-09-13
Status: **Accepted** (Wave 7C, Customers slice)

## Context

ADR-0041 proved the canonical tenant-scoping contract on one vertical slice (Transactions);
ADR-0042 reproved it on the second (Payouts, where direct money movement raised the stakes). Wave 7C
applies the unchanged contract to the third slice — the customer directory — which is *derived*
(ledger + manual records), so the invariant **composes** on the 7A slice: a scoped ledger in must
yield a scoped directory out. The directory is also the first slice whose identifier is a *pure
global hash* (`customerIdFromEmail`), so the same email in two tenants would otherwise collide on a
single `cus_` id.

## Decision

1. Reuse `domain/tenancy/organization-context.ts` unchanged; partition the customer store by org
   (`Map<organizationId, { manual, overrides }>`); scope every read/write ctx-first
   (`listCustomers`, `getCustomer`, `getCustomerTransactions`, `getCustomerMetrics`,
   `createCustomer`, `updateCustomer`).
2. Resolve the email-hash collision with a **composite key `(organizationId, id)`** — the same
   shape as 7A's `txn_shared` — rather than changing `customerIdFromEmail`, which stays pure and
   tenant-free by design (it is a structural-pinned formatter). Email uniqueness becomes
   per-tenant: the same email in another tenant is a different row; twice in one tenant is a
   duplicate.
3. Quarantine the 2 remaining derived readers (`reports`, `subscriptions`) in
   `server/data/customers-unscoped.ts` — fail-closed, surface-naming; the consumer set is frozen and
   may only shrink.
4. Bind the export route to `guardExport().organizationId` (`private, no-store` + `Vary: Cookie`)
   and the MCP customer tools to the existing `registerDomainTools` organization param (refuse when
   absent).

## Consequences

- Good: the directory composes on the scoped ledger (U-10), so a tenant can never see another
  tenant's buyers through the directory; the composite key preserves the stable id shape; foreign
  reads answer `null`, foreign writes throw and are audited (no enumeration oracle).
- Bad: 2 customer readers remain quarantined (fail-closed, not scoped) — follow-up work (D-29).

## Alternatives

- Change `customerIdFromEmail` to hash `(organizationId, email)`: rejected — it would break the
  stable URL shape and the pure-formatter contract; the composite key keeps the id stable while
  scoping the row.
- A separate MCP customer resolver: rejected (the 7B decision stands) — the shared org param is the
  same trust source the transaction and payout tools use; a second resolver would fork the trust
  root.

## Verification

36 new tests green (14 isolation U-1..U-12 + 8 structural Q-1..Q-5 + 4 export-route + 3 MCP + 6
actions + 1 probe); the legacy `customers.test.ts` folded to the demo tenant (Q3). Full suite
1489 passed / 2 failed (both pre-existing calendar flakes in `balance.test.ts`), typecheck clean,
lint 0 errors / 40 warnings. Matrix `CUSTOMERS_TENANT_ISOLATION_MATRIX.md`.
