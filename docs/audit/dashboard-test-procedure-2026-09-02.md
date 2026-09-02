# Dashboard — manual test procedure (2026-09-02)

Run `pnpm dev` from `apps/web` and start at `http://localhost:3000/en/dashboard`.

The store is in-memory: restart the dev server to reset the checklist cookie,
top-ups, withdrawals and the payout schedule.

## A. Header

1. The greeting reads **`Welcome back, Acme`** — the trading name from the
   merchant profile. There is no "Sarah" anywhere.
2. Edit the trading name on `/en/settings/merchant` (e.g. `Kinetic`) and
   reload the dashboard → the greeting follows the profile.
3. **New Transaction** opens the create dialog (validated submit, toast with
   a View action); **Download Report** downloads the ledger CSV.

## B. Setup Progress checklist

4. The **Connect Bank Account** row is ticked with a `Linked · **** 1234`
   badge and **no checkbox** — it is derived from the verified destination
   account, not self-attested. The ring counts it as done.
5. The other three rows tick/untick with an optimistic check and a toast;
   the state survives a reload (cookie-backed).
6. The **Continue: …** CTA points at the first genuinely open step (it skips
   the derived-done bank step).
7. On `/en/payouts/settings`, mark the destination account unverified (add a
   new unverified account and switch to it) → the bank row reverts to a
   manual checkbox. Restore it and the badge returns.

## C. Balance strip

8. The strip shows the available figure, pending clearance, reserved and
   last payout; the figure is byte-identical to the one on `/en/balance`.
9. **View balance & history** navigates to `/en/balance`.
10. Top up `Rp 25.000.000` on `/en/balance`, return to the dashboard → the
    strip reflects the new figure (same derivation, no drift).

## D. Metrics and quick actions

11. The three metric tiles show derived figures with week-over-week pills;
    clicking a tile opens the pre-filtered ledger
    (`?range=7d`, `?status=SUCCEEDED&range=7d`, `?status=FAILED&range=7d`).
12. Quick actions: **Invoices** → `/en/billing` (there is no "Create
    Invoice" tile — invoices are derived, not authored); **Add Customer** →
    the create dialog opens immediately (`/en/customers?new=1`);
    **Payouts** → bulk upload; **API Keys** → the key manager.

## E. Analytics chart

13. Default view is 7 days; the tabs (7 / 30 / 90 days) put the range in the
    URL (`?range=30d`) — reload keeps it, and a bogus value falls back to 7.
14. Switching ranges shows the chart skeleton briefly, then the matching
    window — never stale data.
15. The `Volume / Succeeded / Failed` chips toggle series on and off; the
    last remaining series cannot be hidden.
16. The y-axis and tooltip format money in the ledger currency; the footer
    shows today's total. With an empty ledger (fresh store, no seeds) the
    chart shows its empty state, not an error.

## F. Recent transactions and shell

17. Five most recent rows, newest first; each row has a `⋯` menu with real
    actions; clicking a row opens `/en/transactions/txn_…`.
18. **View all** → `/en/transactions` with its full filter toolbar.
19. Throttle the network — every region (checklist, metrics, strip, chart,
    table) shows a skeleton; the 3D hero degrades to its placeholder and
    never blocks first paint.
20. The sidebar marks the dashboard active; the TEST MODE banner remains.
