# Billing Tenant Isolation Matrix — Wave 7D

Measured 2026-09-13 on `arena/01a09b03-pay-dash`, Wave 7D slice (Q1–Q7). Every cell below is a **test that
runs**, not a claim: the `Evidence` column names the file, and `pnpm --filter web test` executes all of them.

Invariant under test (same contract as Wave 7A/7B/7C, ADR-0041/0042/0043, unchanged):

> Organization A cannot list, open, export, or **settle** a subscription or invoice of Organization B —
> even knowing the id exactly. Billing is *derived* (a calendar month of ledger fees), so the invariant
> composes: scoped ledger in, scoped statement out — and an invoice id is a month key two tenants hold
> at once, so the composite key `(organizationId, id)` is what makes them different bills.

---

## The matrix — subscriptions (`server/data/subscriptions.ts`)

| Surface | Org A → A | Org A → B | Evidence |
|---|---|---|---|
| **List** (`listSubscriptions`) | **PASS** — own plans only; `total`/`pageCount` exclude B | **BLOCKED** — partition lookup is the predicate, so B's plans never enter the filter | `subscriptions.tenant-isolation.test.ts` B-1 |
| **Search / filter / sort / page** (`q`, `status`, `sort`, `page`) | **PASS** — needles match A's plans | **BLOCKED** — a needle matching only B returns `rows: []`, `total: 0`; MRR/summary never mixes | B-2 |
| **Detail by id** (`getSubscription`) | **PASS** — own id resolves | **BLOCKED** — `null`, byte-identical to an unknown id | B-3 |
| **Summary aggregate** (`subscriptionSummary` over a scoped list) | **PASS** — active count + MRR are A's | **BLOCKED** — B's plans cannot inflate A's MRR | B-4 |
| **Composite key** (`subscriptionIdFrom(email, plan)` is a pure global hash, spec P-10) | **PASS** — same email+plan in two tenants is two rows | **BLOCKED** — identical `sub_` id shape, different `organizationId`; neither resolves in the other | B-5 |
| **Create** (`createSubscription`) | **PASS** — lands in the caller's partition, owner from ctx only | **BLOCKED** — invisible to B (list, detail, summary) | B-6 |
| **No context, no tenant** | **PASS** — valid ctx serves | **BLOCKED** — missing ctx rejects; `parseOrganizationContext({organizationId:"   "})` throws | B-6b + R-1 |
| **Export** (`GET /api/exports/subscriptions`) | **PASS** — A's plans, frozen header | **BLOCKED** — no B reference; `?organizationId=<B>` flagged, session wins; unresolved org ⇒ 401 no body; `private, no-store` + `Vary: Cookie` | `exports/subscriptions/route.tenant.test.ts` (6) |
| **MCP `list_subscriptions`** | **PASS** — bound to the request's tenant | **BLOCKED** — no tenant ⇒ refusal text, zero payload | `billing-tools.tenant.test.ts` |
| **Action `createSubscriptionAction`** | **PASS** — `requireBillingOrganizationContext("recurring.create")`; ctx reaches the DAL | **BLOCKED** — no session ⇒ fail closed before any store access | `actions/billing.tenant.test.ts` |

## The matrix — invoices (`server/data/invoices.ts`)

