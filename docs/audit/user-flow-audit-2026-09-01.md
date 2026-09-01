# User-Flow & Component Audit — 2026-09-01

Scope: the primary merchant journey, walked page-by-page starting at
`/[locale]/dashboard` and following the routes it exposes.
Method per page: (1) enumerate interactive elements + intended outcome,
(2) audit missing components / interaction states, (3) audit routing dead-ends,
(4) build what's missing, then follow the new routes to the next page.

Legend: ❌ missing before this pass · ✅ built in this pass · ⏭ backlog.

---

## Page 1 — `/[locale]/dashboard`

### 1. Interactive inventory

| # | Element | Intended action | Expected outcome | Before |
|---|---|---|---|---|
| 1 | **New Transaction** button | Open a create-payment form | Modal, validated submit, ledger updated | ❌ `<Link href="/transactions">` — a nav link disguised as a create CTA |
| 2 | **Download Report** button | Export ledger data | CSV file downloads | ❌ inert `<Button>`, no handler |
| 3 | **Setup Progress** checklist | Tick / untick onboarding steps, jump to the screen that completes them | Persisted state, % ring updates, deep link | ❌ hard-coded static markup (60%, two ticks), no links, no state |
| 4 | Metric cards (Volume / Subscriptions / Failed) | Drill into the filtered ledger | Navigate to pre-filtered `/transactions` | ❌ hard-coded strings (`$1.24M`, `8,402`, `0.8%`), not clickable |
| 5 | Quick actions (Invoice / Customer / Payouts / API keys) | Navigate | Route change | ✅ already linked |
| 6 | Analytics chart | Read daily volume | Real series, tooltips | ❌ component supported `data`/`isLoading` but the page passed nothing → permanently mocked |
| 7 | **Recent Transactions** rows | Open a payment | `/[locale]/transactions/[id]` | ❌ 2 hard-coded `<tr>`s (`txn_001`, `txn_002`), not clickable, no destination route |
| 8 | Row overflow `⋯` | Contextual actions | Menu with real actions | ❌ absent on dashboard, inert on ledger |

### 2. Missing components & interaction states

| Gap | Resolution |
|---|---|
| No create-payment surface | ✅ `components/transactions/create-transaction-dialog.tsx` — shadcn `Dialog`, zod-validated Server Action, inline field errors, `useFormStatus` disabled/spinner submit, success toast with **View** action → detail page |
| No mutation feedback anywhere in the app | ✅ `<Toaster/>` (sonner) mounted in `app/layout.tsx`; success/error toasts on create, refund, retry, copy, export, checklist toggle |
| No loading skeletons for data regions | ✅ per-region `<Suspense>` on the dashboard (checklist, metrics, chart, table) + `components/common/table-skeleton.tsx`; chart already had `isLoading` — now actually reachable |
| No empty states | ✅ `components/common/empty-state.tsx` (built on the unused `ui/empty` primitive) + table-level empty variants that distinguish “no data yet” (offers create CTA) from “no match for filters” (offers clear-filters) |
| No error boundary | ✅ `app/[locale]/error.tsx` with `reset()` recovery |
| Checklist not persistable | ✅ `server/actions/setup.ts` (cookie-backed) + `components/dashboard/setup-step-toggle.tsx` with `useOptimistic` so the tick lands instantly |
| Metrics not derived | ✅ `getLedgerMetrics()` — 7d vs previous-7d deltas, tone-aware pills |

### 3. Routing / dead-ends

- “New Transaction” → **no longer navigates**; it opens the modal (create-intent ≠ list-intent).
- Metric cards → `/transactions?range=7d`, `?status=SUCCEEDED`, `?status=FAILED` (filters honoured server-side).
- Checklist rows → `/settings/merchant`, `/payouts/settings`, `/payments/links`, `/webhooks`; a **Continue: <next step>** CTA points at the first incomplete item.
- Recent rows → `/[locale]/transactions/[id]` (route did not exist; **created**).
- “View all” → `/transactions`.
- Sidebar had a dead `activeHref` prop no caller ever passed → every screen rendered a state-less nav. ✅ now derives active state from `usePathname()` and sets `aria-current="page"`.

---

## Page 2 — `/[locale]/transactions` (reached from rows / “View all” / metrics)

