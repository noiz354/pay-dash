# 0012 — Dashboard: the home page states what the stores already know

Date: 2026-09-02
Status: Accepted

## Context

The dashboard survived the ADR-0006 flow pass with its interactive dead-ends
removed, but four of its claims were still invented rather than derived:

- The header greeted a person — `Welcome back, Sarah` — although no store in
  the app holds an owner name. The merchant profile (ADR-0009) holds the
  business: `dba` / `legalName`. The page was fabricating identity data.
- The analytics chart was pinned to 7 days. The ledger table (ADR-0006) and
  the balance trend (ADR-0011) both offer range selection; the home page was
  the only money-over-time view that could not switch windows. It also
  computed `succeeded`/`failed` series and defined their colours, then
  rendered only `total` — and still carried the prototype's static
  "Oct 18–24" mock as a silent default.
- The onboarding checklist asked the operator to self-attest "Connect Bank
  Account" even though ADR-0010 made that fact queryable: a verified
  destination payout account is ground truth, and a green tick could be
  inflated without any account existing.
- The home page — where a merchant lands — showed no money position at all,
  even though ADR-0011 had just made the available balance one derived
  figure.
- Two quick actions oversold their targets: **Add Customer** landed on the
  directory instead of opening the create dialog the page already supported
  (`?new=1`, ADR-0007), and **Create Invoice** promised an authoring flow
  that ADR-0008 deliberately rejected (invoices are derived from ledger
  fees, not authored).

## Decision

**1. The greeting is profile data.** `<DashboardHeader/>` renders
`Welcome back, {merchantGreeting(profile)}` — `dba`, falling back to
`legalName` — from `getMerchantProfile()`. Editing the profile on
`/settings/merchant` changes the home page on the next load; no person's
name is invented, ever.

**2. The chart window is a URL state, and every computed series is
selectable.** The range (`?range=7d|30d|90d`) lives in the query string like
every other table view; the server re-fetches `getAnalyticsSeries(days)`
behind a keyed `<Suspense>`, so a switch shows the skeleton, not stale data.
The `Total / Succeeded / Failed` chips are client view state with a
"last series stays visible" guard. The `defaultData` mock is deleted and
`data` is required — there is no path back to invented figures. Formatters
take the series currency instead of hard-coding `id-ID`.

**3. A step with ground truth is derived, not attested.**
`resolveSetupSteps(completed, bankLinked)` marks "Connect Bank Account"
done when `getDestinationAccount()` returns a verified account, and the UI
locks that tick (static badge `Linked · **** 1234`, no untick control) — the
truth lives in the payout store, not in the checklist cookie. Steps without
a real state behind them remain self-attested. The "Continue: …" CTA skips
derived-done steps.

**4. The home carries the balance position, read-only.** `<BalanceStrip/>`
composes the same `getBalanceOverview()` as `/balance` (ADR-0011): available
figure, pending clearance, reserved, last payout, and a door to
`/balance`. The two surfaces cannot disagree because they are one
derivation; all mutation stays on `/balance` and `/payouts`.

**5. Quick actions match their intents.** `Add Customer` →
`/customers?new=1` (opens the dialog directly); `Create Invoice` → relabelled
**Invoices** (navigation to `/billing`), because an invoice-authoring flow
would contradict ADR-0008.

## Consequences

- The dashboard makes no claim that a store cannot back: greeting (profile),
  balance (balance overview), bank step (payout account), chart (ledger
  series).
- `?range=` makes the home view shareable/reload-safe, consistent with the
  rest of the app.
- The checklist ring can still be inflated for the three self-attested
  steps — the derived step is now the visible model for what a fully
  derived checklist looks like; the remaining three have no store state to
  derive from (webhooks are display-only, routing = links page).
- One extra `getLedgerMetrics()` call in the analytics section (in-memory
  store — negligible).

## Alternatives considered

- *Keep "Sarah" as design parity.* Rejected: prototype parity is not a
  licence to fabricate data the model does not hold — the same rule that
  killed the balance page's `BCA ****4910` (ADR-0011).
- *Derive every checklist step.* Rejected: only the bank step has ground
  truth today; deriving the others would require inventing store state
  (webhook configs, routing rules) that the product does not model.
- *A full balance card with trend on the home.* Rejected: the strip is the
  right amount of money context for a landing page; the trend, filters and
  mutations belong on `/balance`.
- *Client-side range state (no URL).* Rejected: inconsistent with every
  other table view, and not shareable.

## Verification

- **Unit** — `src/lib/setup-steps.test.ts` (derive/lock semantics: verified
  account ⇒ done+derived regardless of cookie; manual tick still honoured
  when no account; next-step skips derived-done; undefined when all done);
  `merchantGreeting` cases in `src/lib/settings-options.test.ts` (dba
  preferred, legal fallback, explicit guard against regressing to "Sarah");
  `src/server/data/transactions.test.ts` (one bucket per day for 7/30/90,
  subset invariants, money conservation — the 30-day series sums to the
  whole seeded ledger, empty ledger ⇒ zero series of the right length).
- **Gate** — `pnpm typecheck` clean; 17 test files / 175 unit tests green.
- **SSR (dev server, 2026-09-02)** — `/en/dashboard` renders
  `Welcome back, Acme` (no "Sarah"), the strip testid with
  `Rp 2.212.783.280` (identical to `/balance`'s figure), the `Linked ·
  **** 1234` badge with no untick control, the `Invoices` label (no
  "Create Invoice"), `Add Customer → /en/customers?new=1`, and range tabs;
  `?range=30d` / `?range=90d` render the matching series server-side and a
  bogus value falls back to 7 days. The only client-render bailouts on the
  page are the pre-existing `next/dynamic` Hero3D (`ssr: false`).
- **E2E** — `e2e/dashboard.spec.ts` (7 tests, serial): greeting, strip
  equality with `/balance` + link, locked bank step, URL range round-trips,
  series-toggle guard, quick-action intents, metric-tile drill-through.
  Runs in CI (Playwright browser not installable in this sandbox).
- Manual procedure: `docs/audit/dashboard-test-procedure-2026-09-02.md`.
