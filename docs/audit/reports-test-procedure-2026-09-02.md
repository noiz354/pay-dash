# Reports builder — manual test procedure (2026-09-02)

Run `pnpm dev` from `apps/web` and start at
`http://localhost:3000/en/reports/builder`. The preview is the app's real
data (deterministic seed): 46 ledger rows, 5 payout batches, 11 customers.

## A. The preview is the data

1. Count chip: **46 of 46 rows**. No "1,248", no `txn_1Nj8V2`, no
   `sarah.jenkins@example.com`, no "Oct 24" dates, no "Amount (USD)".
2. Columns (default): Transaction ID, Date & Time, Amount, Status,
   Customer Email. Amounts render as `Rp …` (IDR), statuses as token chips.
3. Each Transaction ID is a link → its real detail page
   (`/en/transactions/…`). No "Schedule" button, no "Apply" button, no
   fake "1-50 of 1,248" pagination.
4. Sidebar footnote: disputes have no separate model — refund facts live in
   the ledger (status REFUNDED).

## B. Data source

5. Select **Payouts** → the preview becomes the 5 batches (**5 of 5 rows**):
   Batch (`BATCH-2026-…`, links to `/en/payouts/…`), Name, Created,
   Recipients count, Total (`Rp …`), Source, Status.
6. Select **Customers** → **11 of 11 rows**: Name (links to
   `/en/customers/…`), Email, Customer Since, Lifetime Value, Payments,
   Success Rate, Status.
7. Filters and column defaults reset per source (Payouts/Customer column
   sets are different; a stale status filter does not carry over).

## C. Filters run live

8. Back on Transactions:
   - Status → **Refunded** → chip flips to **2 of 46 rows**; all rows are
     Refunded.
   - Amount min `5000000` → the chip drops further; the table follows
     immediately (no Apply step).
   - Date range: **7D** / **30D** / **YTD** fill both date inputs from
     today; typing a Start date narrows the set.
   - **Reset** restores all 46 rows and the default columns.
9. Nothing matches (e.g. Amount min `999999999999`) → empty state "No rows
   match these filters" with a working **Clear filters**; Export CSV is
   disabled.

## D. Columns + CSV

10. Uncheck **Customer Email** → the column disappears from the preview
    (and from the CSV). Re-check → it returns.
11. **Export CSV** downloads `kinetic-transactions-<today>.csv`:
    - header = exactly the selected column keys
      (`reference_id,created_at,amount,status,customer_email` by default);
    - one line per previewed row, **raw values** (ISO timestamps, numeric
      amounts — not `Rp …`);
    - with Status → Refunded: exactly 2 data lines, each starting `txn_`.
12. The footer states the contract: the CSV contains exactly the previewed
    rows and columns.

## E. Cross-links

13. Support → "Reporting & Export" card (ADR-0016) lands here on a page
    that answers its promise.
