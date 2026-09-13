# Wave 11 — Product Gaps: SLA Admin, Analytics Surface, Billing UX & Table Consolidation (Spec)

Date: 2026-09-13 · Branch: `wave-7d-derived-scoping` (main@a4b595a)
Predecessors: Wave 7H (analytics org dimension — the data contract this wave's dashboards consume); D-10, D-11, D-12, D-13, D-15, D-16
Status: **Proposed**

---

## 0. Runtime baseline (measured, not carried over)

| Gate | Result 2026-09-13 |
|---|---|
| Full suite | **1472 passed / 17 failed** (15 pre-existing env + 2 calendar flakes) |
| Typecheck | clean · Lint 0 errors / 40 warnings (== D-17) |

## 1. Goal

> Every number the app shows is adjustable where the business owns it, visible where the
> operator needs it, and creatable where the journey promises it. After Wave 11, no stat
> card is hard-coded, no emitted event has no dashboard, no "Create" button is dead, no
> invite lives forever, and no table exists twice.

## 2. Standard (applies to every item below)

The repo's own UX audit bar (evidence-first, no invented numbers): every new figure is
derived in-repo with the derivation named; every control has a handler or is removed;
design-system tokens only (`DESIGN.md` first, then `tailwind.config`); shadcn primitives,
never rewrites (`AGENTS.md` component rules); numerics `data-mono` right-aligned.

## 3. Gaps (file:line evidence, checkout `a4b595a`)

- **P-1** `lib/sla.ts:63` — `SLA_POLICIES` hardcoded, no admin UI (D-10): build the
  commitments editor (per-entity bands, optimistic draft like the Wave risk ruleset
  pattern, server-validated; deploy path emits an audit event). SLA contract tests
  (`slaForTransaction`-family) must stay green unmodified.
- **P-2** Analytics dashboards absent (D-11): events ANA-001..014 + 9 Wave-4 operational
  events are emitted but unconsumed. Build the funnel dashboard over the Wave 7H org
  dimension (per-tenant filter is the point — without 7H this item waits; dependency
  stated, not assumed). No invented funnels: every chart cites its event ids.
- **P-3** QuickPay drawer SCR-038/FE-005 never built (D-12): single-payment creation via
  the spec's 4-field drawer (verify spec fields at Q2 against `IMPLEMENTATION_READY_UX_SPEC.md`);
  the existing dialog stays until the drawer passes parity, then the dialog goes (no two
  creators — P-6 precedent).
- **P-4** Invite 7-day expiry cron missing (D-13): invites never auto-expire; add the
  scheduled expiry (verify scheduler seam at Q2 — no Redis until needed per `QUEUES.md`)
  + the SLA nudge (5d approaching / 2d critical) the debt row cites.
- **P-5** Offline queue for bulk/CSV retry missing (D-15, spec Phase 4): IndexedDB queue
  for disconnected operators (enqueue bulk/payout-retry/CSV export ops, replay on
  reconnect, conflict → explicit review, never auto-apply — Wave 4 conflict rule).
- **P-6** Legacy tables coexist (D-16): `transactions-table.tsx` retained beside
  `canonical-transactions-table.tsx` (+ `batches-table.tsx` — verify at Q2); delete the
  legacy files once route-level imports point only at canonical (grep-gate, then delete).
- **Out of scope**: D-23/24/25 (WONTNOW — SSO bridge, web push, multi-currency);
  any new tpl(route without a screen manifest entry (`SCREENS.md` + `PROGRESS.md` per AGENTS.md).

## 4. Design

Six independent sub-slices, one wave: P-1 settings-domain (draft/deploy pattern reused);
P-2 read-only analytics surface (no new event emission); P-3 drawer component with dialog
parity + dialog deletion; P-4 scheduler-seam cron (document the no-Redis ladder);
P-5 client IndexedDB queue (no server component); P-6 deletion-only slice (grep-gate first).
Each sub-slice independently committable; single Q7 report. Shared seam where honestly
shared: audit events for P-1/P-4 deploys and expiries.

## 5. Tests

- **PR-1..PR-18** (3 per sub-slice): SLA edit round-trip (draft → validate → deploy →
  contract tests green); dashboard renders per-tenant funnel from seeded events (no
  invented numbers — seed Factories cited); drawer parity with dialog (same created
  record shape) + dialog deletion grep-gate; invite expiry transitions status at day 7
  (time-travel test) + nudge events at 5d/2d; offline queue enqueue → reconnect →
  replay-exactly-once + conflict-review path; legacy-table import grep returns only
  canonical.
- **Mutation-style negatives**: draft-deploy skipped (direct apply) ⇒ validation test red;
  dashboard seeded with invented events ⇒ provenance test red; dialog retained ⇒
  single-creator grep red; expiry cron removed ⇒ day-8 invite still valid ⇒ red.
- Gates: full suite + typecheck + lint baselines held; e2e additions run in the Wave 9
  harness (no new harness).

## 6. Plan (serial, sub-slice order P-6, P-4, P-1, P-3, P-5, P-2 — deletions and crons first)

Q0 spec (this doc) → Q1 failing tests per sub-slice → Q2–Q5 sub-slices in order (each:
implement → wire → adjacent-test updates) → Q6 negatives above → Q7 report + ADR +
close D-10/D-11/D-12/D-13/D-15/D-16 + commit (up to six commits, one report).