### 1. Interactive inventory

| # | Element | Intended action | Before |
|---|---|---|---|
| 1 | Status / Date / Channel selects | Filter the ledger | ❌ decorative `Select`s — `defaultValue` only, no state, no query |
| 2 | “More filters” | Open advanced filter panel | ❌ inert button |
| 3 | Search input | Free-text filter | ❌ uncontrolled, no handler |
| 4 | Select-all / row checkboxes | Bulk selection | ❌ no selection state, no bulk action bar |
| 5 | Export CSV | Download the current view | ❌ inert |
| 6 | Create Payment | Create a payment | ❌ inert |
| 7 | Row `⋯` | Per-row actions | ❌ inert button |
| 8 | Pagination | Page through 14,263 results | ❌ hard-coded “Page 1 of 2853”, next button did nothing |
| 9 | Rows | Open the payment | ❌ not clickable |

### 2. + 3. Resolution

- ✅ **URL as filter state** — `components/transactions/transaction-filters.tsx` writes `status`, `range`, `channel`, `q` into the query string (debounced search, `useTransition` pending spinner, live result count, **Clear filters**). Shareable, back-button-safe, server-rendered.
- ✅ **Working pagination** — `components/transactions/table-pagination.tsx`, real `page`/`pageCount`/`total`, disabled edges, preserves filters, resets on filter change.
- ✅ **Rows are links** — `components/transactions/clickable-row.tsx`: whole-row click, `Enter`/`Space`, ⌘/Ctrl-click opens a new tab, hover prefetch, focus ring; children marked `data-row-interactive` (menus/checkboxes) keep their own clicks.
- ✅ **Row actions menu** — `row-actions.tsx`: View details · Copy reference ID · View customer · Refund… (deep-links `/transactions/[id]?refund=1`) · Retry (failed only, Server Action + toast) · Dispute/contact support.
- ✅ **Export CSV** — `export-csv-button.tsx` → `GET /api/exports/transactions` honouring the active filters; loading → success/error toast, real file download.
- ✅ **Create Payment** — same `<CreateTransactionDialog/>` as the dashboard.
- ✅ **Skeleton + empty + error** — `transactions/loading.tsx`, keyed `<Suspense>` so the skeleton reappears on every filter round-trip, filter-aware empty state, shared route error boundary.
- ✅ Metrics row is derived from the data instead of hard-coded `$2,450,892 / 14,239 / 24 / 18`.
- ⏭ Bulk selection toolbar (select-all → bulk export/refund) and the “More filters” panel: the decorative checkboxes were removed rather than left as fake affordances; selection is the next increment.

---

## Page 3 — `/[locale]/transactions/[id]` (**new route**)

Did not exist — the entire ledger was a dead end. Built:

| Element | Behaviour |
|---|---|
| Breadcrumb | Dashboard → Transactions → reference ID |
| Header | Reference ID (`data-mono`), status pill, **Copy ID** (clipboard + toast) |
| Payment summary | Amount / fee / net / refunded / channel / method / risk score / timestamps / description |
| Customer card | Name, email, **View customer**, copy email, “All payments from this customer” → `/transactions?q=<email>` |
| Event timeline | Created → authorized → captured / declined / refunded, UTC timestamps, tone-coded markers |
| Raw payload | Pretty-printed JSON + copy |
| **Refund** | `refund-dialog.tsx` — max-amount validation, reason, pending spinner, toast, `revalidatePath`; disabled when nothing is refundable; auto-opens on `?refund=1` |
| **Retry payment** | Shown instead of Refund for `FAILED`; Server Action + toast |
| Contact support | `/support?ref=<id>` |
| Loading / not-found | `loading.tsx` skeleton, `not-found.tsx` with back-to-ledger + support CTAs |

---

## Cross-cutting

