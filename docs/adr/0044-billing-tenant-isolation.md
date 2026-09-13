# ADR-0044: Billing tenant isolation on the Wave 7A contract

Date: 2026-09-13
Status: **Accepted** (Wave 7D, Billing slice — subscriptions + invoices)

## Context

ADR-0041 proved the canonical tenant-scoping contract on one vertical slice (Transactions):
`OrganizationContext` required-first, no default organization, fail-closed quarantine for the rest.
ADR-0042 reused it unchanged on payouts+refunds, ADR-0043 on the derived customer directory. Wave 7D
applies it to **billing** — the slice with the sharpest edges so far, because it combines a derived
aggregate, a predictable id space, and a money mutation. The pre-existing gaps (`WAVE_7D_BILLING_SPEC.md` §3):

- **P-1/P-2** `server/data/subscriptions.ts` — `listSubscriptions(filters)`, `getSubscription(id)` and
  `createSubscription(input)` unscoped over one process-wide `{ plans }` store; `subscriptionIdFrom(email,
  planName)` is a pure global hash, so the same email+plan in two tenants yields the same `sub_` id.
- **P-3/P-4** `server/data/invoices.ts` — `listInvoices`, `getInvoice`, `getInvoiceTransactions`,
  `getInvoiceLineItems`, `getInvoiceTimeline`, `getBillingSummary` unscoped over a process-wide
  `{ payments }` record, deriving through `legacyListTransactions("invoices", { pageSize: 100 })`.
- **P-5** `payInvoice(id, method)` — an unscoped **money mutation**, and an invoice id is a month key
  (`INV-2026-03-LEDGER`) that two tenants can hold at once.
