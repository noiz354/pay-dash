# Wave 7D Implementation Report — Billing Tenant Isolation (Subscriptions + Invoices)

Date: 2026-09-13 · Branch: `arena/01a09b03-pay-dash` · Predecessor: Wave 7C (Customers slice, PASS) · Base: `af18cc4` (docs-only ahead of `main`, which stops at 7C)
Spec: `WAVE_7D_BILLING_SPEC.md` (Proposed → **Implemented** by this report)
Matrix: `BILLING_TENANT_ISOLATION_MATRIX.md` · ADR: `docs/adr/0044-billing-tenant-isolation.md`
Commit: Q1+Q2+Q3+Q4+Q5+Q6+Q7 as one logical slice (follows 7B/7C precedent)

Invariant proved on the fourth vertical slice:

> Organization A cannot list, open, export, or **settle** an invoice or plan of Organization B — even
> knowing the id exactly. Billing is *derived* (one calendar month of ledger fees), so the derivation
> itself is scoped: an aggregate computed over everybody's rows is a leak even when the rows are
> filtered afterwards, and an invoice id is a **month key** two tenants can hold at once.

---

## 1. What changed (production code)

- **`server/data/subscriptions.ts`** — `Subscription` gains `organizationId`; the store becomes
  `Map<organizationId, { plans }>` (was one process-wide `{ plans }` array, spec P-1/P-2) with the 10
  prototype plans seeded into `DEFAULT_DEMO_ORG` only. All three repository functions are ctx-first:
  `listSubscriptions(ctx, filters)`, `getSubscription(ctx, id)`, `createSubscription(ctx, input)`
  (owner taken from ctx, never from input). `readPartition(organizationId)` is the tenant predicate
  *before* any needle/status/sort/page. `subscriptionIdFrom(email, planName)` stays a pure global hash,
  so isolation is the composite key `(organizationId, id)` (spec P-10, mirrors 7C's `customerIdFromEmail`).
  Probes `countSubscriptionTenants`/`soleSubscriptionOrganizationId` are row-free. `subscriptionsToCsv`
  and `lib/subscription-csv.ts` stay pure and client-safe (no tenancy column).
- **`server/data/invoices.ts`** — `Invoice` gains `organizationId`; the payment store becomes
  `Map<organizationId, { payments }>` (was one process-wide `{ payments }` record, spec P-3). All seven
  readers plus the money mutation are ctx-first: `listInvoices`, `getInvoice`, `getInvoiceTransactions`,
  `getInvoiceLineItems`, `getInvoiceTimeline`, `getBillingSummary`, `invoiceStatementCsv`,
  `payInvoice(ctx, id, method)` (spec P-4/P-5). Derivation now reads the **scoped** 7A ledger:
  `scopedLedgerRows(ctx)` pages through `listTransactions(ctx, …)` instead of
  `legacyListTransactions("invoices", { pageSize: 100 })`. The three prototype statements are the demo
  tenant's records, not every tenant's. `applyPayment(invoice, organizationId)` reads the *owner's*
  partition, which is what makes a colliding month id two different bills. Probes
  `countInvoiceTenants`/`soleInvoiceOrganizationId` compose the 7A ledger probes (a tenant whose fees
  exist only as ledger rows still owns a statement).
- **`payInvoice` order pin (spec B-13, 7B M8 lesson)** — resolve scope → read inside it → attribute a
  foreign id → `recordTenantDenial` + `TenantIsolationError("CROSS_TENANT_WRITE")` → **only then** write,
  and only into the caller's partition. Unknown id ⇒ `null`; foreign id ⇒ throw (audited) or `null` when
  unattributable (see §2). Nothing is written on any refused path.
- **No quarantine modules were created for this slice** (approved deviation, §7). Instead the two
  existing quarantines **shrank**: `LEGACY_LEDGER_SURFACES` 12 → 11 (drops `invoices`) and
  `LEGACY_CUSTOMER_SURFACES` 2 → 1 (drops `subscriptions`, spec P-9's predicted side effect).
  `billing-structural.test.ts` R-4 pins that no `server/data/*-unscoped.ts` billing module exists and
  that no production billing path imports *any* quarantine.
- **`server/services/billing-organization-context.ts`** (new) — the session→tenant seam for the whole
  slice (one slice, one seam): `resolveBillingOrganizationContext` (reads) /
  `requireBillingOrganizationContext(permission)` (writes, strict — no demo fallback) /
  `countBillingTenants` / `billingAccessCan` / `billingAccessDeniedState` / `BILLING_NOT_FOUND_MESSAGE`.
  `refuseMultiTenantDemo` folds the subscription, invoice **and** ledger probes, so a demo fallback is
  refused the moment a second tenant holds plans, payments or fees.
- **Export routes (3)** — `app/api/exports/subscriptions/route.ts`, `app/api/exports/invoices/route.ts`,
  `app/api/exports/invoices/[id]/route.ts`: `guardExport().organizationId` **is** the query predicate
  (parsed to a ctx before any filter), `UNRESOLVED_ORGANIZATION_ID` ⇒ 401 with `Cache-Control: no-store`
  and no body, responses are `private, no-store` + `Vary: Cookie` (the 7A shape #3 defect, spec P-6),
  client `?organizationId=` is normalized against the session scope and flagged, never honoured. The
  per-invoice statement answers 404 identically for "not yours" and "does not exist".
- **MCP (3 tools)** — `server/mcp/domain-tools.ts`: `list_invoices`, `get_invoice`, `list_subscriptions`
  bound to the existing `registerDomainTools` organization param; no tenant ⇒ the shared `NO_TENANT`
  refusal (no default, no demo fallback); foreign id ⇒ `{ error: "Invoice not found." }` (spec P-7).
- **Server actions (4)** — `payInvoiceAction` (`recurring.immediate_charge`; `TenantIsolationError` ⇒
  the uniform `"That invoice no longer exists."`), `payInvoicesAction` (**bulk**: tenant resolved once
  before the loop, per-row scoping, and the honest `{ paid, failed }` count is returned even when
  nothing could be settled — no silent cross-tenant drops), `createInvoiceAction` (`money_in.create`),
  `createSubscriptionAction` (`recurring.create`; the seam's ctx now reaches the DAL instead of being
  resolved and dropped) (spec P-8).
- **Pages (3)** — `app/[locale]/subscriptions/page.tsx` (both directory reads + the create dialog's
  customer list, now via the scoped 7C `listCustomers`), `app/[locale]/billing/page.tsx` (summary row +
  history), `app/[locale]/billing/[id]/page.tsx` (`generateMetadata` + all four async parts) (spec P-9).
- **Ratchets moved, never loosened** — `transactions-structural.test.ts` S-1c now expects exactly
  `[customers.ts, invoices.ts, transactions-unscoped.ts]` (a sibling scoped DAL composing its own
  fail-closed gate); S-2 `ALLOWED_UNSCOPED_CONSUMERS` **drops** `server/data/invoices.ts`;
  `customers-structural.test.ts` Q-2's allowlist drops the subscriptions page.
- **Cross-slice dependency recorded, not fixed here** — `getBillingSummary` still reads
  `getMerchantProfile()` for one boolean (`autoDebitEnabled`). Settings is Wave 7F's slice; the value
  carries no invoice, fee or counterparty data, so the aggregate stays single-tenant either way.

## 2. Security findings

1. **The leak class was the aggregate, not the row.** Invoices are derived: `buildInvoices()` summed
   *every* tenant's ledger fees into per-month statements, so even a perfectly filtered list would have
   shown a fee total, a processed volume and a transaction count computed from other tenants' money.
   Scoping the derivation (not the filter) is the fix; B-7/B-11 pin it.
2. **`payInvoice` was an unscoped money mutation.** The payment record was keyed by invoice id alone in
   one process-wide map, and an invoice id is a month key (`INV-2026-03-LEDGER`) that two tenants hold at
   once — so settling "your" March statement could settle somebody else's, and any caller who knew the
   id could mark a foreign statement paid. Now the record is composite `(organizationId, invoiceId)`
   and the write is partition-bound (B-8, B-12).
3. **Silent data loss in the derivation (fixed in passing).** The pre-7D read was
   `legacyListTransactions("invoices", { page: 1, pageSize: 100 })` — a hard 100-row cap. A tenant with
   more than 100 settled rows had statements computed from a truncated ledger: understated fees,
   understated volume, wrong line items. `scopedLedgerRows` pages until exhausted.
4. **Availability debt retired for this slice.** Because the derivation rode the 7A quarantine, a
   two-tenant process served *nobody* — the statement list threw `UnscopedLedgerAccessError` for its own
   owner too (fail-closed, "safe but unavailable": D-28's shape). Billing now serves each tenant.
5. **Honest bound on foreign-id attribution.** `payInvoice` refuses *loudly* (audited
   `TenantIsolationError`) when it can name the owner, and answers uniform not-found when it cannot.
   Naming an owner requires enumerating ledger tenants, and Wave 7A pins its tenancy probes to
   `number | string | null` returns (S-1 in `transactions-structural.test.ts`), so no enumerator exists
   and this wave does not loosen a 7A ratchet to obtain one. The candidate set is therefore
   `{DEFAULT_DEMO_ORG} ∪ {tenants holding payment records} ∪ {sole ledger tenant when there is exactly
   one}`. The isolation property is unconditional either way: the write path is partition-bound, so a
   refused *or* unattributed pay writes nothing anywhere (B-13 pins both branches, including that the
   actor's own partition gained no stray record).

## 3. Tests (78 new across 8 files, all green; 2 probe GAPs flipped)

| File | Count | Covers |
|---|---|---|
| `server/data/subscriptions.tenant-isolation.test.ts` | 12 | B-1..B-6b (list, search/filter, detail-by-id ⇒ ∅, summary aggregation, composite-key P-10, create lands in caller's partition, no-ctx refusal) |
| `server/data/invoices.tenant-isolation.test.ts` | 16 | B-7..B-13b (scoped derivation, colliding month = two invoices, detail + 4 derived readers ⇒ ∅/empty, filters/ranges/sorts, summary aggregate, partition-bound pay, **B-13 order pin** incl. denial-audit contents and colliding-month settlement, no-ctx refusal, store-slot privacy) |
| `server/data/billing-structural.test.ts` | 17 | R-1 ctx-first (all 10 billing fns + probe exemptions), R-2 money-mutation order source pin, R-3 pure formatters, R-4 **no billing quarantine exists** + no prod path imports one + no unscoped ledger/directory read + probes reachable only from fail-closed infra, R-5 CSV vocabulary frozen without an org column + store-slot privacy + owner column present |
| `app/api/exports/subscriptions/route.tenant.test.ts` | 6 | scoped CSV, `?organizationId=` override flagged, header stability, `private, no-store` + `Vary: Cookie`, unresolved org ⇒ 401 |
| `app/api/exports/invoices/route.tenant.test.ts` | 6 | A's periods only, exported amount is A's fee total (not the process total), override flagged, header pin, cache headers |
| `app/api/exports/invoices/[id]/route.tenant.test.ts` | 6 | own statement served, foreign id ⇒ 404 byte-identical to unknown id, cache headers, unresolved org ⇒ 401 |
| `server/mcp/billing-tools.tenant.test.ts` | 5 | tenant-bound list/get/list_subscriptions, foreign id ⇒ not-found, **no tenant ⇒ refusal pinned to the `NO_TENANT` text with zero payload**, malformed tenant ⇒ same |
| `server/actions/billing.tenant.test.ts` | 10 | `payInvoiceAction` (own pay, cross-tenant ⇒ uniform message, no session, validation-first), `payInvoicesAction` (per-row scoping, all-foreign batch charges nothing and reports `{paid:0,failed:2}`, empty batch refused before store access), `createInvoiceAction`, `createSubscriptionAction` |
| `server/finance/tenant-isolation.probe.test.ts` | +0 (2 flipped) | the two Wave 7D `CURRENT GAP` rows (subscriptions leak, invoices quarantine-refusal) rewritten as CLOSED rows; matrix `gaps.length === 0` |

Legacy product-behaviour suites were moved onto the demo context (Q3), not deleted:
`server/data/invoices.test.ts` (16) and `server/data/subscriptions.test.ts` (7).

## 4. Mutation checks (Q6 — 8/8 reddened, all reverted, residue grep 0)

Harness: `scripts/wave-7d-q6-mutations.py` — applies each mutation from a backup, runs the tests that must
catch it, records the verdict, restores. Two mutations **survived the first pass** and both survivals
were real holes in the net, closed before the second pass:

| # | Gate to break | Change | Observed |
|---|---|---|---|
| M1 | Partition predicate | `subscriptions.ts`: `readPartition(org).plans` → all-partition `flatMap` | **RED** |
| M2 | Global lookup | `invoices.ts` `getInvoice`: merge the demo partition into the caller's candidate list | **RED** |
| M3 | Hardcoded export org | `exports/invoices/route.ts`: `guard.organizationId` → `DEFAULT_DEMO_ORG` | **RED** |
| M4 | MCP bypass | `domain-tools.ts` `list_invoices`: `if (!scoped) return textResult(NO_TENANT)` → demo fallback | **SURVIVED first pass → RED after fix.** The no-tenant assertion was `/organization\|tenant/i`, which a *successful* payload also satisfies now that billing rows carry an `organizationId` field. Repinned to the refusal text (`"not bound to an organization"`) plus "no payload at all" (`INV-`, `sub_`, `"amount"`, `"processedVolume"`, `"customerEmail"` absent) |
| M5 | Quarantine back in a prod path | `invoices.ts`: re-import `legacyListTransactions` and read through it | **RED** (S-2 ratchet + R-4) |
| M6 | Org column in CSV | `invoicesToCsv`: add `organization_id` header + cell | **RED** (R-5 + route header pin) |
| M7 | Per-org payment overlay | `applyPayment`: `readPayments(org)` → merge of every tenant's payments | **RED**, but only after a new pin: the seeded collision month (`INV-2026-03-LEDGER` held by A *and* B) is now asserted to settle one tenant only — status, `paidAt`, `paymentMethod`, B's payable list and B's outstanding total |
| M8 | Pay before the tenant check | `payInvoice`: write the payment record before resolving ownership | **SURVIVED first pass → RED after fix.** The existing B-13 assertions only inspected the *victim's* partition; a write-before-check leaves a stray record in the *actor's* partition, which a colliding month id could later surface as settled. B-13 now asserts no partition anywhere holds a payment key for a refused id |

All 8 mutations reddened on the second pass, every file was restored from backup, and
`grep -R "PAY-MUTATION\|flatMap((t) => t.plans)\|organization_id\|legacyListTransactions"` over the four
mutated production files returns **0**.

## 5. Gates (measured 2026-09-13, this sandbox)

| Gate | Result |
|---|---|
| Full suite | **1560 passed / 2 failed / 3 failed files** (baseline at `af18cc4`: 1480 / 2 / 3). Both failures are `balance.test.ts` trend expectations that drift with the wall clock — reproduced **identically** in a clean worktree at `af18cc4`, so they are pre-existing, not Wave 7D. The 3rd failed file is one of the two below. **Zero billing failures.** |
| Typecheck | clean (`tsc --noEmit`) |
| Lint | **0 errors** / 40 warnings (== D-17 baseline; none in a file this wave touched) |
| Tenant-isolation probe | 11/11 green; the two Wave 7D GAP rows are CLOSED; matrix `gaps.length === 0` |
| Billing suite in isolation | 11 files / 112 tests green (8 new + probe + 2 legacy) |

**BLOCKED_BY_ENVIRONMENT (pre-existing, not a Wave 7D defect):** this sandbox has no `DATABASE_URL` and
Prisma engine downloads are blocked, so `@prisma/client` cannot initialise and two files cannot even
collect: `server/mcp/customer-tools.tenant.test.ts` (7C) and `server/mcp/server.integration.test.ts`.
Consequence for this wave: `billing-tools.tenant.test.ts` mocks `@/server/mcp/pg-stores` so the
memory-path assertions stay real; the 7C equivalent has no such mock and is unmeasurable here.

## 6. What stays CONDITIONAL (next)

15 `server/data/*` modules unscoped (was 17 — subscriptions and invoices done). Quarantine ledger after
this wave: `LEGACY_LEDGER_SURFACES` 11, `LEGACY_PAYOUT_SURFACES` 6, `LEGACY_CUSTOMER_SURFACES` 1, and
**no billing quarantine at all**. Still open: webhook ingress writes `"unresolved"`; no Postgres RLS;
`LedgerEntry` has no `organizationId` (D-26, P0); analytics carry no tenant dimension (D-27); D-28's six
payout readers + one customer reader remain fail-closed (Wave 7E); settings/team/KYC/onboarding are 7F;
webhooks/links/blocklist are 7G. The billing slice's one cross-slice read (`getMerchantProfile` inside
`getBillingSummary`) closes when 7F scopes settings.

## 7. Deviations from the drafted plan (approved, recorded here per instruction)

1. **No quarantine modules.** §4 of the spec planned `subscriptions-unscoped.ts` and
   `invoices-unscoped.ts`. Q2 verification found every billing caller wireable in-wave, so both were
   dropped and R-4 now *forbids* a billing `*-unscoped` file (the structural test fails if one appears).
   The roadmap's §4.2 planned-module rows for 7D are struck accordingly; 7E's ES-6 deletion gate is
   unaffected because ES-6 is pinned to the three legacy paths by name.
2. **8 test files, not 5.** Repo convention is one route test per route directory, so the three export
   routes each got their own file (the drafted plan folded them into one).
3. **S-2 ratchet shrank** by removing `server/data/invoices.ts` from `ALLOWED_UNSCOPED_CONSUMERS`
   (monotone-decrease, as the rule requires).
4. **MCP test mocks `pg-stores`** for the environment reason in §5.
5. **`payInvoicesAction` now returns `{ paid, failed }` even when nothing settled** (previously an early
   return without `data`). A bulk settle that charges nothing must still report how many rows were
   attempted; found by Q6 M8-adjacent review, pinned by the action test.