| Surface | Org A → A | Org A → B | Evidence |
|---|---|---|---|
| **List + derivation** (`listInvoices` → `buildInvoices(ctx)`) | **PASS** — statements derived from A's ledger rows alone | **BLOCKED** — B's fees never enter A's aggregate; the three prototype statements are demo-owned | `invoices.tenant-isolation.test.ts` B-7 |
| **Colliding month id** (`INV-2026-03-LEDGER` in both partitions) | **PASS** — A's copy carries A's fee total | **BLOCKED** — B's copy is a different invoice (different amount), unreachable from A | B-8 |
| **Detail by id/number** (`getInvoice`) | **PASS** — own id and own number resolve | **BLOCKED** — `null`, identical to an unknown id | B-9 |
| **Derived readers** (`getInvoiceTransactions`, `getInvoiceLineItems`, `getInvoiceTimeline`, `invoiceStatementCsv`) | **PASS** — own invoice returns rows/items/events/CSV | **BLOCKED** — foreign id ⇒ `[]` / `null`; line-item sums still equal the invoice total | B-9 |
| **Filters, ranges, sorts** (`q`, `status`, `range`, `sort`, `page`) | **PASS** — every page/sort of A is A-only | **BLOCKED** — B unreachable at any offset, range or ordering | B-10 |
| **Billing summary** (`getBillingSummary`) | **PASS** — outstanding amount/count are A's payables | **BLOCKED** — the aggregate is computed after the tenant predicate, not before | B-11 |
| **Settle** (`payInvoice`) | **PASS** — own payable invoice settles, reference returned | **BLOCKED** — foreign id ⇒ audited `TenantIsolationError`; unknown ⇒ `null`; payment record is composite `(org, invoiceId)` | B-12 |
| **Money-mutation order** (spec B-13; 7B M8 precedent) | **PASS** — scope → read → attribute → write | **BLOCKED** — a refused pay writes nothing *anywhere*, including the actor's own partition; denial record carries ids only (no amount, method or period) | B-13 |
| **Unattributable foreign id** | **PASS** — answers not-found | **BLOCKED** — still writes nothing; attribution is bounded (see report §2.5) and never widens into an unscoped read | B-13 |
| **No context, no tenant** | **PASS** — valid ctx serves | **BLOCKED** — missing ctx rejects on both the list read and the money mutation | B-13b |
| **Export list** (`GET /api/exports/invoices`) | **PASS** — A's periods; exported amount is A's fee total | **BLOCKED** — no B period, no demo prototype statement; `?organizationId=` flagged; `private, no-store` + `Vary: Cookie` | `exports/invoices/route.tenant.test.ts` (6) |
| **Export statement** (`GET /api/exports/invoices/[id]`) | **PASS** — own statement CSV | **BLOCKED** — foreign id ⇒ 404 byte-identical to unknown id (no enumeration oracle); unresolved org ⇒ 401 | `exports/invoices/[id]/route.tenant.test.ts` (6) |
| **MCP `list_invoices` / `get_invoice`** | **PASS** — bound to the request's tenant | **BLOCKED** — foreign id ⇒ `Invoice not found.`; no tenant ⇒ refusal text with zero payload; malformed tenant ⇒ same | `billing-tools.tenant.test.ts` (5) |
| **Actions** (`payInvoiceAction`, `payInvoicesAction`, `createInvoiceAction`) | **PASS** — session ctx via `requireBillingOrganizationContext`; own pay succeeds | **BLOCKED** — cross-tenant pay ⇒ the *same* string as a missing invoice (`"That invoice no longer exists."`); bulk settle scopes per row and reports `{paid, failed}` honestly, charging nothing foreign | `actions/billing.tenant.test.ts` (10) |
| **CSV vocabulary + store privacy** | **PASS** — `invoicesToCsv` header frozen without a tenancy column; `invoiceStatementCsv` prints no owner; `subscriptionsToCsv` client-safe | **BLOCKED** — adding `organization_id` fails R-5/M6; `__kineticInvoiceStore`/`__kineticSubscriptionStore` slots are private to their DAL (tests exempt) | `billing-structural.test.ts` R-3, R-5 |
| **Probes** (`countSubscriptionTenants`, `soleSubscriptionOrganizationId`, `countInvoiceTenants`, `soleInvoiceOrganizationId`) | **PASS** — answer tenancy metadata, never rows | **BLOCKED** — reachable only from fail-closed infrastructure (S-1c pins the consumer set to `customers.ts`, `invoices.ts`, `transactions-unscoped.ts`) | R-4 + `transactions-structural.test.ts` S-1c |

## Negative-path detail (what "BLOCKED" means per surface)

