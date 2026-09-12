# Wave 4 Implementation Report — Command Center, SLA, Cross-Role Handoff

> **Source of truth:** `IMPLEMENTATION_READY_UX_SPEC.md` (§7 Command Center, §9 Cross-Role Blueprint, §25 performance/a11y, §26 analytics) + `WAVE_3_IMPLEMENTATION_REPORT.md` + `WAVE_4_E2E_TEST_PLAN.md` + repository HEAD
> **Base commit:** `b953cc9` (merge of PR #9 from `arena/01a09497-pay-dash`, merged 2026-09-12)
> **Date:** 2026-09-12 (Asia/Jakarta)
> **Execution:** incremental, tested, traceable, reversible. Wave 4 is **documentation-finalized** in Wave 5; every status below cites executed evidence, not intent.

**Status vocabulary used in this report:**
- **PASS** — executed, result green, evidence cited.
- **BLOCKED_BY_ENVIRONMENT** — cannot be executed in this sandbox for a stated infrastructure reason (network endpoint unreachable, RAM limit); runs elsewhere, no code defect claimed either way.
- **PENDING EXTERNAL VERIFICATION** — not yet executed anywhere; exact procedure documented; must be executed before the gate may be claimed.

---

## 1. Executive Summary

Wave 4 turns the dashboard from a summary into an **operational surface**:

- **Command Center** — six exception lanes (critical / needs attention / pending approval / failed / overdue / recently completed) aggregated server-side from the *same stores* the list screens read, with per-card `canAct` computed from the viewer's real roles. Replaces the Wave 3 "Needs Attention" block on `/dashboard`; the all-clear (celebrate) state is preserved.
- **SLA model on real timestamps** — one 4-band vocabulary (`NORMAL / APPROACHING / OVERDUE / CRITICAL`) derived from per-entity policies over *backend* timestamps (never a client `Date.now()` at render). Wired into the Command Center **and** the transactions ledger (badge column, `?sla=` filter, urgent-first sort), so "Overdue" means the same thing on a card and on a ledger row.
- **Cross-role handoff engine** — journeys that change hands now have a second actor's queue instead of a text-field `approverId`. **Two-phase refund** (request → approve/reject) is the headline journey (JRN-003): no money moves on request; the approver must be a *different actor* with `refund.execute`.
- **Freshness backbone rewritten** — `usePolling` polls every 20 s while the tab is visible, ticks the displayed age every 1 s *without a fetch*, trips the >60 s stale banner on its own, and surfaces refresh failures as state (never swallowed).
- **409 conflict recovery mounted** — `RetryButton` sends the `updatedAt` it rendered; a version mismatch returns a conflict payload and the `ConflictDialog` shows the *latest* server state. Nothing is ever auto-applied; recovery emits `conflict_recovered`.
- **Typed analytics catalog** — ANA-001..014 plus Wave 4 operational events, with a **PII allowlist** that strips unlisted props *and* redacts value shapes that look like PII.
- **E2E critical gates authored** — six Playwright specs under `apps/web/e2e/wave4/` plus a sandbox browser bootstrap (`scripts/ensure-e2e-browser.mjs`) and config wiring.

**Gate status at finalization (full matrix in §13):**

| Gate | Status | Evidence |
|---|---|---|
| Typecheck | **PASS** | `tsc --noEmit` → 0 errors, executed at `b953cc9` on 2026-09-12 |
| Lint | **PASS** | `eslint .` (apps/web) → 0 errors, 40 pre-existing warnings (e.g. `react-hooks/exhaustive-deps`), executed at `b953cc9` on 2026-09-12 |
| Unit + component | **PASS** | `vitest run` → **1075 passing / 111 files** (195 s). 1 suite **BLOCKED_BY_ENVIRONMENT**: `server/mcp/server.integration.test.ts` (Prisma binary download blocked). Total executable suites: 111/111 green, 112/112 accounted for. |
| Playwright (Wave 4 gates) | **PENDING EXTERNAL VERIFICATION** | specs authored & config verified; this sandbox is a 4 GB-RAM host that OOM-kills `next dev` mid-run (kernel `oom-kill` of `next-server`, confirmed in dmesg). See §8 + `WAVE_4_E2E_TEST_PLAN.md` §7. |
| Performance | **PENDING EXTERNAL VERIFICATION** | budgets defined (CLS ≤ 0.05, LCP < 2.5 s, INP < 200 ms); measurement procedure documented, not yet executed. See §12. |
| Accessibility | **PASS** | AA text tokens measured ≥ 4.5 : 1 (light + dark); band never conveyed by colour alone (WCAG 1.4.1); badge/banner/palette component suites green |
| Cross-role journeys | **PASS (unit/integration level)** — browser-level PENDING | handoff-store 25/25, handoff 19/19, refund-lifecycle 17/17, refund-workflow 10/10 |
| Mobile | **PASS (unit/component level)** — browser-level PENDING | mobile-journey spec authored; 9-test mobile spec + Wave 3 `mobile.spec.ts` in the e2e inventory |

**Release Readiness: CONDITIONAL.** The code plus typecheck/unit/component evidence is green at `b953cc9`; Playwright Wave 4 gates, the full E2E inventory, and the performance budgets are PENDING EXTERNAL VERIFICATION with exact procedures. Nothing here is claimed PASS without an executed result.

---

## 2. Commits

PR #9 (`arena/01a09497-pay-dash` → `main`, merged as `b953cc9`, 42 files) is the only Wave 4 PR. Internal commit sequence (per `TODO.md` reconciliation):

| Commit | Scope |
|---|---|
| `f9a9380` | SLA ledger wiring — `SlaBadge` + `?sla=` filter + sort in `canonical-transactions-table.tsx`; `sla-telemetry.ts` (`sla_breached` once per item per band) |
| `c503039` | Groundwork for 409 + `refundState` URL contract |
| `6107049` | Component tests: `command-center.test.tsx`, `command-center-card.test.tsx`, `command-palette.test.tsx`, `sla-badge.test.tsx`, `stale-banner.test.tsx`, `timeline.test.tsx` |
| `6578f43` | UI two-phase refund (JRN-003): `RefundWorkflow` + `RefundDecisionPanel` |
| `bdd74ce` | `refundState` filter — full URL contract (case-insensitive parse, chip, activeFilterCount, FilterSheet, server-side normalization, CSV export mirror) |
| `57f0598` | Mount `ConflictDialog` (CMP-020): `RetryButton` sends `expectedUpdatedAt`; CONFLICT → dialog with latest state; never auto-applies |
| `0592154` | Targeted tests before Playwright: refund-workflow (10), retry-button conflict (5), refundState in ledger (5) + parser/data-layer. Caught a real bug: the *Request refund* trigger was not disabled for viewers without the permission. |
| (PR #9 tail) | `e2e/wave4/*` six gate specs + `helpers.ts` + README; `playwright.config.ts` sandbox support; `scripts/ensure-e2e-browser.mjs`; `WAVE_4_E2E_TEST_PLAN.md` |

Wave 0–3 commits remain the historical evidence for the rows that reference them (`9bf01dd`, `fbae269`, `db4c615`, `5e4f6af`, `6f7f0af`, plus the wave1/wave2/wave3 batches recorded in `IMPLEMENTATION_PROGRESS.md`).

---

## 3. Tickets (Wave 4)

| Ticket | Spec ref | What landed | Tests (evidence) |
|---|---|---|---|
| W4-CC / W4-CCUI | §7 SCR-004 | Command Center: 6 lanes, server-computed `canAct`, all-clear state, skeleton with matching metrics (CLS-safe) | `command-center.test.ts` 15/15 (server), `command-center.test.tsx`, `command-center-card.test.tsx` (component) |
| W4-CCAPI | §8 | `/api/dashboard/command-center` — `guardApiRead`, `no-store`, session re-checked per poll, fail-closed | route + guard tests; freshness-stale e2e gate exercises it |
| W4-SLA | §3/§7 SCR-005/006/013 | `lib/sla.ts` — 4 bands, 10 entity policies (incl. `transaction_settlement`), locale-safe formatter (no hydration drift), `sla-telemetry.ts` | `sla.test.ts` 26/26, `sla-telemetry.test.ts`, `sla-badge.test.tsx`, `canonical-transactions-table.sla.test.tsx` |
| W4-RFD | JRN-003 / BE-002 | Two-phase refund: `requestRefundAction` / `approveRefundAction` / `rejectRefundAction` + `RefundWorkflow` UI + dual-actor timeline | `refund-lifecycle.test.ts` 17/17, `refund-workflow.test.tsx` 10/10, `canonical-transactions-table.refund.test.tsx`, `transactions.test.ts` |
| W4-HOFF / W4-HDER | §9 | Handoff engine (`handoff-store.ts`, no store imports → no cycles) + derived aggregator over real stores (`handoff.ts`); `nextStepFor` never returns nothing | `handoff-store.test.ts` 25/25, `handoff.test.ts` 19/19 |
| W4-POLL | §7/§8 | `usePolling` rewrite — polling no longer gated on reduced-motion; 1 s age tick trips staleness without a fetch; failures surfaced | `use-polling.test.tsx` 24/24 |
| W4-ANA | §26 | Typed catalog ANA-001..014 + W4 operational events; allowlist + value redaction | `analytics-events.test.ts` 25/25 |
| W4-TL | CMP-009 §17 | Canonical timeline model — dedupe key now includes `entityType`; refund phase labels mapped | `timeline.test.ts` 58/58, `timeline.test.tsx` |
| W4-CPAL | FE-011 | Command Palette rewritten on cmdk, mounted via `next/dynamic` (`ssr:false`); role-aware, safe-only, recent 5 | `command-palette.test.tsx` (component) |
| W4-A11Y | DSN | AA status-text tokens (light + dark): `--pending/failed/critical/overdue-text` ≥ 4.5 : 1; `--sla-*` aliases restated in `.dark` | contrast measured (see §11) |
| W4-PERSONA | §3/§9 | E2E persona harness — `e2e/test-utils.ts` + `server/services/test-persona.ts`; cookie honoured **only** when `AUTH_ENFORCED` is off/preview; never read in strict | `test-persona.test.ts` 16/16 |
| W4-E2E | §41 | Six Playwright gate specs + sandbox browser bootstrap + config wiring | authored; execution PENDING EXTERNAL VERIFICATION (§8) |

**Registry coverage delta (Wave 3 → Wave 4):**

| Registry | Total | After Wave 3 | Wave 4 adds | After Wave 4 |
|---|---|---|---|---|
| JRN | 21 | 12 | JRN-003 full journey (UI + server), JRN-021 blueprint wired via handoff engine, JRN-020 rebuilt | **14 implemented** |
| SCR | 45 | 31 | SCR-004 (Command Center), SCR-005 SLA column/filter, SCR-044 (real stale banner), SCR-040 (timeline model), SCR-039 (palette rebuild) | **36 implemented** |
| INT | 20 | 19 | INT-005 step1/step2 as separate server actions (request / approve / reject) | **19/20 implemented** |
| CMP | 24 | 21 | CMP-005 SLA extension, CMP-019 (stale banner real), CMP-020 (conflict dialog mounted) | **23 implemented** |
| ANA | 14 | 9 | Full typed catalog emitted at real call sites (ANA-001..014) + 9 W4 operational events | **14/14 instrumented** (dashboards remain Wave 5) |

Full row-level traceability: `UX_REDESIGN_FINAL_IMPLEMENTATION_REPORT.md` §18.

---

## 4. SLA Implementation

`apps/web/src/lib/sla.ts` is the single source of truth for the SLA vocabulary:

- **Bands** (worst-last): `NORMAL → APPROACHING → OVERDUE → CRITICAL`, with `SLA_SEVERITY` ranks used for sorting and lane assignment.
- **Policies** (10 entity types, same-day settlement desk commitments): payout batch 4 h (critical +20 h), refund 8 h (+40 h), failed payout 2 h (+10 h), failed payment 4 h (+20 h), blocked payment 4 h (+8 h), KYC 24 h (+24 h), webhook delivery 24 h (+7 d), invoice (own `dueDate`; policy governs escalation only), team invite 5 d (+2 d, spec §32), **transaction settlement 4 h (+20 h)** — the ledger wiring that makes the transactions table speak the same vocabulary as the Command Center.
- **Derivation is clock-injected**: `evaluateSla(entityType, anchor, { now })` takes `now` as an argument; the server passes the *same instant* it uses to aggregate the Command Center, so a badge on a card and a count in a lane can never disagree. Missing/unparseable anchors return `null` → UI renders "no SLA" instead of silently claiming NORMAL.
- **Locale-safe formatting**: `formatSlaRemaining` deliberately avoids `Intl.RelativeTimeFormat` so server and client render identical strings (no hydration mismatch).
- **Ledger wiring** (`f9a9380`): `SlaBadge` column on the canonical transactions table, `?sla=ALL|NORMAL|APPROACHING|OVERDUE|CRITICAL` filter with chip + count, urgent-first sort, and `sla_filter_applied` analytics. Server-side `normalizeSlaFilter` makes the filter case-insensitive with fallback to ALL.
- **Telemetry** (`sla-telemetry.ts`): `sla_breached` emitted once per item per band — the signal the runbook alerts on (`PRODUCTION_UX_RUNBOOK.md`, case 10).

**Evidence:** `sla.test.ts` 26/26 (band boundaries, explicit deadlines, null anchors, severity sort), `sla-telemetry.test.ts`, `sla-badge.test.tsx` (label + icon, never colour-only), `canonical-transactions-table.sla.test.tsx` (filter chip, sort, URL sync).

---

## 5. Two-Phase Refund Flow (JRN-003)

The single-step `refundTransactionAction` (below dual-control threshold) remains; the journey that **changes hands** is now three server actions (`src/server/actions/transactions.ts`):

1. **Role A — `requestRefundAction`** (`refund.prepare`): validates, then `requestRefund({ transactionId, amount, reason, requestedBy: ctx.userId })`. **The actor comes from the session, never from the form** — a client cannot name itself as its own approver. No money moves; the transaction becomes `AWAITING_APPROVAL`, a handoff opens to `FINANCE_ADMIN`/`OWNER` with a deep link, and the dual-control queue `/en/transactions?refundState=AWAITING_APPROVAL` lists it.
2. **Role B — `approveRefundAction`** (`refund.execute`): `approveRefund({ transactionId, approvedBy: ctx.userId })`. Same-actor approval is refused server-side (`isApproverDistinct`); both actors are recorded in the audit-derived timeline event ("requested by persona_agus … approved by persona_hendri · dual control satisfied").
3. **Role B — `rejectRefundAction`** (`refund.execute`): closes the handoff; nothing moves.

The UI (`RefundWorkflow` + `RefundDecisionPanel`) renders state-aware and permission-aware: the requester sees the queue state; a viewer without the permission sees "Waiting on Finance Admin or Owner" **instead of a dead button**; the disabled trigger carries its reason. Provider path: a connected TEST provider routes through the payment-flow (idempotency + durable op + step-up + audit); a configured-but-failing provider propagates (never mock); without a connection the in-memory ledger is the fallback.

**Dual-control thresholds** (`domain/security/step-up.ts`): refund ≥ IDR 10 M or ≥ 50 % of the original payment requires a second actor; payouts ≥ IDR 25 M/recipient or IDR 100 M/batch.

**Evidence:** `refund-lifecycle.test.ts` 17/17 (no money on request, same-actor refusal, dual-actor audit trail), `refund-workflow.test.tsx` 10/10, `canonical-transactions-table.refund.test.tsx`, `transactions.test.ts`, `test-persona.test.ts` 16/16 (persona harness never read in strict mode). Browser-level: `e2e/wave4/refund-handoff.spec.ts` (gate 1) — PENDING EXTERNAL VERIFICATION.

---

## 6. 409 Conflict Recovery (CMP-020)

- **Contract:** mutations that can lose a race carry the version the client rendered (`expectedUpdatedAt`). The data layer compares and, on mismatch, returns `{ code: "CONFLICT", latest }` instead of applying a blind write. `retryTransactionAction` returns the conflict as part of `ActionState.conflict` (description + `currentState` + `detectedAt`).
- **UI:** `ConflictDialog` (mounted, `57f0598`) shows the *latest server state* (e.g. status now `PROCESSING`, not the `FAILED` the tab rendered). The user must explicitly *Retry with Latest* (re-sends against the reviewed version) or dismiss (which syncs). Nothing auto-applies. Recovery emits `conflict_recovered` with `version_delta`.
- **Idempotency complement:** same idempotency key + same payload → original result; same key + different payload → 409 (BE-005/BE-008, `idempotency.test.ts` 7/7).

**Evidence:** `conflict-resolution.test.ts` 6/6, `retry-button.test.tsx` 5/5, browser gate `e2e/wave4/conflict-recovery.spec.ts` (real two-tab race) — PENDING EXTERNAL VERIFICATION.

---

## 7. Freshness & Polling

`src/hooks/use-polling.ts` (rewritten) fixes three defects that made "real freshness" unverifiable:

1. Polling was gated on `prefers-reduced-motion` — a motion preference is about animation, not data currency; serving stale financial data to users with vestibular disorders was the actual risk. Motion now lives in CSS; polling is unconditional.
2. `ageSeconds` was computed during render with no timer, so nothing re-rendered and the stale threshold could never trip. Now a 1 s tick advances the age **without a fetch**.
3. Two effects both called `start()`, racing the timeout chain. One chain, `inFlightRef` guard against overlapping refreshes.

Contract: poll 20 s (spec §7) while the tab is visible (pauses on `document.hidden`, resumes promptly on `visibilitychange`); stale > 60 s raises the banner; manual `refresh()` resets the age; **a failed refresh sets `error` and does not advance `lastUpdated`** — silently keeping stale data is how a dashboard starts lying. `StaleBanner` (CMP-019, `stale-banner.test.tsx`) renders the age + Refresh.

The Command Center endpoint `/api/dashboard/command-center` is `no-store`, `guardApiRead`, and re-checks the session on every poll — a logged-out or downgraded user gets a 401 on the next tick, not a silent stale card.

**Evidence:** `use-polling.test.tsx` 24/24 (tick-without-fetch, threshold trip, hidden-tab pause, failure surfacing), `stale-banner.test.tsx`, browser gate `e2e/wave4/freshness-stale.spec.ts` (2 tests) — PENDING EXTERNAL VERIFICATION.

---

## 8. Playwright Status

Six gate specs under `apps/web/e2e/wave4/` (full plan and pass criteria: `WAVE_4_E2E_TEST_PLAN.md`):

| # | Spec | Gate |
|---|---|---|
| 1 | `refund-handoff.spec.ts` | Role A (agus/SUPPORT) requests → dual-control queue → Role B (hendri/FINANCE_ADMIN) approves → dual-actor timeline |
| 2 | `sla-filter-back-restore.spec.ts` | `?sla=OVERDUE` → detail → **back** restores chip + rows; hard reload shows the same slice |
| 3 | `permissions.spec.ts` | nadia/ANALYST: server denies retry through the real UI; refund trigger `aria-disabled` with reason |
| 4 | `freshness-stale.spec.ts` | age ticks without a fetch; manual refresh resets; >60 s → banner → refresh clears |
| 5 | `conflict-recovery.spec.ts` | real two-tab race → 409 → dialog shows latest state (never auto-applies) → retry-after-review |
| 6 | `mobile-journey.spec.ts` | 390 px: cards with SLA badges → filter sheet → chip → detail → back restores |

**Status: PENDING EXTERNAL VERIFICATION.**

Execution was attempted in this (Wave 5) sandbox; the attempts and their outcomes are recorded honestly:

1. **First full run (8 tests, worker 1):** test 1 failed with `net::ERR_EMPTY_RESPONSE`; tests 2–8 with `net::ERR_CONNECTION_REFUSED`. Root cause: the `next dev` web server was **OOM-killed by the kernel** (`dmesg`: `oom-kill … task=next-server … anon-rss:3607112kB`) while compiling the transactions route, on a **3.8 GiB-RAM host with no swap** — the same failure mode `WAVE_4_E2E_TEST_PLAN.md` §7 recorded for the authoring sandbox.
2. **Managed retry** (dev server with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=1`, warmed routes): `/`, `/en/sign-in`, `/en/dashboard` compiled (200), then `next-server` was OOM-killed again during `/en/transactions` compilation.
3. **Production-mode path (attempted):** `next build` with the font mock override — `fonts.googleapis.com` is unreachable here, so `next/font` fetches fail; the mock env flag requires a mocked-responses JSON file and `=1` instead hits an internal `MODULE_NOT_FOUND` in the font loader (the build continued), and the build process was then **OOM-killed ("Killed") during final module-trace collection** on the 3.8 GiB host. Result: **Production Build: BLOCKED_BY_ENVIRONMENT** (font network + RAM); CI (`.github/workflows/ci.yml`) runs the build on a normal runner and remains the authoritative venue. Because no production bundle could be produced, the `next start` + second Playwright attempt was not made — Playwright stays PENDING EXTERNAL VERIFICATION.

This is an **environment limitation, not a spec or app defect**: the specs, config, and persona harness are verified in place (unit-level: `test-persona.test.ts` 16/16), and the procedure is exact (`pnpm test:e2e -- e2e/wave4 --project=chromium` on a host with ≥ 8 GB RAM, or per `WAVE_4_E2E_TEST_PLAN.md` §3 where `cdn.playwright.dev` is unreachable). CI (`.github/workflows/ci.yml`) runs the full suite on a normal runner and is the authoritative execution venue.

**E2E inventory (context for the gate above):** ~224 `test()` invocations across ~30 spec files in `apps/web/e2e/` (26 of them in `e2e/wave4/`… precisely 8 in the six Wave 4 gate specs). The full inventory has **not** been executed in this session — NOT_RUN, not PENDING — and no pass/fail is claimed for it here.

No Playwright result in this report or any other Wave 5 document is marked PASS.

---

## 9. Permissions

- **Model:** org-scoped RBAC — 8 roles × 25 least-privilege permissions (`domain/organization/roles.ts`); authorization always resolves from authenticated membership, never from the browser.
- **Server is the enforcement point:** every Wave 4 action resolves the actor from the session (`requireStrictOrgContext(perm)`); UI affordances are secondary. Wave 4's own permission gate (e2e #3) exists precisely because "the button is hidden" proves nothing — the spec drives a *visible* retry control through the server and expects the denial toast.
- **Command Center `canAct`** is computed server-side for the viewer's roles; an item the actor cannot act on is still shown (hiding it recreates the dead end) — the card renders "waiting on Finance Admin" instead of a button that would 403. Handoff-derived lanes use `canActOnHandoff` (can this actor close *at least one* handoff in the group) instead of a flat `true`.
- **Persona harness safety:** the `paydash_persona` cookie is honoured only when `AUTH_ENFORCED` is `off`/`preview`; in `strict` (production default) it is never read — the harness widens nothing (`test-persona.test.ts` 16/16 asserts this).
- **Denials are observable:** every denial path emits `permission_denied` (permission, role, surface, scr) — the signal for the runbook's permission-denial-spike case.

---

## 10. Mobile

- Ledger at 390 px renders **cards** (identity + status + SLA badge + metadata + action), never a squeezed 10-column table (column priorities 0/1/2, Wave 2 contract).
- The Wave 4 mobile gate (spec 6) proves the full triage loop at 390 × 844: cards → filter sheet (writes the same URL contract as desktop) → chip → detail → back restores the filtered view.
- Bottom-nav active-state fix (FE-015, Wave 0) keeps child routes highlighted; the mobile More sheet carries the grouped sublists.
- E2E inventory includes a 9-test mobile spec plus the Wave 3 `mobile.spec.ts` (2 tests) — NOT_RUN in this session.

---

## 11. Accessibility

- **AA text tokens (W4-A11Y):** `--pending-text`, `--failed-text`, `--critical-text`, `--overdue-text` measured ≥ 4.5 : 1 in light and dark; `--sla-*` aliases restated under `.dark`.
- **WCAG 1.4.1 (not colour-only):** `SlaBadge` always renders a text label + icon + text countdown; colour is used for the dot and low-alpha fill only.
- **Palette:** `role=dialog aria-modal`, focus trap, Esc returns focus (cmdk); command palette test suite green.
- **Live regions:** bulk bar `role=region` + `aria-live`, filter result count `aria-live=polite`, toasts `role=status/alert`.
- **Reduced motion:** honored in CSS (animations); polling deliberately **not** gated on it (§7).
- **Skip link** + landmarks + 44 px targets (Wave 0/3, unchanged).

---

## 12. Performance Evidence

Budgets (spec §25): **LCP < 2.5 s, INP < 200 ms, CLS ≤ 0.1** (target ≤ 0.05 on table routes).

What is measured vs. pending — stated plainly:

| Item | Status | Note |
|---|---|---|
| Skeleton CLS (Wave 0) | Measured (visual) | 5 × 44 px rows matching column widths; 0.18 → 0.05 on the six audit/fraud/KYC/system/risk/builder routes (Wave 0 report §6) |
| Command Center skeleton CLS | Implemented | skeleton renders the same card metrics as the loaded cards (CLS by construction); not re-measured with web-vitals |
| LCP / INP on Command Center + ledger | **PENDING EXTERNAL VERIFICATION** | measurement requires a production build + web-vitals pass on a network-reachable machine |
| Polling request cadence (no accumulation) | Implemented + unit-proven | single timer chain, `inFlightRef` guard, hidden-tab pause (`use-polling.test.tsx` 24/24); browser-level request-count check pending |
| Bundle size (palette via `next/dynamic ssr:false`) | Implemented | cmdk palette excluded from the SSR chunk by construction; numeric audit pending with the build |

**No performance number in this report is a measured PASS.** The verification procedure (web-vitals via CDP, polling request count, one React profiling pass) is specified in `QA_HANDOFF_WAVE_5.md` §9.

---

## 13. Gate Status (Wave 4 → final)

| Gate | Result | Evidence |
|---|---|---|
| Typecheck | **PASS** | `tsc --noEmit` (apps/web) → 0 errors, executed at `b953cc9` on 2026-09-12 |
| Lint | **PASS** | `eslint .` (apps/web) → 0 errors, 40 pre-existing warnings, executed at `b953cc9` |
| Unit tests | **PASS** | `vitest run` → 1075 passing / 111 files (195 s) |
| Unit suite `server/mcp/server.integration.test.ts` | **BLOCKED_BY_ENVIRONMENT** | needs `prisma generate`, which downloads from `binaries.prisma.sh` (unreachable in this sandbox); pre-existing condition, not a regression; runs in CI where the binary is fetchable |
| Component tests | **PASS** | included in the 1075: command-center (ts + tsx), command-center-card, command-palette, sla-badge, stale-banner, retry-button, refund-workflow, canonical-transactions-table (sla + refund), timeline (ts + tsx) |
| Playwright Wave 4 gates (8 tests / 6 specs) | **PENDING EXTERNAL VERIFICATION** | §8 — host OOM; exact procedure in `WAVE_4_E2E_TEST_PLAN.md` |
| Playwright full inventory (~224 tests / 30 specs) | **NOT_RUN** | not executed in this session; CI is the authoritative venue |
| Production build | **BLOCKED_BY_ENVIRONMENT** | `next build`: font network unreachable in sandbox (the `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` override needs a mocked-responses JSON file; `=1` is an invalid value → internal font-loader error, non-fatal), and the build was OOM-killed during final module-trace on the 3.8 GiB host. No code defect claimed either way; CI is the authoritative venue. |
| Performance budgets | **PENDING EXTERNAL VERIFICATION** | §12 |
| Accessibility | **PASS** | §11 — measured tokens + component suites |
| Cross-role journeys | **PASS (unit/integration)** — browser-level PENDING | §5 |
| Wave 0–3 regression | **PASS** | all prior suites included in the 1075-green run; no file-level regression observed |

**Release Readiness: CONDITIONAL** → promotable to READY once (a) the six Wave 4 Playwright gates are green on a normal machine/CI and (b) the performance budgets are measured. Both are external-verification items with exact procedures — not open questions.

---

## 14. Known Limitations (Wave 4)

1. **Browser-level Wave 4 gates not executed in the authoring/Wave 5 sandbox** (4 GB RAM, OOM-killed `next dev`). Specs are verified in place; CI is the execution venue.
2. **In-memory ledger in dev/preview** — the app stays useful without a database by design (TEST mode); the MCP integration suite that needs Prisma is environment-gated. Real persistence paths are unit-mocked.
3. **`overdue` lane is a cross-cut** — the same record can appear in `critical`/`pending_approval` *and* `overdue`; `totals.exceptions` deliberately excludes `overdue` to avoid double counting (documented in `lib/command-center.ts`, asserted in `command-center.test.ts`).
4. **SLA policies are hardcoded business commitments** (same-day settlement desk). Changing a commitment is a one-line policy change — but there is no admin UI yet (Wave 5+ candidate).
5. **Analytics dashboards are not built** — the catalog and events exist; no per-JRN funnel dashboard yet (Wave 5 scope).
6. **Hero 3D** remains on the dashboard (spec allowed replacement only if LCP > 2.5 s; the LCP measurement is pending, so the placeholder decision is deferred, not skipped).
7. **Offline queue / IndexedDB** (spec Phase 4) — not implemented; refresh failures are surfaced but not queued.
8. **Web push / SSO bridge** — deferred by spec MoSCoW (Won't now / Wave 5+).

---

## 15. Rollback

Every Wave 4 unit is revertible without data migration:

- Command Center: revert `dashboard/page.tsx` to the Wave 3 Needs Attention (component retained, unused).
- SLA ledger wiring: remove the `?sla=` param + badge column from `canonical-transactions-table.tsx`; `lib/sla.ts` stays (pure function).
- Two-phase refund: revert the three actions + `RefundWorkflow`; the single-step `refundTransactionAction` remains as the fallback path.
- Handoff engine: stores stop calling `openHandoff`; the engine file is inert.
- `usePolling`: revert to the pre-Wave 4 hook (banner stops updating).
- Analytics: `trackEvent` is a no-op when the tracker key is absent — removing the key silences everything.

---

*Report finalized in Wave 5. All "PASS" rows cite an executed result at commit `b953cc9`; every other status is explicitly PENDING / BLOCKED_BY_ENVIRONMENT / NOT_RUN with its reason and procedure.*
