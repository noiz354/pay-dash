# Fraud + Blocklist — manual test procedure (2026-09-02)

Run `pnpm dev` from `apps/web` and start at
`http://localhost:3000/en/fraud`. The blocklist store is in-memory: seeded
with 10 entries (6 IPs, 2 masked cards, 2 email domains; reasons Known
malicious / High frequency / Chargeback abuse / Manual entry; dates
relative, the newest 3 days ago, the oldest 38). A restart returns both
pages to this state. `/en/fraud/blocklist` is the focused view over the
same store.

## A. The pages are the data

1. `/fraud` — heading **Fraud Prevention**, subline links to the
   blocklist, **Add to Blocklist** button. Three metric cards derive
   counts: **Blocked IP Addresses 6 · Blocked Cards 2 · Blocked Email
   Domains 2**, each with "8 added in the last 30 days". No "14,209",
   "8,432", "3,194", "+12% this week", no "High Risk IPs".
2. Panel: tabs **IP Addresses (6) / Card Numbers (2) / Email Domains (2)**
   with live counts; IP tab shows the 6 seeded IPs with reason chips and
   real "Added On" dates (no 2023), footer "Showing 1 to 6 of 6 results".
   Card tab: `453322 •••• 0110`, `512345 •••• 0921` (masked). Email tab:
   `mailinator.com`, `guerrillamail.com`.
3. `/fraud/blocklist` — heading **Blocklist**, "10 entities blocked", same
   panel. What you see on one page is what the other shows.

## B. Tabs and search (URL state)

1. Clicking a tab updates the URL (`?type=card`, `?type=email`); deep
   links work (`/en/fraud?type=email` lands on the email section).
2. Search "203.0" → exactly `203.0.113.42`, footer "1 to 1 of 1"; the URL
   carries `?q=203.0`; clearing restores "1 to 6 of 6". Search applies
   within the active tab.

## C. Add — the round trip that proves the shared store

1. On **either** page: **Add to Blocklist** → dialog (Type / value /
   Reason). Submit IP `93.184.216.34` (Manual entry) → toast
   "93.184.216.34 added to the blocklist." → it appears at the top of the
   IP tab on **both** routes; counts read 7 / 11 entities.
2. Validation: IP `999.1.1.1` → "Enter a valid IPv4 or IPv6 address.";
   card `4533` → "Enter the full card number (12–19 digits.)"; a full
   card `4533 2201 1012 3456` is accepted and stored as
   `453322 •••• 3456`; email `a@b.com` → "Enter a domain …, not a full
   email."; re-adding `93.184.216.34` → "Already on the blocklist."

## D. Remove

Row ⋮ → **Remove from blocklist** → toast "<value> removed from the
blocklist." → the row is gone on both routes and the counts drop.

## E. Export

The **Export** button (fraud console) downloads
`blocklist-YYYY-MM-DD.csv` with header `type,value,reason,added_at` —
filtered to the current tab/search (on `?type=card`: exactly the 2 masked
CARD rows; unfiltered: all 10).

## F. Regression guards (what must be gone)

The two contradictory 2023 row sets (as literals), "14,209"/"8,432"/
"3,194"/"+12% this week", "Showing 1-4 of 124", "No card blocklist
entries."-style prose tabs, `bg-white` in either page.
