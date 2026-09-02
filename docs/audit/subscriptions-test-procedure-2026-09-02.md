# Subscriptions — manual test procedure (2026-09-02)

Run `pnpm dev` from `apps/web` and start at
`http://localhost:3000/en/subscriptions`. The store is in-memory and seeded
with 10 plans (deterministic, date-relative): 6 active · 2 pending setup ·
1 past due · 1 cancelled. A restart returns the page to this state.

## A. The page is the data

1. Stat cards are **derived**, not invented:
   - Active Plans **6**, sub "MRR Rp 94.550.000" (monthly face value +
     yearly ÷ 12).
   - Pending Setup **2**, sub "Awaiting customer confirmation".
   - Past Due **1**, sub "Rp 15.000.000 outstanding".
   No "+12% vs last month", no "−3 recovered this week", no "1,248", no
   "1,290".
2. Table rows: real directory customers (Initech BV, Globex Retail, Sarah
   Chen, Warung Kopi Nusantara, Acme Corporation, Kevin Tan, Nadia Rahman,
   Budi Santoso, Global Logistics Ltd., Acme Corp), initials avatars (no
   third-party images), `Rp …` amounts, token status chips (Active /
   Pending setup / Past due / Cancelled), Started + Next billing dates.
   Plan id shown as `sub_…` data-mono under the plan name.
3. Toolbar shows "10 plans".

## B. Search, filter, pagination (URL state)

4. Search "initech" (350 ms debounce) → the list narrows to Initech BV, the
   URL gains `?q=initech`, and a "Clear (1)" affordance appears.
5. Status filter → **Past due** → only Kevin Tan's row; URL
   `?status=PAST_DUE`. Clearing returns all 10.
6. Filters reset pagination on change; `?page=2` (pageSize 10) is empty by
   default — with 10 rows everything fits page 1.

## C. Create (real round trip)

7. **Create Subscription** → dialog. Pick a customer **from the real
   directory** (e.g. Initech BV — finance@initech.eu), plan name
   "Enterprise Plus", amount "25,000,000", interval Monthly.
8. **Create plan** → success view with the new `sub_…` id and the note that
   the plan is pending setup. Done.
9. The table now shows the plan first (newest-first), chip **Pending
   setup**, amount Rp 25.000.000, next billing ≈ 30 days out; the toolbar
   reads "11 plans" and the Pending Setup card reads 3.
10. Invalid input (blank plan name / amount) → inline error, no record.

## D. Export

11. Filter Past due, then **Export** → `subscriptions-<today>.csv`
    containing exactly the filtered rows: 11-column header
    (`id,plan,customer_name,customer_email,interval,amount,currency,status,
    started_at,next_billing_at,cancelled_at`), raw values (ISO dates,
    numeric amounts). Unfiltered → all 10 (+ any you created).
    "What you see is what you export" — the endpoint mirrors the URL
    filters.

## E. Row actions

12. ⋮ on a row opens a real menu: **View customer** → the customer's
    profile (`/customers/…`); **View payments** → the ledger filtered by
    the customer's email; **Copy plan ID** → clipboard + toast.
