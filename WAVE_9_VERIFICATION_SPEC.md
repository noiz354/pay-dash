# Wave 9 — Verification: E2E, Performance & Accessibility Evidence (Spec)

Date: 2026-09-13 · Branch: `wave-7d-derived-scoping` (main@a4b595a)
Predecessors: all implementation waves; TODO.md verification rows; D-01, D-02, D-03, D-04, D-21, D-22
Status: **Proposed**

---

## 0. Runtime baseline (measured, not carried over)

| Gate | Result 2026-09-13 |
|---|---|
| Full suite (unit) | **1472 passed / 17 failed** (15 pre-existing env + 2 calendar flakes) |
| E2E inventory | **~224 tests / 30 specs NOT_RUN** in this lineage (D-02); Wave 4 gates (8 tests / 6 specs) authored but never executed green (D-01) |
| Perf / a11y | budgets unmeasured (D-03); axe-core "touched screens only" (D-04) |

## 1. Goal

> Every verification claim in the repo is backed by an execution record in the repo.
> After Wave 9, "NOT_RUN", "unverified", and "touched screens only" appear nowhere in
> gates documentation — each is replaced by a dated run (pass/fail counts + environment)
> or by an explicit, still-open ticket. Evidence gaps are closed or named, never silent.

## 2. Standard (applies to every item below)

Runs execute in the documented environment (`apps/web/playwright.config.ts`, chromium
project unless stated); results land in-repo (report file + PROGRESS entry), pasted
nowhere ephemeral; flaky-by-infrastructure tests are quarantined with a named reason and
a re-run count, never silently skipped; OOM-class failures (Wave 5 sandbox precedent)
get a reduced-scope run + a ticket, not a shrug.

## 3. Gaps (file:line evidence, checkout `a4b595a`)

- **P-1** `apps/web/e2e/wave4/` (8 tests / 6 specs) never executed green (D-01, TODO.md:23):
  run `npx playwright test e2e/wave4 --project=chromium`, fix-or-ticket every red,
  paste results to the PR record + a `WAVE_4_E2E_REPORT.md`.
- **P-2** Full inventory ~224 tests / 30 specs NOT_RUN (D-02): execute the whole `e2e/`
  directory serially (verify spec count at Q2 — `ls apps/web/e2e/` showed 30+ files);
  per-spec pass/fail table becomes `E2E_INVENTORY_REPORT.md`; reds become tickets with
  owner wave (mockup bug vs regression vs flake).
- **P-3** Performance budgets unmeasured (D-03, TODO.md:27): LCP < 2.5s, INP < 200ms,
  CLS ≤ 0.1 (target 0.05) against the spec's key routes (verify route list at Q2);
  in-sandbox production build was BLOCKED_BY_ENV — resolve the blocker or document the
  fallback environment. Output: `PERF_BUDGET_REPORT.md` with measured numbers, not claims.
- **P-4** Accessibility "touched screens only" (D-04): full-route axe-core sweep over all
  app routes; violations become per-route tickets (P0 = blocker pattern, e.g. missing
  names on interactive controls; P2 = contrast/io). Output: `A11Y_SWEEP_REPORT.md`.
- **P-5** `WAVE_1_IMPLEMENTATION_REPORT.md` missing (D-22): reconstruct from
  `IMPLEMENTATION_PROGRESS.md` + git history (route-resolver 20/20, permission-adapter
  12/12, sidebar 9/9, bottom-nav 5/5, proxy.alias 6/6) in a docs-only slice.
- **P-6** Coverage/registry reconcile (TODO.md:33) + final gate checklist → Release
  Readiness verdict (TODO.md:34): the wave's deliverable is the READY/NOT-READY line
  with the blocking list, not the runs themselves.
- **Checklist (no spec needed, done inside Q7)**: D-21 MCP sweep row #20 (live
  `get_webhook_event` sample into `docs/MCP_SWEEP.md`); PR description updates per
  milestone (TODO.md:35).

## 4. Design (execution wave, not a code wave)

No production code changes expected. New files are reports + tickets, not features.
Test-code changes are allowed only to fix harness rot (stale selectors, dead waits) —
each fix cites the production behavior it tracks, and product-behavior reds become
tickets instead of test edits. Uses the web-perf skill + Chrome DevTools MCP where the
repo's Playwright harness cannot reach (INP field data, layout-shift traces).

## 5. Tests (the wave IS tests — these are its acceptance pins)

- **V-1** Wave 4 gates green (or ticketed with wave owner + repro).
- **V-2** Full inventory executed; `E2E_INVENTORY_REPORT.md` per-spec table sums to the
  runner's totals (no silent skips — skip count asserted equal to quarantine list).
- **V-3** Perf numbers recorded for every key route; any over-budget route has a ticket.
- **V-4** Axe sweep covers every route in the route manifest; violation count per route
  recorded; zero P0 open.
- **V-5** `WAVE_1_IMPLEMENTATION_REPORT.md` exists with the cited counts verifiable in
  git history.
- **V-6** Release Readiness line published (READY or blocking-list).

## 6. Plan (serial)

Q0 spec (this doc) → Q1 environment readiness (playwright install, prod-build blocker
triage, route manifest freeze) → Q2 Wave-4 gates run → Q3 full inventory run →
Q4 perf budgets → Q5 axe sweep → Q6 ticket triage (every red owned) → Q7 reports
(E2E inventory, perf, a11y, Wave 1 reconstruction) + readiness verdict + commit
(reports + test-harness fixes only).
