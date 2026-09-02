# 0011 — Balance: one figure, derived from the ledger and the payouts

Date: 2026-09-01
Status: Accepted

## Context

`/[locale]/balance` rendered two different balances at once: the desktop block hard-coded
`Rp 1.240.500.000`, the mobile prototype block `IDR 1.005.870.599`. The Auto-Withdrawal card
reported `Daily → BCA ****4910` — an account that does not exist anywhere in the payout store
(the real destination is `Bank Central Asia **** 1234`, the real cadence weekly/Friday) — and
its "Set up schedule" link was `href="#"`. Every control was inert: **Top Up**, **Withdraw**,
**Configure**, **View All**, **Export CSV** and the type filter had no handlers. The "history"
was a five-row constant labelled "Mobile prototype rows", with three different date formats and
no link to any record. Nothing on the page was connected to the ledger that
`server/data/transactions.ts` already maintained, and nothing to the payout batches that
ADR-0010 had made the app's unit of disbursement.

## Decision

**1. The balance is derived, never rendered from a constant.** `server/data/balance.ts`
derives a `Movement` list from three sources that already exist:

- ledger transactions → `SETTLEMENT` (`SUCCEEDED`, settled at `net = amount − fee`),
  `PENDING` settlement (`PROCESSING`/`PENDING`), `REFUND` (settled, negative);
- payout batches → `WITHDRAWAL` — a pending batch is a **reservation** booked at
  `batch.createdAt` (the money left the available figure the moment it was reserved), a paid
  recipient settles negative at `paidAt`, a failed/returned one marks the reservation as
  `FAILED`;
- top-ups kept in a small balance store (`TOP_UP`, settled).

`available = OPENING_BALANCE + Σ effect(movement)` is computed in exactly one place, so the
page can no longer disagree with itself or with `/payouts`.

**2. In-flight money is visible, not lost.** Pending settlements count as *pending clearance*;
pending withdrawals count as *reserved* — both surface in the stats row, and the 30-day trend
chart (recharts, replacing the decorative blur) ends exactly on `available`. Because a
reservation is booked at `createdAt` (≤ now) and every movement carries `at ≤ now`, the trend's
last point always equals the current balance and its first point is the balance when the
window opened.

**3. Withdraw routes into the payout batch flow; top-up is a TEST MODE credit.**
`withdrawBalanceAction` validates (zod, shared `parseAmount`), creates a single-recipient batch
and releases it through the same gated settlement ADR-0010 built — so a withdrawal is always a
real, auditable batch in `/payouts`. The deterministic partner rule (accounts ending `0000`
fail) produces a *rejected* result that carries the `batchId`: the dialog shows the rejection
inline with a link to the rejected batch, and no money moved. `topUpBalanceAction` credits
instantly (TEST MODE banner applies) and the movement appears in the history as `TOP_UP`.

**4. The Auto-Withdrawal card mirrors the real schedule.** It reads `getPayoutSettings()` and
`getDestinationAccount()` — `Weekly · Friday`, `**** 1234`, next run computed by
`nextRunForCadence` (02:00 UTC; manual → none; monthly days clamp to 1–28 and roll the month
when the run time has already passed). The switch is a real server action
(`toggleAutoWithdrawalAction`, which promotes cadence to daily when turning a manual schedule
on, matching the settings page's own rule), and "Configure" links to `/payouts/settings`.

**5. The history is a URL-addressable view.** Type/status/date filters plus a debounced search
live in the query string (`?type=…&status=…&q=…&page=…`) — reload-safe and shareable, the same
contract as the other tables. Rows link to the record that moved the money
(`/transactions/txn_…` or `/payouts/BATCH-…`); 10 per page with the shared pagination.
`/api/exports/balance` honours the current filters (attachment + `nosniff`).
`loading.tsx` / `not-found.tsx` round out the route.

**6. Client-safe vocabulary stays out of `server-only` modules.** `lib/balance-status.ts`
holds types, labels, icons and `TOPUP_METHODS`; both the zod enum in the server action and the
dialog's select import it, so the two cannot drift. (A non-function import from a `"use
server"` file is `undefined` in the client bundle — the first version of the dialog shipped
exactly that and SSR crashed on it.)

## Consequences

- One figure — `Rp 2.212.783.280` on the 2026-09-01 seeds — at both breakpoints; the two
  prototype literals and the `IDR …` fallback are gone.
- Balance and payouts cannot disagree: a withdrawal *is* a batch, a reservation *is* the batch's
  pending state.
- Failed transfers are first-class: the rejected batch is linked from the dialog, and the
  movement history shows it as `FAILED` with the partner's reason.
- The top-up/withdraw dialogs submit through named form fields into server actions; the
  `name` attributes are pinned by a DOM test, because a nameless controlled input silently
  submits an empty `FormData`.
- The store is in-memory (restart resets top-ups and withdrawals); swapping to Postgres is a
  read/mutation helper change only, as with ADR-0008/0010.

## Alternatives considered

- *Store an available-balance counter and increment it per event.* Rejected: a counter drifts
  from the events that produced it, and every demo that touches a sibling route (payouts,
  transactions) would then need reconciliation. Deriving keeps the ledger and the batches as
  the single source of truth — the same principle as ADR-0008's billing.
- *Derive withdrawals from ledger transactions like invoices are derived from fees.* Rejected:
  a disbursement is an instruction with a DRAFT/PENDING lifecycle and must be reserved before
  settlement exists (ADR-0010).
- *A bespoke top-up flow with a virtual-account wait.* Rejected: the wait is a partner
  integration, not a page concern; TEST MODE credits instantly and says so in the dialog.

## Verification

- **Unit** — `server/data/balance.test.ts` (16 tests): overview identities (available =
  opening + effects; pending/reserved sums), movement derivation per source, top-up and
  withdraw guard order (unknown account → unverified → over-balance, nothing moves, batch
  count unchanged), trend invariants (first point = window-open balance, last point =
  available, flat before the first active day), CSV shape. `lib/payout-status.test.ts` covers
  `parseAmount` and `nextRunForCadence` edge cases (clamped monthly day after 02:00 UTC rolls
  the month). `components/balance/balance-dialogs.test.tsx` (4 tests) renders both dialogs in
  jsdom and asserts the actual `FormData` the server action receives plus the success and
  rejected panels.
- **Gate** — `pnpm typecheck` clean; 160 unit tests green (14 files).
- **SSR (dev server, 2026-09-01)** — `/en/balance` renders the single `Rp 2.212.783.280`
  (`data-testid="balance-available"`, count 1), the card reads `Weekly · Friday` with
  `Next run Sep 4, 2026 02:00` and the `**** 1234` destination; no `IDR …` text, no `4910`,
  no "Set up schedule". `?topup=1`, `?withdraw=1` and `?type=WITHDRAWAL&page=2` all return 200
  with no client-render fallback.
- **CSV** — `GET /api/exports/balance?type=WITHDRAWAL&status=FAILED` returns exactly the two
  failed rows of batch 012 (`−1,250,000` / `−750,000`) with batch links; attachment
  disposition + `nosniff`.
- **E2E** — `e2e/balance.spec.ts` (10 tests, serial) written against the same testids; the
  Playwright browser cannot be downloaded in this sandbox (CDN blocked), so it runs in CI.
- **Build** — production webpack compilation of all routes passes; page-data collection is
  blocked in this sandbox by the pre-existing Prisma stub (`binaries.prisma.sh` unreachable),
  which only affects prisma-backed routes (auth/health/webhooks), not `/balance`.
