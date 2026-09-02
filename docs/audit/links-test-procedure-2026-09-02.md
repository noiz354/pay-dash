# Payment Links — manual test procedure (2026-09-02)

Run `pnpm dev` from `apps/web` and start at
`http://localhost:3000/en/payments/links`.

The store is in-memory: restart the dev server to reset created links,
simulated payments and closed links.

## A. The list (single tab by default)

1. Five rows: `plink_8x9a2b1c` (Paid), `plink_3k4m5n6p` (Paid),
   `plink_9q8w7e6r` (Expired), `plink_7f8g9h0j` (Cancelled),
   `plink_4c5d6e7f` (Open) — newest first. Every amount is `Rp …` IDR;
   there is no `",250.00"` literal and no `IDR 500,000.00` anywhere.
2. The toolbar reads **5 links**; the status select filters
   (`?status=PAID` → exactly the two paid rows); the search box (350 ms
   debounce) matches id, payer email or item label — `starkindustries`
   finds nothing in the single tab (both stark links: one cancelled single,
   one open multiple); **Clear filters** drops `q` + `status` + `page` but
   keeps the kind tab.
3. Payer email shows `—` when the link has none (`plink_4c5d6e7f`).

## B. The kind tabs

4. **Single item / Multiple items** are the two tabs; the multiple tab puts
   `?kind=multiple` in the URL (single is parameter-free). Reload keeps the
   tab; other filters (`q`, `status`) survive the switch.
5. Multiple tab: three rows — `plink_2z3x4c5v` (Open, 4 items,
   `Rp 58.750.000`), `plink_1a2s3d4f` (Open, 2 items, `Rp 27.500.000`),
   `plink_0a1b2c3d` (Expired, 3 items, `Rp 21.200.000`). Rows summarise
   line items as `N items — label, label, …`.

## C. Detail page

6. Click a row → `/en/payments/links/<id>`. Header: mono id + status pill +
   copy; subtitle `Rp … · Single item/Multiple items · created <date>`.
7. The **Checkout URL** card shows `https://pay.kinetic.test/<id>` with a
   working copy button. Items card lists every line item and the total.
8. Detail rows: Type, Payer email, Created, Expires (or "No expiry"), and —
   only when set — Paid / Closed.
9. The status note matches the state: open links say who can still pay and
   offer TEST MODE; paid links say when it was captured; expired/cancelled
   links say the URL no longer accepts payment and why.
10. Unknown id → the not-found state with **Back to links** and
    **Create a link**.

## D. Creating links

11. **New link** (or `/en/payments/links?new=1`) opens the dialog for the
    active kind. Single: amount (≥ Rp 10,000 — below that the field errors
    "Links start at Rp 10,000"), optional payer email, expiry (none / 7 / 30
    days). Submit → success panel with the generated `plink_…` id, the
    checkout URL and copy; **Done** closes and removes `?new=1`; the new row
    is first in the table (Open pill).
12. Multiple tab: two line-item rows by default (add up to 20, remove down
    to 2), a running **Total** that updates as you type, the same email /
    expiry fields. Submit → the row shows `2 items — A, B` and the summed
    total. A multiple link with one item (or an empty/under-Rp-1,000 item)
    is rejected with field errors.
13. Bad email in the payer field → field error, no round-trip.

## E. TEST MODE actions

14. On an open link (e.g. `plink_1a2s3d4f`): **Simulate payment** → toast
    `Payment of Rp 27.500.000 recorded for plink_1a2s3d4f.` with a **View**
    action; the pill flips to **Paid**; the actions row is replaced by
    **View payment**.
15. **View payment** → `/en/transactions/plink_1a2s3d4f`: a real ledger row,
    Succeeded, `Payment link plink_1a2s3d4f`, the link's payer email.
16. The money shows up where money shows up: `/en/balance` available figure
    rises by `Rp 27.500.000` (fees apply per the ledger convention), the
    dashboard balance strip agrees, and the movement/ledger entries appear
    in `/en/transactions` and `/en/balance`.
17. Seeded paid links (`plink_8x9a2b1c`, `plink_3k4m5n6p`) show **Paid** and
    a "captured before the test ledger window" note — but **no** View
    payment button (there is no ledger row to show).
18. **Close this link** on an open link → toast `… closed — it can no longer
    be paid.`, pill → **Cancelled**, both actions gone. Closing a paid,
    expired or already-closed link is not offered (and throws if forced via
    the action).

## F. Invariants

19. After any of the above: the pill on the detail page and the pill on the
    table row always agree (both are `deriveLinkStatus` output); a paid
    link stays paid no matter what; no surface offers a "set status"
    control — the merchant can only create, close, and (in TEST MODE) pay.
