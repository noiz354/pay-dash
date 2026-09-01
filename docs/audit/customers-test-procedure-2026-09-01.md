# Testing procedure — customers pass (2026-09-01)

Run these yourself; nothing below was executed for you in this pass.

## 0. Prerequisites

```bash
cd /home/user/pay-dash
pnpm install                       # node_modules is not present in a fresh sandbox
cd apps/web
npx tsc --noEmit                   # expect: no output
```

Dev server (Turbopack uses far less memory than webpack in this sandbox — the
webpack dev server OOM-killed the box twice):

```bash
SKIP_ENV_VALIDATION=1 NODE_OPTIONS=--max-old-space-size=1536 \
  npx next dev --turbopack -H 0.0.0.0 -p 3000
```

## 1. Automated

```bash
pnpm vitest run                    # unit: data layer + presentational components
pnpm playwright test e2e/customers.spec.ts e2e/routing.spec.ts
```

New unit specs:

| File | Covers |
|---|---|
| `src/server/data/customers.test.ts` | id derivation, q/status filtering, ltv+name sorting, pagination clamp, create/duplicate/override, archive-is-not-delete, ledger consistency, CSV |
| `src/components/customers/customer-status-pill.test.tsx` | status labels, avatar fallback + deterministic palette, three empty-state variants |

New e2e specs: `e2e/customers.spec.ts` (journey + URL params), `e2e/routing.spec.ts` (proxy contract).

## 2. Manual — URL parameter contracts

| # | Do this | Expect |
|---|---|---|
| 1 | Dashboard → quick action **Add Customer** | Navigates to `/customers?new=1` **and** the create dialog is already open |
| 2 | Press Cancel / Esc in that dialog | Dialog closes and the URL becomes `/customers` (param removed, no re-open on refresh) |
| 3 | Open `/customers?q=tony@stark.com` directly | Search box pre-filled, only Stark Industries listed, "1 Total" |
| 4 | Type in the search box | 350 ms debounce, spinner next to the count, URL gains `?q=`, `page` resets |
| 5 | Change Status / Sort selects | URL gains `status=` / `sort=`, table re-renders behind the skeleton |
| 6 | Press browser Back after filtering | Previous filter state restored from the URL |
| 7 | Transaction detail → **View customer** | Lands on `/customers/cus_…` for that exact email |
| 8 | Row action → **Edit details** | `/customers/cus_…?edit=1` with the edit dialog open |

## 3. Manual — mutations, feedback and optimistic UI

| # | Do this | Expect |
|---|---|---|
| 9 | Submit the create form with a 1-char name | Inline field error, no toast, dialog stays open |
| 10 | Submit with an email that already exists | Error toast "A customer with this email already exists" |
| 11 | Submit a valid customer | Button shows a spinner + "Adding…" and is disabled for the whole round-trip; dialog closes; success toast with a **View profile** action; new row appears after refresh |
| 12 | Profile → **Manage** → Flag for review | Trigger switches to "Saving…" immediately (optimistic), toast confirms, pill reconciles to Review |
| 13 | Row action → **Archive customer** | Toast confirms; the row's pill becomes **Archived**; the record is still findable via Status: Archived (nothing is deleted) |
| 14 | Row action → **Restore customer** on an archived row | Returns to Active |
| 15 | Select-all checkbox → **Archive** | Bulk bar shows the count, button reads "Archiving…" while pending, one summary toast |
| 16 | **Copy emails** / **Copy email** | Clipboard contains the addresses, confirmation toast |
| 17 | **Export** button | Downloads `customers-YYYY-MM-DD.csv`; the file honours the filters currently in the URL |

## 4. Manual — empty, loading and error states

| # | Do this | Expect |
|---|---|---|
| 18 | `/customers?q=zzzz` | "No customers match these filters" + Clear filters (not a blank table) |
| 19 | Throttle to Slow 3G, reload `/customers` | Metric cards pulse, then `TableSkeleton` (10×7), then content — no layout jump |
| 20 | `/customers/cus_does_not_exist` | In-shell "Customer not found" with Back to customers / Add customer |
| 21 | A customer with no payments | Payments panel shows the ledger empty state; Payment methods says "No stored methods yet" |
| 22 | Force a throw inside one profile widget | Only that card degrades to the retry tile (`SectionBoundary`); neighbours keep rendering |

## 5. Manual — routing / proxy contract

```bash
for p in / /api/health /en /id /dashboard /transactions /customers /sign-in /sign-up /nope; do
  printf "%-16s " "$p"; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3000$p"
done
```

Expected: `/` 200 · `/api/health` 200 · `/en` 307 → `/en/dashboard` · `/id` 200
(dashboard, rewritten) · `/dashboard` 200 · `/transactions` 200 · `/customers`
200 · `/sign-in` 200 · `/sign-up` 200 · `/nope` 404 rendered **inside** the app
shell.

To verify the auth gate still works, restart with `AUTH_ENFORCED=1` and confirm
`/dashboard` redirects to `/id/sign-in?redirect=/dashboard`.

## 6. Accessibility / responsive spot-checks

- Tab to a table row → visible focus ring; Enter opens the profile; the row
  checkbox and overflow menu do **not** trigger navigation (`data-row-interactive`).
- Cmd/Ctrl-click a row → opens the profile in a new tab.
- 375 px viewport: the toolbar stacks, the overflow trigger switches to
  `chevron_right`, the table scrolls horizontally rather than clipping.
