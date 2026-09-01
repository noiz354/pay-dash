# Testing procedure — billing pass (2026-09-01)

Run these yourself; nothing below was executed in this pass (execution override).

## 0. Prerequisites

```bash
cd /home/user/pay-dash && pnpm install
cd apps/web && npx tsc --noEmit
SKIP_ENV_VALIDATION=1 NODE_OPTIONS=--max-old-space-size=1536 \
  npx next dev --turbopack -H 0.0.0.0 -p 3000
```

## 1. Automated

```bash
pnpm vitest run                       # includes src/server/data/invoices.test.ts
pnpm playwright test e2e/billing.spec.ts
```

| Spec | Covers |
|---|---|
| `src/server/data/invoices.test.ts` | seeds + derived months, status/text filters, amount/due sorting, page clamp, line items summing to the total, period containment of billed transactions, chronological timeline, pay / double-pay / unknown, summary recalculation, both CSV shapes |
| `src/components/billing/invoice-status-pill.test.tsx` | all four statuses, `isPayable` matrix, three empty-state variants |
| `e2e/billing.spec.ts` | summary cards, overdue banner, URL filters, row → detail, download button state, `?pay=1` confirmation gate, paid-invoice has no pay button, unknown id → not-found |

## 2. Manual — reading the numbers

| # | Do this | Expect |
|---|---|---|
| 1 | Open `/billing` | Four summary cards: Next Invoice Date, Accrued Fees (+ real delta), Outstanding, Last Payment |
| 2 | Compare "Accrued Fees" with `/transactions?status=SUCCEEDED` | The accrual equals the sum of this month's `fee` column — the cards are derived, not literals |
| 3 | Open any derived invoice (`INV-YYYY-MM-LEDGER`) | Line items grouped by channel; their sum equals the invoice total; "Effective rate" = total ÷ volume |
| 4 | Click **View billed transactions** | Lands on the ledger — the fees are traceable |
| 5 | Look at a month still in progress | Status reads **Draft** (accruing), not Pending |

## 3. Manual — the money path

| # | Do this | Expect |
|---|---|---|
| 6 | Overdue invoice present | A red banner at the top with **View invoice** + **Pay now** (the prototype showed only a badge) |
| 7 | Click **Pay now** | Dialog opens, TEST MODE noted, amount shown in `formatMoney` |
| 8 | Submit without ticking the confirmation | Inline error "Confirm the amount before paying"; nothing is charged |
| 9 | Tick and submit | Button becomes "Processing…" and is disabled; dialog closes; success toast carries a `PAY-…` reference and a **View invoice** action |
| 10 | Re-open that invoice | Status **Paid**, timeline gains a green "Payment received", pay button gone |
| 11 | Try `/billing/<paid-id>?pay=1` | Dialog does not offer a second charge (`isPayable` guard); server rejects with "already paid" |
| 12 | Outstanding card with several open invoices | Pays the earliest-due one; the card total drops after refresh |

## 4. Manual — URL contracts

| # | URL | Expect |
|---|---|---|
| 13 | `/billing?status=OVERDUE` | Only overdue rows, select reflects the value |
| 14 | `/billing?range=3m` | Only the last 3 months of periods |
| 15 | `/billing?sort=amount` | Descending amounts |
| 16 | `/billing?q=4421` | Single row `INV-2023-08-4421` |
| 17 | `/billing/INV-2023-09-5102?pay=1` | Dialog opens on load; closing removes `pay` from the URL |
| 18 | Change any filter | `page` resets, spinner shows next to the invoice count |

## 5. Manual — exports, empties, errors

| # | Do this | Expect |
|---|---|---|
| 19 | **Export Statement** | Downloads `statement-YYYY-MM-DD.csv` honouring the current filters |
| 20 | Row PDF icon | Spinner in place of the icon, then `INV-….csv`, then a success toast |
| 21 | `/api/exports/invoices/INV-NOPE` | HTTP 404 JSON, and the button shows an error toast |
| 22 | `/billing?q=zzzz` | "No invoices match these filters" + Clear filters |
| 23 | `/billing/INV-DOES-NOT-EXIST` | In-shell "Invoice not found" with Back to billing / Contact support |
| 24 | Throttle to Slow 3G and reload `/billing` | Summary cards pulse, table shows `TableSkeleton` (8×5), no layout shift |
| 25 | Force a throw in the summary reader | Only the summary degrades to the retry tile; the invoice table still renders (`SectionBoundary`) |

## 6. Routing / a11y spot-checks

- Breadcrumb "Enterprise" keeps the locale (`/en/dashboard`, not `/dashboard`) — it used raw `next/link` before.
- Tab to an invoice row → focus ring; Enter opens the statement; the download and overflow controls do **not** navigate the row (`data-row-interactive`).
- Cmd/Ctrl-click a row → new tab.
- 375 px: the summary bento stacks to one column, the table scrolls horizontally, the toolbar wraps.