- **P-6** three export routes discarding `guardExport()`'s org id and serving `Cache-Control: public`
  bodies (7A shape #3). **P-7** three MCP tools unscoped. **P-8** four server actions without ctx,
  including the bulk `payInvoicesAction`. **P-9** three pages unwired.

The brief forbids a mega-diff, forbids defaulting to a demo tenant so call sites compile, and forbids
inventing permissions.

## Decision

1. **Reuse `domain/tenancy/organization-context.ts` unchanged** and partition both billing stores by
   organization: `Map<org, { plans }>` and `Map<org, { payments }>`, with the prototype rows (10 plans,
   3 statements) seeded into `DEFAULT_DEMO_ORG` only. Every repository function is ctx-first
   (`listSubscriptions`, `getSubscription`, `createSubscription`, `listInvoices`, `getInvoice`,
   `getInvoiceTransactions`, `getInvoiceLineItems`, `getInvoiceTimeline`, `getBillingSummary`,
   `invoiceStatementCsv`, `payInvoice`); `subscriptionsToCsv`, `invoicesToCsv` and
   `subscriptionIdFrom` stay pure.
2. **Scope the derivation, not the filter.** `scopedLedgerRows(ctx)` pages through the 7A scoped
   `listTransactions(ctx, …)` until exhausted, so statements, line items, timelines and the billing
   summary are computed from one tenant's fees. This also removes the pre-existing 100-row cap that
   silently understated fees for larger ledgers.
3. **Isolation is the composite key `(organizationId, id)`, not id uniqueness** — for plans (P-10, same
   shape as 7C's `customerIdFromEmail`) and, more sharply, for invoices, whose ids are month keys two
   tenants legitimately share. `applyPayment` therefore reads the *owner's* payment partition, so one
   tenant settling its March statement cannot settle another tenant's.
4. **Pin the money mutation's order** (7B M8 lesson): `payInvoice` resolves scope → reads inside it →
   attributes a foreign id → records a denial and throws `TenantIsolationError("CROSS_TENANT_WRITE")` →
   only then writes, into the caller's partition alone. Unknown id ⇒ `null`; foreign id ⇒ throw when the
   owner can be named, uniform not-found when it cannot. A refused pay writes nothing anywhere,
   including the actor's own partition.
5. **Create no quarantine module for this slice**, and forbid one structurally. Every billing caller was
   wireable in-wave, so instead of adding `subscriptions-unscoped.ts` / `invoices-unscoped.ts` (spec §4 as
   drafted), `billing-structural.test.ts` R-4 fails if a billing `*-unscoped` file appears or if any
   production billing path imports any quarantine. The two legacy allowlists **shrank** in the same
   commit: `LEGACY_LEDGER_SURFACES` 12 → 11 (`invoices`), `LEGACY_CUSTOMER_SURFACES` 2 → 1
   (`subscriptions`), and S-2's `ALLOWED_UNSCOPED_CONSUMERS` dropped `server/data/invoices.ts`.
6. **One seam for the slice**: `server/services/billing-organization-context.ts`
   (`resolveBillingOrganizationContext` for reads, `requireBillingOrganizationContext(permission)` for
   writes, `refuseMultiTenantDemo` gated on `countBillingTenants()` which folds the subscription, invoice
   and 7A ledger probes). Permissions are picked from `roles.ts`, never invented: reads
   `transaction.read`, exports `report.export` / `transaction.read`, `createSubscriptionAction`
   `recurring.create`, `createInvoiceAction` `money_in.create`, both pay actions
   `recurring.immediate_charge`.
7. **Bind the edges**: the three export routes make `guardExport().organizationId` the query predicate
   (unresolved org ⇒ 401 with no body; `private, no-store` + `Vary: Cookie`; client `?organizationId=`
   normalized and flagged), the three MCP tools reuse the existing `registerDomainTools` organization
   param and refuse with the shared `NO_TENANT` payload when absent, and the four actions map a
   `TenantIsolationError` to the same string as a missing invoice.

## Consequences

- Good: the fourth slice proves the contract generalises to **derived aggregates with a predictable id
  space and a money mutation** — the hardest combination in the in-memory layer. The unscoped
  `payInvoice` write path is closed; the aggregate leak (fee totals computed from everybody's ledger) is
  closed; billing now *serves* a multi-tenant process instead of refusing its own owner (the D-28
  fail-closed shape) — and two quarantine allowlists shrank without adding a third module.
- Bad: foreign-id attribution in `payInvoice` is **bounded**. Naming an owner would require enumerating
  ledger tenants, and Wave 7A pins its tenancy probes to `number | string | null` (S-1), so this wave does
  not loosen a 7A ratchet to obtain one; candidates are `{DEFAULT_DEMO_ORG} ∪ {tenants holding payment
  records} ∪ {sole ledger tenant}`. An unattributable foreign id therefore answers uniform not-found
  instead of an audited refusal. Isolation is unaffected (the write path is partition-bound and both
  branches are pinned), but the audit trail is narrower than it could be — closing it properly belongs to
  Wave 7H, where a real `organizationId` column makes attribution a query rather than an inference.
- Bad: `getBillingSummary` still reads `getMerchantProfile()` for one boolean (`autoDebitEnabled`);
  settings is unscoped until Wave 7F. Recorded in code at the call site, not fixed here.
- Cost: 3 pages, 3 routes, 4 actions and 3 MCP tools now resolve a context; 15 `server/data/*` modules
  remain unscoped.

## Alternatives

- Filter after deriving (keep `buildInvoices()` global, filter by org at the end): rejected — the
  aggregate itself is the leak, and it is also how the 100-row cap went unnoticed.
- Make invoice ids globally unique per tenant (e.g. hash in the org): rejected — the month key is the
  product's own vocabulary (`INV-2023-08-4421`, `INV-YYYY-MM-LEDGER`) and appears in URLs, CSV filenames
  and support conversations; isolation must not depend on id secrecy.
- `payInvoice(ctx?, id, method)` optional during migration: rejected — optional context is no context,
  and this is a money mutation.
- Add a ledger-tenant enumerator to attribute foreign ids exactly: rejected for this wave — it would
  loosen a Wave 7A structural ratchet (S-1) from inside a later slice; deferred to 7H.
- Create the two planned quarantine modules: rejected — nothing needed them, and a quarantine that
  exists is a quarantine that must later be deleted (7E ES-6). R-4 forbids the file instead.
- Default to `DEFAULT_DEMO_ORG` for unscoped callers: rejected — makes the demo tenant a global namespace.

## Verification

- `subscriptions.tenant-isolation.test.ts` 12 (B-1..B-6b), `invoices.tenant-isolation.test.ts` 16
  (B-7..B-13b), `billing-structural.test.ts` 17 (R-1..R-5), 3 export-route tenant tests 6+6+6,
  `billing-tools.tenant.test.ts` 5, `actions/billing.tenant.test.ts` 10 — **78 new, all green**;
  `tenant-isolation.probe.test.ts` 11/11 with both Wave 7D GAP rows CLOSED and `gaps.length === 0`.
- 8/8 Q6 mutations reddened then reverted (`scripts/wave-7d-q6-mutations.py`), residue grep 0. Two survived the first
  pass and exposed real holes — an MCP refusal assertion that a successful payload also satisfied
  (rows now carry `organizationId`), and an order pin that inspected only the victim's partition — both
  closed before the second pass. See `WAVE_7D_IMPLEMENTATION_REPORT.md` §4.
- Full suite **1560 passed / 2 failed** (both pre-existing `balance.test.ts` clock-drift expectations,
  reproduced identically in a clean worktree at the base commit); typecheck clean; lint 0 errors / 40
  pre-existing warnings. Evidence: `BILLING_TENANT_ISOLATION_MATRIX.md`.
