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

---

# Page 4 — `/[locale]/billing` (audit + build, 2026-09-01)

## User capabilities (intended action → expected outcome)

| Element | Intended action | Before | Now |
|---|---|---|---|
| Breadcrumb "Enterprise" | → dashboard | Raw `next/link`, dropped the locale | Locale-aware `Link` |
| Next Invoice Date | Show the next billing run | Literal "Oct 01, 2023" | Computed first-of-next-month; the auto-debit line links to `/settings/merchant` |
| Accrued Fees / -4.2% | Live accrual | Literals | Sum of this month's ledger fees + real month-over-month delta |
| Filter button | Narrow invoices | Decorative | Status / Period / Sort selects + search, all URL state |
| Export Statement | Download | No handler | `/api/exports/invoices`, filter-aware, pending + toast |
| Invoice ID link | Open the invoice | Linked to a route that did not exist | `/[locale]/billing/[id]` exists; whole row is clickable |
| Amount column | Money | Bare strings, currency in the header | `formatMoney(amount, currency)` |
| Status badge | Paid / Pending / Overdue | Static, Overdue was a dead end | Adds `DRAFT` (accruing); Overdue escalates to a banner with **Pay now** |
| PDF icon | Download the invoice | No handler | `/api/exports/invoices/[id]`, spinner → toast |
| — | Pay an invoice | Missing entirely | `<PayInvoiceDialog/>` + `payInvoiceAction`, reachable via `?pay=1` from banner, card, row menu and detail header |

## Missing UI components (built)

`<BillingSummaryCards/>`, `<OverdueBanner/>`, `<InvoiceFilters/>`,
`<InvoicesTable/>`, `<InvoiceStatusPill/>`, `<InvoiceRowActions/>`,
`<PayInvoiceDialog/>`, `<DownloadInvoiceButton/>`, `<InvoicesEmptyState/>`,
`<InvoiceHeader/>`, `<InvoiceTotals/>`, `<InvoiceLineItems/>`,
`<InvoicePaymentTimeline/>`, plus `loading.tsx` / `not-found.tsx` at both route
levels and `SectionBoundary` isolation around the summary and the table.

## State & feedback gaps (closed)

Summary + table skeletons · `useFormStatus` disabled pay button · download
spinner in place of the icon · sonner toasts carrying the payment reference and
a follow-up action · confirmation gate before any charge · double-pay guard ·
per-widget error isolation · three distinct empty states · overdue rows tinted
rather than merely badged · `aria-live` invoice count.

## Routing dead-ends (closed)

`/billing/[id]` created (and added to `next.config.ts` rewrites) · Export and
PDF buttons now have endpoints · invoice → billed transactions →
`/transactions` · invoice → `/settings/merchant` for the auto-debit method the
summary advertises · locale-preserving breadcrumb · unknown invoice id → in-shell
not-found.

## Data seam

`src/server/data/invoices.ts` — `listInvoices`, `getInvoice`,
`getInvoiceTransactions`, `getInvoiceLineItems`, `getInvoiceTimeline`,
`getBillingSummary`, `payInvoice`, `invoicesToCsv`, `invoiceStatementCsv`.
Client-safe vocabulary in `src/lib/invoice-status.ts`. See ADR-0008.

---

## Page 5 — `/[locale]/settings` (+ merchant, notifications, api-keys, developer)

### User Capabilities (intended action → expected outcome)

| Element | Intended action | Expected outcome |
| --- | --- | --- |
| Sidebar "Merchant / Notifications / API Keys / Developer" | Enter the settings cluster | Land on the section, know where you are |
| Settings hub | See what is configured | Status per section, one click into each |
| Legal name / DBA / address / tax ID / support email | Edit business identity | Values validate and persist |
| Brand logo + brand colour | Restyle checkout & receipts | Live preview, hex validation |
| Statement descriptor | Control the cardholder statement | Uppercased, capped at 22 chars |
| Cancel / Save Changes | Discard or commit edits | Disabled until dirty; Save reports success |
| Global channel switches (email/SMS/dashboard) | Mute a delivery channel | Flip persists immediately |
| Per-topic frequency select | Instant / daily / weekly / off | Persists; critical topics locked |
| Per-topic dashboard + SMS switches | Route a topic to a channel | Persist per topic |
| Copy key button | Copy a secret key | Clipboard + confirmation |
| `more_vert` on a key row | Copy / roll / revoke | Menu with confirmed destructive actions |
| Generate New Key | Issue a credential | Named, scoped, secret revealed once |
| IP field + Add | Restrict API access | Validated, listed, removable |
| Docs card | Read the API reference | Navigates somewhere real |

### Missing UI Components (built this pass)

- **`/settings` did not exist at all** — new hub page + `<SettingsNav/>` tab strip mounted on all five routes.
- `<MerchantProfileForm/>` — the first actual `<form>` on the page: controlled values, dirty tracking,
  disabled-until-dirty Save, Cancel-restores-baseline, inline field errors, live colour swatch + native
  picker, logo fallback, statement descriptor counter, auto-debit switch.
