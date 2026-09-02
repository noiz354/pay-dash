# Audit Log — manual test procedure (2026-09-02)

Run `pnpm dev` from `apps/web` and start at
`http://localhost:3000/en/audit`. The page is pure derivation over the other
stores — it holds no state of its own, so a restart always returns it to the
seeded world.

## A. What the page states (seeded world)

1. Heading **Detailed Audit Log**; subline with the true total —
   "**177** in total" — and the honest note that there is no user or IP
   column because no store holds one. **Export CSV** button.
2. Filter bar: category / status / range selects, a live "**177 events**"
   count, search box with a **⌘K** hint (press ⌘K/Ctrl+K — the box focuses).
3. Table: Timestamp (UTC) · Category chip · Action & Resource (action +
   mono resource chip + detail line) · Status badge. Footer:
   "Showing 1 to 10 of 177 results", real prev/next.
4. Derived composition: 140 payments (the ledger's event timelines),
   10 payout-batch events, 7 webhook callbacks, 20 configuration events
   (3 API-key creations, 10 blocklist additions, 1 velocity-ruleset deploy,
   5 team joins, 1 team invite).

## B. Filters are URL state

| URL | Result |
|---|---|
| `/en/audit?category=WEBHOOKS` | "7 events", "1 to 7 of 7", callback rows |
| `/en/audit?category=CONFIGURATION` | "20 events" |
| `/en/audit?status=FAILED` | "4 events" — the four declined authorizations |
| `/en/audit?range=24h` | only events inside the last day |
| `/en/audit?q=velocity%20ruleset` | "1 event" — the ruleset deploy |
| `/en/audit?q=zzzz` | true empty state, not a blank table |

Clicking a select updates the URL; changing any filter resets pagination;
**Clear filters** returns to the unfiltered view.

## C. Export is real

`Export CSV` downloads `audit-YYYY-MM-DD.csv` mirroring the URL filters:
all rows → 177 data rows; `?category=WEBHOOKS` → 7. Header:
`timestamp,category,status,action,resource,detail`.

## D. It reacts to the world (live derivation)

1. Add an IP to the blocklist at `/en/fraud` → the audit log gains a
   "<type> added to blocklist" event (178 total).
2. Create an API key at `/en/settings/api-keys` → an "API key created"
   event appears.
3. Restart the dev server → back to 177.

## E. Must NOT appear

"12,042", "2409", "2023", "alice.jones@org.com", "@org.com",
"system@ledger.io", "key_prod_892f", "batch_77x21", "txn_9942a",
"Custom Range...", a User column, an IP Address column.

## F. Automated coverage

- `src/server/data/audit.test.ts` — 8 unit tests (derived counts, status
  mapping, filters, pagination clamping, empty state, live re-derivation,
  CSV).
- `e2e/audit.spec.ts` — 5 serial Playwright tests.
- `uat-journeys` F2 rewritten (it was red — written against tabs that never
  existed on the page).
