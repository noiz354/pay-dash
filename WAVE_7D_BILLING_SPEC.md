# Wave 7D — Billing Tenant Isolation (Spec)

Date: 2026-09-13 · Branch: `wave-7d-derived-scoping` (main@a4b595a, Waves 7A/7B/7C PASS)
Predecessors: 7A Transactions, 7B Payouts+Refunds, 7C Customers (probe gaps = 0)
Status: **Proposed** · Follows ADR-0041/0042/0043 · Reuses `domain/tenancy/organization-context.ts` unchanged

---

## 0. Runtime baseline (measured, not carried over)

| Gate | Result 2026-09-13 |
|---|---|
| Full suite | **1472 passed / 17 failed** (15 pre-existing env `DATABASE_URL` unset + 2 pre-existing calendar flakes; zero billing-bound failures) |
| Typecheck | clean · Lint 0 errors / 40 warnings (== D-17) |
| Probe matrix | transactions PASS; payouts PASS; customers PASS; **0 GAPs** — Q1 *adds* the two billing GAP pins (subscriptions, invoices), Q5 closes them |

## 1. Invariant

> Organization A cannot list, search, open, export, pay, or mutate a subscription or
> invoice of Organization B — even knowing the id exactly. Plans point at customers
> by the same pure email hash as 7C, so the composite-key rule carries over: same
> customer email in two tenants ⇒ different plan rows. `payInvoice` is a money
> mutation: the tenant check runs *before* any ledger write (7B M8 lesson — order
> claims need pins).

## 2. Contract reuse (C-1..C-7, unchanged from 7A/7B/7C)

`OrganizationContext` required-first, `parseOrganizationContext` only constructor, no defaults,
reads → null / writes → `TenantIsolationError` + denial audit, wire answers uniform not-found,
session-only resolution (`normalizeRequestedOrganization` flags browser `?organizationId=`),
fail-closed quarantine with surface-naming for the not-yet-scoped.

## 3. Gaps (file:line evidence, checkout `a4b595a`)

- **P-1** `server/data/subscriptions.ts:233` — `listSubscriptions(filters)` unscoped over
  process-wide `{ plans }` store (line 223-228); seeds point at customers via the pure
  `customerIdFromEmail` hash (line 8) — same P-10 shape as 7C, composite key required.
- **P-2** `subscriptions.ts:266,280` — `getSubscription(id)` unscoped; `createSubscription`
  unscoped write, no owner.
- **P-3** `server/data/invoices.ts:270,308` — `listInvoices`/`getInvoice` unscoped over
  process-wide `{ payments }` store (line 97-100).
- **P-4** `invoices.ts:314,326,377,447` — `getInvoiceTransactions`/`getInvoiceLineItems`/
  `getInvoiceTimeline`/`getBillingSummary` unscoped derived readers (ledger composition —
  verify at Q2 whether they ride scoped 7A reads or legacy unscoped).
- **P-5** `invoices.ts:487` — `payInvoice(id, method)` unscoped **money mutation**;
  tenant-before-write order must be pinned (7B M8 precedent: new B-pin, not review).
- **P-6** `app/api/exports/subscriptions/route.ts`, `app/api/exports/invoices/route.ts` +
  `invoices/[id]/route.ts` — guard org handling unverified (same defect 7A shape #3);
  needs `private, no-store` + `Vary: Cookie` (check current headers at Q2).
- **P-7** `server/mcp/domain-tools.ts:227,232-240` — `list_invoices`/`get_invoice`/
  `list_subscriptions` unscoped.
- **P-8** `server/actions/invoices.ts:36,75,128` — `payInvoiceAction`/`payInvoicesAction`
  (bulk!)/`createInvoiceAction` without ctx; `server/actions/subscriptions.ts:18` —
  `createSubscriptionAction` without ctx.
- **P-9** Pages: `subscriptions/page.tsx`, invoices pages (verify at Q2) — session wiring
  vs quarantine per caller. Note: scoping the subscriptions DAL may let
  `subscriptions/page.tsx` drop its `customers-unscoped` read (7C quarantine shrinks
  as a side effect — record, don't force).
- **P-10** Design decision — `subscriptionIdFrom(email, planName)` (`subscriptions.ts:63`)
  is a pure global hash like 7C's `customerIdFromEmail`: same email+plan in two tenants
  ⇒ same `sub_` id shape. Resolution: composite key `(organizationId, id)`, mirrors 7C.

## 4. Quarantine design (one per DAL, established pattern)

`server/data/subscriptions-unscoped.ts` + `server/data/invoices-unscoped.ts`:
`LEGACY_SUBSCRIPTION_SURFACES` / `LEGACY_INVOICE_SURFACES` (seed at Q2 from the caller
table — verify; frozen, shrink-only) + `UnscopedBillingAccessError`-shaped errors naming
the surface when > 1 tenant has rows. `subscriptionsToCsv`/`invoicesToCsv` stay pure
(frozen headers, no org columns — structural pins).

New seam: `server/services/billing-organization-context.ts` (resolve/require +
refuseMultiTenantDemo, shared slice seam for both modules — one slice, one seam).
No change to `mcp/auth.ts` (reuse `registerDomainTools` org param — 7B decision stands).

## 5. Tests

- **B-1..B-12** isolation per module subset: list/search/detail/create (+pay/bulk-pay for
  invoices)/export/MCP/overrides-or-status-per-org/cross-module-customer-composite-key/
  quarantine-dynamic-import/invalid-ctx.
- **B-13** order pin: tenant-before-ledger-write in `payInvoice` (same-actor cross-tenant
  pay must throw `cross-tenant`, never reach the ledger — 7B U-13b precedent).
- **R-1..R-5** structural per DAL: ctx-first (subscriptions 3 fns; invoices 7 fns),
  no-default, formatter purity (`subscriptionsToCsv`/`monthlyRecurring`/`subscriptionSummary`
  + `invoicesToCsv`/`invoiceStatementCsv`/`periodLabelFor` pure), quarantine allowlists +
  prod-path guards + slot privacy + CSV vocabs.
- **Route (3 export endpoints) + MCP tenant tests** mirror 7C Q1 harness; **action tests**
  for `payInvoiceAction`/`payInvoicesAction`/`createInvoiceAction`/`createSubscriptionAction`
  (bulk action asserts per-row scoping — no silent cross-tenant drops).
- Probe: 2 GAP tests added in Q1 (subscriptions, invoices), flipped to PASS in Q5.

## 6. Plan Q0..Q7 (serial, same gates as 7A/7B/7C)

Q0 spec (this doc) → Q1 5 failing test files (40-ish tests, red for missing ctx + 2 probe
GAPs) → Q2 scoped DALs + partitioned stores + seam + session wiring vs quarantine → Q3
(folded: legacy tests to demo ctx) → Q4 export routes + MCP + action tests → Q5 probe
final + full gates → Q6 8 mutations (predicate removal, global lookup, hardcoded export
org, MCP bypass, quarantine import in prod path, org col in CSV, per-org status
loosening, pay-before-tenant-check) → Q7 report + matrix + ADR + commit one slice.