- `<NotificationPreferencesForm/>` — global channel rows and a per-topic matrix with optimistic writes.
- `<ApiKeysTable/>`, `<CreateApiKeyDialog/>`, `<ApiKeyRowActions/>`, `<SecretReveal/>` — data-driven key
  tables, a two-step create flow, reveal-once secrets, confirmed roll/revoke, revoked-row styling.
- `<IpAllowlistManager/>` — validated add, listed rules with labels and dates, per-row remove.
- `<DeveloperToggle/>` — optimistic sandbox-mode / webhook-retry switches.
- Empty states: no keys in an environment, no IP rules.
- `loading.tsx` for all five routes.

### State & Feedback Gaps (closed)

- Nothing on any settings screen persisted; there were no pending, success or error states anywhere.
  Every control now writes through a Server Action and reports via sonner.
- Two deliberate idioms: **transactional** (merchant form — explicit Save, dirty guard, `beforeunload`)
  and **ambient** (switches/selects — optimistic flip with rollback on failure).
- Destructive key actions gate on an explicit checkbox and show a working spinner.
- Critical topics are disabled in the UI *and* rejected in the data layer, so the lock cannot drift.

### Routing Dead-Ends (fixed)

- `/settings` 404 → hub page; also added to the sidebar.
- Notifications breadcrumb `<a href="#">` → locale-aware `Link` to `/settings`; the same breadcrumb
  added to merchant, api-keys and developer.
- Developer docs card `<a href="#">` → `/support`.
- Developer webhook card → `/webhooks` console; developer API-keys card → `/settings/api-keys`.
- Hub "Related settings" surfaces `/payouts/settings`, `/webhooks`, `/billing`.

---

## Page 6 — `/[locale]/payouts` (+ `[id]`, bulk, settings)

### User Capabilities (intended action → expected outcome)

| Element | Intended action | Expected outcome |
| --- | --- | --- |
| Sidebar "Bulk Payouts" / "Payout Settings" | Enter the payouts area | Land under a real `/payouts` parent |
| Payout history | Find a past disbursement | Filterable, sortable, paginated batch list |
| Summary cards | Read exposure | Derived money figures, each linking to the filtered view |
| Batch row | Inspect a disbursement | Route to `/payouts/[id]` with recipients and outcomes |
| New Batch | Start a disbursement | Dialog with upload/paste, preview and create |
| Drop zone | Upload recipients | Real file input, drag & drop, parse, validate, preview |
| Download Template | Get the CSV schema | Generated from the parser itself |
| Release funds | Pay the batch | Confirmed dialog, deterministic settlement, result toast |
| Cancel batch | Stop a scheduled batch | Rows returned, nothing paid, timeline entry |
| Retry | Recover a failure | Per-row and per-batch retry with pending state |
| Export Log / Recipients CSV | Reconcile | Filtered batch CSV + per-batch recipient CSV |
| Automated payouts / cadence / threshold | Configure the schedule | Dirty-tracked form, conditional day field, parsed amount |
| Change (destination) | Swap bank account | Account list, verification gate, add-account form |

### Missing UI Components (built this pass)

- **`/payouts` index** (route did not exist) with `<PayoutsSummaryCards/>`, `<BatchFilters/>`,
  `<BatchesTable/>`, `<BatchesEmptyState/>`, plus a `/payouts` sidebar entry.
- **`/payouts/[id]`** batch detail: header with derived status and four totals, `<RecipientsTable/>`
  (per-row status, failure reason, retry), `<BatchTimeline/>`, `<RetryFailuresButton/>`.
- `<BatchUploadDropzone/>` — file input + drag/drop + paste, 2 MB guard, live parse.
- `<RecipientPreviewTable/>` — valid/rejected tabs, per-line reasons, rejected-rows export.
- `<CreateBatchDialog/>` (`?new=1`) and `<ReleaseBatchDialog/>` (`?send=1` / `?cancel=1`).
- `<PayoutScheduleForm/>` — dirty state, conditional weekday / day-of-month, parsed threshold.
- `<DestinationAccountDialog/>` — account list, verification gate, inline add-account form.
- `<PayoutStatusPill/>` / `<RecipientStatusPill/>`, `loading.tsx` ×4, `not-found.tsx` ×2.

### State & Feedback Gaps (closed)

- No batch entity existed, so no state could be shown; batches now carry a derived status and a
  timeline of every create/release/retry/cancel.
- Money was rendered as broken literals (`,250,890.00`); everything goes through `formatMoney`.
- The upload had no progress, validation or partial-failure reporting — the highest-stakes
  interaction with the least feedback. It now reports "N valid / M invalid" *before* submission.
- Disbursement and cancellation are gated behind an explicit confirmation checkbox.
- Failure is recoverable at two granularities, each with its own pending state and toast.
- Schedule form gained dirty tracking, a working Discard, and validation on cadence and amount.

### Routing Dead-Ends (fixed)

- `/payouts` 404 → real index; added to the sidebar.
- "Download Template" `href="#"` → generated CSV (client download + `/api/exports/payout-template`).
- Bulk breadcrumb "Payments" `<span>` → locale-aware `Link` to `/payouts`.
- Stat cards and "3 active batches" now link into filtered lists and batch detail.
- Cross-links added: index ↔ bulk ↔ settings, detail → `/balance`, settings → `/settings/notifications`.
