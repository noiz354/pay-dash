# Balance — manual test procedure (2026-09-01)

Run `pnpm dev` from `apps/web` and start at `http://localhost:3000/en/balance`.

The store is in-memory: restart the dev server to reset top-ups, withdrawals and the payout
schedule. Settlement rule (shared with `/en/payouts`): **destination accounts ending in `0000`
always fail** — use one to exercise the rejection path.

Expected seed state on a fresh start: available balance **`Rp 2.212.783.280`** (one figure,
both breakpoints), pending clearance `Rp 162.079.885`, reserved `Rp 59.790.890`, last payout
2026-08-26.

## A. Header and cards (`/en/balance`)

1. The page shows exactly **one** available-balance figure (`data-testid="balance-available"`,
   `Rp …`); there is no `IDR …` fallback block and no second, different number anywhere.
2. The stats row derives from the same movement list: pending clearance + reserved +
   last payout, all real figures.
3. The 30-day trend chart renders (svg in `data-testid="balance-trend")` and its last point
   equals the available figure; the decorative blur circle is gone.
4. The Auto-Withdrawal card mirrors the real payout settings: `Weekly · Friday`, destination
   `Bank Central Asia **** 1234` (badged Verified), a next-run date, and **no** `Daily`, no
   `4910`, no "Set up schedule" link.
5. The card's **Configure** link goes to `/en/payouts/settings`; **View the full ledger** goes
   to `/en/transactions`.

## B. Top Up

6. **Top Up** opens a dialog (also `?topup=1`); the method select offers exactly the five rails
   (three virtual accounts, QRIS, Card) and the amount field starts empty with the submit
   disabled.
7. Type `25,000,000` (commas, spaces and `Rp` all parse) → submit enables → click
   **Add to balance** → spinner → success panel shows **New available balance** and the header
   figure grows by exactly `Rp 25.000.000`.
8. Close with **Done** (the `?topup=1` param is stripped if you came via the deep link).
9. Search the history for "Top up — BCA Virtual Account" → the new `TOP_UP` row appears,
   status Settled, dated now.
10. Amounts below `Rp 10,000` or non-numeric input show the inline field error and submit
    nothing.

## C. Withdraw

11. **Withdraw** opens a dialog (also `?withdraw=1`); the destination select defaults to the
    verified BCA account and the unverified BNI `**** 0000` is disabled and badged
    "(verifying)".
12. Type `1,000,000` → **Withdraw** → success panel: "Withdrew Rp 1.000.000 — batch
    BATCH-… paid"; **View batch** opens the single-recipient batch on `/en/payouts/BATCH-…`
    with status Paid.
13. The history now has a `WITHDRAWAL` row for the batch (Settled), and the reserved figure on
    a *scheduled* batch shows until it releases.
14. Withdraw to the failing account: the inline error names the partner's reason, links
    **View the rejected batch**, and the available figure is unchanged.
15. An amount above the available balance is rejected inline ("… is available — the
    withdrawal exceeds it") and moves nothing (no new batch).

## D. Auto-Withdrawal card

16. The switch reflects `getPayoutSettings()` (on for the seed). Toggling it off → toast
    "Auto-withdrawal is off" and the card shows **Paused**; toggling on → "is on" and the
    cadence returns.
17. Changing the schedule on `/en/payouts/settings` (e.g. monthly on the 15th) and coming back
    updates the card's cadence and next run; the card never disagrees with the settings page.

## E. Recent Movements

18. The table lists derived rows (settlements, refunds, withdrawals, top-ups), 10 per page,
    newest first, with a type icon and a human status pill.
19. Type / status / date filters and the search box all write to the URL
    (`?type=WITHDRAWAL&status=FAILED&q=…&page=…`); reload keeps the view; **Clear filters**
    resets to `/en/balance`.
20. Pagination appears when more than 10 rows match; the page number is in the URL.
21. Clicking a row opens the record that moved the money: settlements/refunds →
    `/en/transactions/txn_…`, withdrawals → `/en/payouts/BATCH-…`; cmd/ctrl-click opens in a
    new tab. Top-up rows have no link (they are local) and render as plain rows.
22. **Export CSV** downloads `balance-movements-YYYY-MM-DD.csv` honouring the current
    filters; the rejected-withdrawal filter returns exactly that batch's failed rows with
    their reasons in the `note` column.
23. Filter to a zero-row view (e.g. type=TOP_UP + status=FAILED) → the empty state offers a
    top-up deep link or "Clear filters".

## F. Loading, errors and cross-links

24. Throttle the network — the page shows the balance/movements skeleton, not a blank page;
    `loading.tsx` covers the header cards and the table.
25. An unknown balance path renders the not-found state with working links back to
    `/en/balance` and `/en/dashboard`.
26. Every mutating control (top-up, withdraw, toggle) disables itself while its request is in
    flight; toasts report success and failure with the server-computed figures.
