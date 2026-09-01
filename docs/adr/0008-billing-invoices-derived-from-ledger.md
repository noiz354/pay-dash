# ADR-0008 — Billing: invoices derived from ledger fees, payment as a first-class action

- **Status:** Accepted
- **Date:** 2026-09-01
- **Relates to:** ADR-0006 (Server Actions + URL state), ADR-0007 (customer directory, proxy activation)

## Context

`/[locale]/billing` was a static screen: three hard-coded invoice rows, a
decorative **Filter** button, an **Export Statement** button with no handler, a
per-row `picture_as_pdf` button with no handler, and two summary cards whose
numbers ("Oct 01, 2023", "12,450,000", "-4.2%") were literals. The invoice IDs
already linked to `/billing/[id]` — a route that did not exist. Most seriously,
an invoice could be labelled **Overdue** and the UI offered no way to pay it:
the page named a problem it could not solve.

## Decision

**1. An invoice is one calendar month of ledger fees.**
`src/server/data/invoices.ts` groups settled transactions (`SUCCEEDED` /
`REFUNDED`) by month and sums the `fee` column. Consequences:

- the accrual card, the invoice total, the line items and the "billed
  transactions" list are all the same number seen from different angles;
- "what am I being charged for?" is a link (`getInvoiceTransactions`), not a
  support ticket;
- line items are grouped by channel, so the breakdown explains itself.

**2. Status is computed, not stored.** A period that is still open is `DRAFT`
(accruing), a closed period past its due date is `OVERDUE`, otherwise `PENDING`;
payment overrides it to `PAID`. `DRAFT` is a new status the prototype had no
concept of, and it removes the lie of showing an unfinished month as billable.

**3. Payment is a real Server Action.** `payInvoiceAction` requires an explicit
confirmation checkbox, refuses to double-pay (`isPayable`), and returns a
payment reference surfaced in the success toast. `payInvoicesAction` settles a
batch and reports partial failures rather than swallowing them. Payments are
recorded as overrides in the in-memory seam — nothing is mutated destructively.

**4. Payment is reachable from everywhere it is relevant** through one deep
link, `?pay=1` (or `?pay=<id>`): the overdue banner, the outstanding-balance
card, the row overflow menu and the invoice header all open the same dialog,
and the param is stripped from the URL when it closes.

**5. Exports are real endpoints.** `/api/exports/invoices` honours the current
filters; `/api/exports/invoices/[id]` returns a single statement. Both emit CSV
— the sandbox has no PDF renderer, and a button that lies is worse than a button
that is honest about its format. The file name keeps the invoice number so the
download is recognisable.

**6. The seeded prototype invoices stay.** `SEED_INVOICES` carries the three
original rows (with their real amounts) so the page still shows the history it
always did; their line items are reconstructed from totals when no ledger rows
exist for that period.

## Alternatives considered

- **A standalone invoice table** — rejected for the same reason as the customer
  directory: a second source of truth for money invites drift.
- **Marking invoices paid without confirmation** — rejected; a one-click,
  irreversible money action with no confirmation is a support incident.
- **Rendering a PDF** — deferred. The route boundary (`/api/exports/invoices/[id]`)
  is in place, so swapping CSV for a PDF renderer is a single-file change.

## Consequences

- New routes `/[locale]/billing/[id]` (+ `loading` / `not-found` for both
  levels) and two export endpoints; `next.config.ts` gained `/billing/:id`.
- `src/lib/invoice-status.ts` holds the client-safe vocabulary (`INVOICE_STATUSES`,
  labels, icons, `isPayable`) because the data module imports `server-only`.
- The breadcrumb now uses the locale-aware `Link` from `@/i18n/navigation`; the
  previous `next/link` import dropped the locale prefix.