- **Data seam** — `server/data/transactions.ts` is the single source for list/detail/metrics/analytics/CSV plus the `create`/`refund`/`retry` mutations. It seeds a deterministic 46-row ledger so the flows are exercisable without Postgres; swapping in the Prisma DAL (`server/dal/ledger.ts`) touches this file only.
- **Server Actions** — `server/actions/transactions.ts` (create/refund/retry, zod-validated, `ActionState` with `fieldErrors`) and `server/actions/setup.ts` (checklist).
- **Formatting** — `lib/format.ts` centralises IDR/compact money, UTC dates (SSR-stable, no hydration drift), percent deltas.
- **Primitive adoption** (`AGENTS.md`: wire the unused 94) — newly used: `dialog`, `dropdown-menu`, `empty`, `sonner`, `spinner`, `native-select`, `textarea`, `breadcrumb`, `separator`, `skeleton`, `select`, `badge`-style pills.

## Backlog (next passes, same loop)

1. `/[locale]/customers` — `?q=` deep-link from transactions is not yet consumed; needs detail route `customers/[id]`.
2. Bulk selection + bulk actions on the ledger; “More filters” panel (amount range, risk score).
3. `href="#"` placeholders still present on: `balance`, `payments/links` (tabs), `payouts/bulk`, `settings/api-keys`, `settings/developer`, `settings/notifications`, `support` (7 files).
4. `/support?ref=` should prefill the ticket form.
5. `TopBar` (search, ⌘K, profile) is built but mounted nowhere.
6. Swap the in-memory store for the Prisma DAL once `DATABASE_URL` is provisioned.

---

# Page 3 — `/[locale]/customers` (audit + build, 2026-09-01)

## User capabilities (intended action → expected outcome)

| Element | Intended action | Before | Now |
|---|---|---|---|
| Search input | Filter the directory | Decorative — no state, no handler | URL `?q=`, 350 ms debounce, server-rendered, deep-linkable |
| "Filter" button | Narrow the list | Decorative | Replaced-by-addition: real Status + Sort selects (`?status=`, `?sort=`); original button preserved in `StaticCustomersPreview` |
| Select-all checkbox | Select rows | No selection model | Drives a bulk action bar (copy emails / archive / clear) |
| Row | Open the customer | Not clickable | `ClickableRow` → `/[locale]/customers/[id]` (Enter, cmd-click, prefetch on hover) |
| `more_horiz` | Row actions | No handler | View profile / View payments / Copy email / Edit / Archive-Restore |
| "2,104 Total" | Show the count | Hard-coded | Real `result.total` |
| Prev/Next | Paginate | Permanently disabled | `TablePagination`, URL `?page=`, disabled only at the edges |
| LTV column | Show lifetime value | `",520.00"` — currency prefix lost | `formatMoney(lifetimeValue, currency)` |
| "Add Customer" | Create a customer | No handler | `<CreateCustomerDialog/>` + `createCustomerAction` |
| "Export" | Download the list | No handler | `/api/exports/customers`, honours current filters |

## Missing UI components (built)

`<CreateCustomerDialog/>`, `<EditCustomerDialog/>`, `<CustomerFilters/>`,
`<CustomersTable/>`, `<CustomerRowActions/>`, `<CustomerStatusMenu/>`,
`<CustomerStatusPill/>`, `<CustomerAvatar/>`, `<CustomerEmptyState/>`,
`<CustomerHeader/>`, `<CustomerLifetimeStats/>`, `<CustomerPaymentMethods/>`,
`<CustomerTransactionsPanel/>`, plus `loading.tsx` / `not-found.tsx` for both
routes and `SectionBoundary` isolation on the profile.

## State & feedback gaps (closed)

Skeletons (`TableSkeleton`, pulsing metric cards) · `useFormStatus` disabled
submit buttons · sonner success/error toasts with follow-up actions · optimistic
status switch on the profile · pending spinner in the toolbar during transitions
· per-widget error boundaries · three distinct empty states · avatar initials
fallback.

## Routing dead-ends (closed)

`/customers/[id]` created · `?new=1` and `?q=` now consumed (and `?new=1`
cleaned from the URL on close) · profile → `/transactions?q=<email>` ·
transaction detail "View customer" → the profile instead of a filtered list ·
unknown ids → in-shell not-found · unmatched bare paths → in-shell 404 via the
newly-activated proxy.

## Data seam

`src/server/data/customers.ts` derives the directory from the ledger, seeds the
three prototype rows instead of deleting them, and exposes
`listCustomers` / `getCustomer` / `getCustomerTransactions` /
`getCustomerMetrics` / `createCustomer` / `updateCustomer` / `customersToCsv`.
See ADR-0007.