| Attack | Result | Why it is safe rather than merely denied |
|---|---|---|
| `GET /billing/[B-invoice-id]` | `notFound()` — the same page a typo'd id renders | Read path returns `∅`; no 403, so no enumeration oracle |
| `payInvoiceAction` with a foreign id | `"That invoice no longer exists."` — identical to an unknown id | Wire answer uniform; the asymmetry lives in the audit log (`CROSS_TENANT_WRITE` + `recordTenantDenial`) |
| Guessed month key (`INV-2026-03-LEDGER`) | Same as above | Month keys are *predictable by design*; the composite key, not id secrecy, is the control (B-8) |
| Bulk settle containing foreign ids | Rows counted as `failed`, nothing charged, `{paid, failed}` returned | No silent cross-tenant drops and no silent successes |
| `?organizationId=org_beta` on any export | A's data; the attempt is flagged via `normalizeRequestedOrganization` | Session scope always wins |
| Export with an unresolved org | 401 `Unauthorized`, `Cache-Control: no-store`, no body | `UNRESOLVED_ORGANIZATION_ID` sentinel refused before any store read |
| MCP call with no bound tenant | `NO_TENANT` refusal text, zero billing payload | A shared MCP token authorizes the agent, not a tenant |
| Another tenant's payment marking your invoice PAID | Impossible | `applyPayment` reads the owner's partition only (M7 pin) |
| A write that happens before the tenant check | CI red | B-13 asserts no partition anywhere holds the refused key (M8 pin) |
| New exported billing function without ctx | CI red | R-1 ctx-first scan; only pure formatters and row-free probes are exempt |
| A billing `*-unscoped.ts` quarantine appearing | CI red | R-4 forbids it — this slice has no quarantine and stays that way |
| A production billing path importing any quarantine | CI red | R-4 prod-path scan over pages, actions, routes and `domain-tools.ts` |

## Quarantine snapshot (Wave 7D, shrink-only)

**No billing quarantine module exists** (approved deviation from spec §4 — every caller was wireable
in-wave, and R-4 now forbids creating one). The two legacy quarantines shrank:

| Module | Allowlist before 7D | After 7D | Removed by 7D |
|---|---|---|---|
| `server/data/transactions-unscoped.ts` | `LEGACY_LEDGER_SURFACES` 12 | **11** | `invoices` — the derivation now pages through scoped `listTransactions(ctx, …)` |
| `server/data/customers-unscoped.ts` | `LEGACY_CUSTOMER_SURFACES` 2 | **1** | `subscriptions` — the page reads scoped `listCustomers(ctx, …)` (spec P-9's predicted side effect) |
| `server/data/payouts-unscoped.ts` | `LEGACY_PAYOUT_SURFACES` 6 | 6 | — (Wave 7E / D-28) |

Ratchet moves in the same commit: `transactions-structural.test.ts` **S-2** `ALLOWED_UNSCOPED_CONSUMERS`
drops `server/data/invoices.ts`; **S-1c** gains it as a probe consumer (fail-closed infrastructure only);
`customers-structural.test.ts` **Q-2** drops `app/[locale]/subscriptions/page.tsx`.

## Evidence files

- `apps/web/src/server/data/subscriptions.tenant-isolation.test.ts` — 12 tests (B-1..B-6b)
- `apps/web/src/server/data/invoices.tenant-isolation.test.ts` — 16 tests (B-7..B-13b)
- `apps/web/src/server/data/billing-structural.test.ts` — 17 tests (R-1..R-5)
- `apps/web/src/app/api/exports/subscriptions/route.tenant.test.ts` — 6 tests
- `apps/web/src/app/api/exports/invoices/route.tenant.test.ts` — 6 tests
- `apps/web/src/app/api/exports/invoices/[id]/route.tenant.test.ts` — 6 tests
- `apps/web/src/server/mcp/billing-tools.tenant.test.ts` — 5 tests
- `apps/web/src/server/actions/billing.tenant.test.ts` — 10 tests
- `apps/web/src/server/finance/tenant-isolation.probe.test.ts` — the two Wave 7D GAP rows now CLOSED
- `scripts/wave-7d-q6-mutations.py` — the 8-mutation harness, 8/8 reddened then reverted

Total new in this slice: **78 tests**, all green (plus 2 probe rows flipped and 23 legacy
product-behaviour tests moved onto the demo context).
