# 0021 — Subscriptions: plans the app can hold

Date: 2026-09-02
Status: Accepted

## Context

`/subscriptions` was the app's last pure mockup:

1. **Invented stats** — "Active Plans **1,248** (+12% vs last month)",
   "Pending Setup 42", "Inactive/Failed 18 (−3 recovered this week)" — and
   the table footer's "Showing 1 to 10 of **1,290** entries" contradicted
   the cards (the same 1,248 the reports builder faked; the actual ledger
   holds 46 rows).
2. **Three hard-coded rows** — TechFlow Solutions / `sub_1Mvw8K` / Oct 24
   **2023**, Global Dynamics / Pending Setup, Nexus Industries / **Past Due**
   (not an app status — the invoice vocabulary says "Overdue") — customer
   names absent from the customer store, unformatted amounts, and **two rows
   loading third-party avatars from `lh3.googleusercontent.com`**.
3. **A config surface with zero wiring** — search, Filter, Export, Create
   Subscription, every ⋮ and every pagination button had no handler.
4. **No model anywhere** — `server/data/` has no subscriptions store; the
   v7 SDK product list (INTEGRATION.md:40) has no Subscriptions product.
   INTEGRATION.md (:96/:119) maps the screen to `Invoice.getInvoices()`
   *with recurring filters* — but the Invoice model is the **platform's own**
   billing (2023-dated, "Imported from the launch prototype",
   PAID/PENDING/OVERDUE/DRAFT, no recurring dimension, no such filter) and
   cannot represent customer plans.

## Decision

The app holds its plans in its own store and the page runs over them:

**1. `server/data/subscriptions.ts` — deliberately seeded** (the ADR-0019
distinction, stated): **10 plans tied to real customer-directory
customers** — every plan's `customerId` is `customerIdFromEmail(…)` (the same
pure hash the directory uses), so "View customer" always resolves. A plan is
a business record the merchant's app "would have generated" — the same class
as links, batches and webhooks (all seeded), **not** an unverified claim
about the merchant's identity (the KYC class). The ledger's own description
pool already contains "Subscription renewal — Growth plan", so the fiction
includes recurring billing. Fields: `id (sub_…)`, `planName`,
`customerName/Email/Id`, `interval (monthly|yearly)`, `amount (IDR)`,
`status (ACTIVE | PENDING_SETUP | PAST_DUE | CANCELLED)`, `startedAt`,
`nextBillingAt`, `cancelledAt`. `listSubscriptions({q,status,sort,page,
pageSize})` mirrors `listCustomers`; `createSubscription` lands new plans in
**PENDING_SETUP** (the customer confirms before the first charge — the app
never claims a plan is live the moment it is made); `subscriptionSummary`
derives the cards (active count + **MRR** = monthly face value + yearly ÷ 12);
`subscriptionsToCsv` lives client-safe in `lib/subscription-csv.ts`.

**2. The page runs a real query** — searchParams-driven like
`/customers` (`q`, `status`, `page`): real debounced search (plan/customer/
id), real status filter, real `TablePagination`; stat cards derived from the
store (Active + MRR, Pending setup, Past due + outstanding — **no invented
"+12%" deltas**).

**3. Real rows** — initials avatars (no external images), `Rp …` amounts via
`formatMoney`, token status chips, started + next-billing dates, and ⋮ = a
**real dropdown** (View customer → `/customers/[id]`, View payments →
`/transactions?q=<email>`, Copy plan ID).

**4. Real export** — the app's established convention:
`/api/exports/subscriptions` mirrors the URL filters
("what you see is what you export", same contract as
`/api/exports/customers`) + the shared `ExportCsvButton`.

**5. Real create** — a dialog backed by `createSubscriptionAction`: the
customer is picked **from the real directory** (so "View customer" always
resolves), plan name + IDR amount + interval, server-validated; success view
shows the new plan id; the list re-renders with the plan first
(PENDING_SETUP, newest-first).

**6. Dropped** — the invented stats + trends, the 3 hard-coded rows, the
third-party avatars, the 2023 dates, dead search/filter/pagination/⋮,
unformatted amounts. `metadata` added.

## Consequences

- The seed is date-relative (anchored to server start, like the other
  stores) and content-deterministic; counts are stable (10 plans: 6 active /
  MRR Rp 94,550,000 · 2 pending · 1 past due · 1 cancelled).
- A plan for a customer the directory doesn't know is impossible through the
  UI — the create dialog only offers directory customers.
- Restart returns the page to its seeded state (in-memory store, same as its
  siblings).

## Alternatives considered

- *Honest empty page (ADR-0019 pattern).* Rejected: a subscription plan is a
  business record, not an identity claim — the class distinction the KYC ADR
  itself draws ("every other seed is a consistent fiction the app 'would
  have generated'"). An empty main-nav stub would also leave Create/Export
  dead again.
- *Map plans onto the Invoice store via a recurring filter.* Rejected: the
  Invoice model has no recurring dimension (it is platform billing), and a
  regex over line-item labels would be a filter the data doesn't support.
- *A `subscriptions/[id]` detail page.* Deferred: the row actions already
  route to the customer and the ledger; no prototype surface implies a plan
  detail.

## Verification

- **Unit** — `src/server/data/subscriptions.test.ts` (7): 10 seeded plans all
  resolving to real directory customers; status mix + MRR (Rp 94,550,000)
  and past-due total; cancelled plans have no next billing; query/status
  filters + amount sort; pagination bounds/clamp; create → PENDING_SETUP
  with future first billing and directory id; CSV shape (11 columns, raw
  values, cancelled row's empty `next_billing_at`).
- **Gate** — `pnpm typecheck` clean; `pnpm lint` 0 errors; vitest green.
- **SSR (dev server, 2026-09-02)** — `/en/subscriptions` renders the derived
  cards (MRR Rp 94.550.000), the real rows (Initech BV, `sub_…` ids, `Rp`
  amounts); no `1,248`/`1,290`/`TechFlow`/`Oct 24, 2023`/external avatars;
  `/api/exports/subscriptions` returns the CSV.
- **E2E** — `e2e/subscriptions.spec.ts` (5, serial, CI-runnable): invented
  artifacts absent + derived cards; search/status narrowing via URL state;
  **create-dialog round trip** (dialog → PENDING_SETUP row → count
  follows); **export downloads** the filtered row with the 11-column header;
  row actions open a real menu and route to `/customers/…`.
  `uat-journeys.spec.ts` **F7** (previously red — it asserted a "Budi"
  customer and Calendar/Subscriptions tabs the page never had) rewritten to
  assert the real store (no absolute count — a prior spec may create a plan
  in the shared in-memory store).
- Manual procedure: `docs/audit/subscriptions-test-procedure-2026-09-02.md`.
