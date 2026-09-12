# UX Redesign — Final Implementation Report (Wave 0–4)

> **Consolidates:** `AUDIT_JOURNEY_REPORT.md` + `AUDIT_PROFESSIONAL_UX_REDESIGN.md` (AS-IS, source of truth) → `IMPLEMENTATION_READY_UX_SPEC.md` (TO-BE contract: 21 JRN × 45 SCR × 20 INT × 24 CMP × 14 ANA) → `WAVE_0..4_IMPLEMENTATION_REPORT.md` (what shipped) + executed test evidence at HEAD `b953cc9`.
> **Date:** 2026-09-12 (Asia/Jakarta) · **Branch finalization:** `arena/01a095a1-pay-dash`
> **Status vocabulary:** **VERIFIED** = executed evidence cited · **IMPLEMENTED** = code + unit tests, browser-level not yet executed · **PARTIAL** = subset shipped · **BLOCKED** = cannot be executed for a stated environment reason · **DEFERRED** = consciously out of scope for now (with target).
> **Rule applied throughout:** nothing is PASS without an executed result; "implemented" and "verified" are never conflated.

---

## 1. Executive Summary (1-page final)

**The problem.** The AS-IS audit found PayDash a professional-grade payment-ops console at **5.8/10**: every happy path could complete, but journeys were implementation-driven — a flat 30-item sidebar, **auth fail-open**, payout/refund/export mutations without server-side RBAC, no dual-control queue (a text-field `approverId` instead of a handoff), no data-freshness signal, CSV invalid rows silently dropped, mobile navigation 5/30 usable, and SLA/overdue semantics absent.

**What was fixed (Wave 0–4).**

1. **Safety first (Wave 0):** fail-closed auth (default `strict`, preview bypass documented), per-resource export guards (11 routes), payout RBAC on 9 actions, refund dual-control enforced server-side (initiator ≠ approver, thresholds IDR 10 M / 50 %), bottom-nav fix, CLS-reducing skeletons (0.18 → 0.05), AA success token (2.5 : 1 → 5.1 : 1).
2. **Orientation (Wave 1):** role-aware grouped navigation (5 sections, permission-gated, collapsible, mobile More sheet), route resolver + alias safety (all 30 legacy routes still resolve), breadcrumbs, page header, canonical state views.
3. **Data operations (Wave 2):** one canonical DataTable across Transactions/Payouts/Customers, **URL as the source of truth** for every list state (search 250 ms, filters + chips, sort, pagination, page-scoped selection), bulk workflows with partial-failure recovery, CSV import that **preserves invalid rows** + `failed.csv`, filtered + permission-guarded export, mobile cards.
4. **Governance & freshness (Wave 3):** real 20 s polling + >60 s stale banner, 409 optimistic-locking with conflict dialog, backend idempotency for money movement, blocklist governance (inline + CSV, duplicate detection, actor + timestamp), webhook provenance + replay permission, canonical timeline (deterministic dedupe), Needs Attention dashboard, command palette (role-aware, safe-only), a11y hardening.
5. **Operational surface (Wave 4):** **Command Center** (6 exception lanes, server-computed `canAct`), **SLA 4-band model on real timestamps** wired into cards *and* the ledger (`?sla=` filter), **two-phase refund** (request → approve/reject, different actor, dual-actor timeline), cross-role handoff engine (no dead ends), freshness backbone rewrite (age ticks without fetch, failures surfaced), conflict dialog mounted (never auto-applies), typed analytics catalog with PII allowlist, six Playwright critical gates authored.

**Scale of change.** 5 waves, 9 tickets in Wave 0 + 30+ tickets across Waves 1–4, 45+ files touched in PR #9 alone, 112 unit/component test files, ~224 E2E test invocations across 30 spec files, no legacy route broken (alias map preserved), no database migration.

**Test evidence at HEAD `b953cc9` (executed 2026-09-12):** typecheck **0 errors** · lint **0 errors** (40 pre-existing warnings) · **1075 unit/component tests passing / 111 files** (1 suite environment-blocked: Prisma binary download) · Playwright Wave 4 gates **PENDING EXTERNAL VERIFICATION** (4 GB host OOM-kills `next dev`; specs + procedure verified in place) · production build **BLOCKED_BY_ENVIRONMENT** in-sandbox (font network + RAM; CI authoritative) · performance budgets **PENDING EXTERNAL VERIFICATION** (procedure documented).

**Critical safety guarantees (all with executed evidence):** no unauthenticated access to protected routes/APIs (proxy strict + per-route guards, unit-verified) · no same-actor refund approval (server-enforced, 17/17) · no duplicate money mutation (idempotency, 7/7) · no blind overwrite on conflict (version check + explicit review, 6/6 + component) · no PII in analytics (allowlist + value redaction, 25/25) · E2E persona harness never widens strict mode (16/16).

**Known remaining risk.** The two browser-level verification surfaces — the six Wave 4 Playwright gates and the performance budgets — have not been executed anywhere yet; everything else is green. They are PENDING EXTERNAL VERIFICATION with exact procedures (§22). Secondary risk: production build not reproduced in-sandbox (environment), so bundle-level performance claims remain unmeasured.

**Release recommendation.** **CONDITIONAL** — merge-ready on code quality (typecheck/lint/unit/component all green, no regressions); declare READY and ship only after (a) the six Playwright gates pass on a normal machine/CI and (b) the performance budgets are measured. Neither is an open question — both have exact, documented procedures.

---

## 2. Original Problems (AS-IS, from the audits)

Grounded in `AUDIT_JOURNEY_REPORT.md` (43 routes, Next.js App Router `[locale]`, Better Auth, Prisma + `globalThis` in-memory fallback, kinetic_ledger tokens) and `AUDIT_PROFESSIONAL_UX_REDESIGN.md`:

| # | Problem (AS-IS) | Severity | Evidence |
|---|---|---|---|
| P1 | **Auth fail-open** — `proxy` opt-in; protected data reachable without a session | P0 | audit §1 top problem 1; `AUTH_ENFORCED` legacy `=== "1"` |
| P2 | **Payout/Refund/Export no RBAC** — money movement and CSV export reachable without server-side permission checks | P0 | 6 high-risk server actions without proportional confirmation; exports public while pages protected |
| P3 | **Refund dual-control absent** — single actor could both request and approve; `approverId` was a text field in the same form | P0 | JRN-003 blueprint impossible to complete |
| P4 | **Sidebar flat 30 items** — alphabetical/historical, 3 entry points for one capability (Payouts/Bulk/Settings), orphan `/payments/platform`, parent `/reports` 404 | P1 | `sidebar.tsx:6-30`; IA depth 4.2 |
| P5 | **No exception-first dashboard** — vanity metrics first, overdue/failed hidden in audit drill-down | P1 | "Does the operator know what needs them?" = no |
| P6 | **No data-freshness signal** — "is this live?" distrust; PENDING rows with no auto-check | P1 | audit problem 4/9 |
| P7 | **CSV invalid rows disappear** — re-upload friction on bulk payout | P1 | audit problem 6 |
| P8 | **Mobile 5/30 navigation** — field worker blocked; bottom-nav `===` missed child routes | P1 | audit problem 8; `bottom-nav.tsx:17` |
| P9 | **Permission denial = dead button** — refund trigger visible but action toast-locked after click | P1 | audit problem 5 (rage clicks) |
| P10 | **A11y gaps** — success token 2.5 : 1 (below AA), 28 px touch targets, no skip link | P1 | audit top-10 problem 10 |
| P11 | **No URL state** — filters/search lost on refresh/back/share; no bookmarkable triage view | P1 | ledger screens only |
| P12 | **No idempotency/concurrency contract** — double-submit and two-tab races undefined | P2 | money movement |

---

## 3. AS-IS Baseline (measured)

| Metric | AS-IS | Source |
|---|---|---|
| Overall UX score | **5.8 / 10** ("consistent but not optimized") | audit §68/§100 |
| IA depth | 4.2 | audit |
| Mobile nav reach | 5/30 items | audit |
| Create-payment | 58 s, 11 clicks | audit |
| Bulk payout | 4.2 min, 14 clicks | audit |
| CLS (6 list routes) | 0.18 (spinner) | Wave 0 pre-measurement |
| Success-text contrast | 2.5 : 1 | Wave 0 pre-measurement |
| Auth posture | fail-open | `proxy.ts` legacy |
| Money-mutation guards | none server-side | actions pre-Wave 0 |
| Freshness | none | no polling |
| Table implementations | 4 divergent (90.1% divergence) | audit §16 |

## 4. TO-BE Architecture

Target (spec, ICE-scored): **8.7/10** — exception-first operations console where every state is visible, every mutation is permission-bound and idempotent, every list view is URL-shareable, and every cross-role journey has a second actor's queue.

**Layers (all in-repo, no new frameworks):**

```
┌────────────────────────────────────────────────────────────────────┐
│  UI  app/[locale]/*  — server-rendered, force-dynamic where data   │
│      canonical components (data-table/, command-center/, timeline) │
│      a11y (skip link, focus traps, live regions, AA tokens)        │
├────────────────────────────────────────────────────────────────────┤
│  Client state  URL as list-state source of truth (table-url-state) │
│      usePolling (20s/60s, tick-without-fetch)  jotai where needed  │
│      analytics-events (typed catalog + PII allowlist)              │
├────────────────────────────────────────────────────────────────────┤
│  Server Actions  "use server"  — ActionState<T> contract           │
│      requireStrictOrgContext(perm) on every mutation               │
│      step-up + dual-control (domain/security/step-up.ts)           │
│      idempotency + version checks (server/data/*)                  │
├────────────────────────────────────────────────────────────────────┤
│  Domain  roles.ts (8 roles × 25 perms, least privilege)            │
│      sla.ts (4 bands, 10 policies, clock-injected)                 │
│      handoff-store.ts (engine, no store imports → no cycles)       │
├────────────────────────────────────────────────────────────────────┤
│  Edge  src/proxy.ts (via src/middleware.ts) — AUTH_ENFORCED        │
│      strict (default) | preview | off; 302/401 fail-closed         │
│      alias rewrites (30 legacy routes → canonical, 308-safe)       │
├────────────────────────────────────────────────────────────────────┤
│  Data  in-memory globalThis stores (dev/preview, TEST mode) with   │
│      deterministic seed; Prisma persistence for MCP/audit paths    │
└────────────────────────────────────────────────────────────────────┘
```

**Invariants (documented + tested):**
1. Authorization resolves from the authenticated session — never from the browser, form, or cookie the client can set in strict mode.
2. Money moves only through server actions with permission + (where required) dual-control + idempotency.
3. A list view is fully described by its URL; refresh/back/share/reload all restore it.
4. No mutation is applied on a stale version without explicit human review of the latest state.
5. No PII leaves the client through analytics (allowlist + value redaction, enforced by type).
6. Every cross-role handoff exposes a next step for *someone* (action or named escalation) — no dead ends.
7. Stale data is always labeled (age + banner); a failed refresh is always surfaced.

---

## 5. Wave 0–4 Summary

| Wave | Theme | Headline deliverables | Executed evidence | Gate |
|---|---|---|---|---|
| **0** | Safety + correctness foundation | BE-001 fail-closed proxy (strict default), BE-002 refund dual-control, BE-003 payout RBAC (9 actions), BE-004 export guards (11 routes), FE-015 bottom-nav fix, FE-016 7 skeletons (CLS 0.18→0.05), FE-001 alias safety, DSN-005 AA tokens | 17 new unit tests + existing suites green; commits `9bf01dd fbae269 db4c615 5e4f6af 6f7f0af` | Security PASS, UX-foundation PASS (report §14) |
| **1** | Orientation / grouped IA | FE-002 grouped nav + route resolver + permission adapter + sidebar/bottom-nav/More sheet/app-chrome; FE-003 breadcrumb + PageHeader + state views | route-resolver 20/20, permission-adapter 12/12, sidebar 9/9, bottom-nav 5/5, proxy.alias 6/6 (all in the 1075-green run) | PASS |
| **2** | Data operations | CMP-005 canonical DataTable; FE-010 URL state (parser/serializer, legacy aliases, chips); search 250 ms; sort/pagination; page-scoped selection; FE-007 CSV import (invalid preserved + failed.csv); guarded filtered export; mobile cards | table-url-state 11/11 (+96-line PR #9 extension), canonical-data-table 9/9, csv-import 3/3; e2e table-flows 7 tests (inventory) | PASS with documented deferrals |
| **3** | Governance + freshness | FE-012 customers migration (8/8), CMP-008 real StaleBanner + `usePolling` v1, BE-007 409 optimistic locking (6/6), BE-005 idempotency (7/7), Needs Attention 6 cards (6/6), FE-013 blocklist governance (5/5), FE-014 webhooks (4/4), CMP-009 timeline (5/5 + rebuilt 58/58 in W4), FE-011 palette v1 (rebuilt in W4), DSN-A11Y hardening | 27 new tests; 6 E2E flows automated (table-flows/payouts/permissions/mobile) | PASS (report §6) |
| **4** | Operational surface | Command Center (15/15 server + components), SLA model + ledger wiring (26/26 + components), two-phase refund (17/17 + 10/10 UI), handoff engine (25/25 + 19/19), `usePolling` rewrite (24/24), conflict dialog mounted, analytics catalog (25/25), timeline rebuild (58/58), palette rebuild on cmdk, persona harness (16/16), 6 Playwright gate specs | 1075 passing / 111 files at `b953cc9` | **CONDITIONAL** — Playwright gates + perf PENDING EXTERNAL VERIFICATION |

**Cumulative test evolution:** 17 new (W0) → 90 gate-suite green (W1) → 113 (W2) → 140 wave-scoped (W3) → **706 full-suite (W4 baseline, after reconciling the earlier "140" claim)** → **1075 full-suite (+9 files) at `b953cc9`**. The W3 report's "140 tests green" was a wave-scoped count; the W4 baseline note in `IMPLEMENTATION_PROGRESS.md` reconciled it against the actual full-suite measurement. This report always cites full-suite numbers for gates.

---

## 6. Security Improvements

| Guarantee | Mechanism | Evidence |
|---|---|---|
| No unauthenticated page access | `src/proxy.ts` (loaded via `src/middleware.ts`) — `AUTH_ENFORCED` default **strict**; protected prefixes 302 → `/sign-in`; API 401; `preview` mode only via `x-preview-bypass: 1` (preview env); legacy `1/true` treated as strict | `proxy.test.ts` 7/7 · `proxy.alias.test.ts` 6/6 · E2E-002 code-enforced (Wave 0) |
| No unauthenticated export | `guardExport(request, permission)` on 11 export routes — per-resource least privilege (audit→`audit.read`, transactions/balance/invoices→`transaction.read`, customers→`customer.read`, payouts→`report.export`/`payout.create`, blocklist→`audit.read`, team→`team.manage`, subscriptions→`report.export`) | `export-guard.test.ts` 5/5 (401/403/200 matrix) — documented SPEC_CONFLICT vs uniform `audit.read` in Wave 0 report |
| No unauthorized money movement | `requireStrictOrgContext(perm)` on every server action (create/retry `money_in.create`; payout `create/release/cancel/retry`; refund split into `prepare`/`execute`) | org-context 7/7, roles 7/7, payment-flow suites; Wave 4 e2e gate 3 (PENDING) |
| No same-actor approval | `isApproverDistinct` + session-derived actors (never form-supplied); thresholds IDR 10 M or 50 % | `refund-lifecycle.test.ts` 17/17 |
| No duplicate mutation | idempotency key = hash(orgId+type+entityId+payloadHash); same key+payload → original result; same key+different payload → 409 | `idempotency.test.ts` 7/7 |
| No silent stale overwrite | version check → 409 conflict payload → explicit review → versioned retry | `conflict-resolution.test.ts` 6/6, `retry-button.test.tsx` 5/5 |
| No PII in analytics | per-event prop allowlist + DENY_KEYS + value-shape redaction (email/PAN/ID phone/long digit runs) + 120-char cap | `analytics-events.test.ts` 25/25 |
| E2E harness cannot widen auth | `paydash_persona` cookie honoured only in off/preview; strict never reads it | `test-persona.test.ts` 16/16 |
| Provider writes never mocked | connected-but-failing provider propagates; fallback only when no connection | `execute-provider-write` (W4 refund path) |
| Command Center endpoint fail-closed | `guardApiRead` + `no-store` + session re-check per poll | route + guard tests |

**Known security debt (visible in §20/`KNOWN_DEBT_REGISTER.md`):** MCP endpoint rate limiting, MCP call audit logging, `crypto.timingSafeEqual` for token comparison (TODO.md items R1–R3) — outside the UX redesign scope, pre-existing, registered.

---

## 7. Navigation & IA

- **AS-IS:** 30 flat items, 3 entry points for payouts, orphan `/payments/platform`, broken `/reports` parent, bottom-nav `===` bug.
- **TO-BE (shipped):** `nav-config.ts` — 5 grouped sections (Overview / Money In / Money Out / Governance / Operations / Developer + pinned footer) with per-item `requiresPermission`; `hasPermission(role, perm)` gates visibility (OWNER 28/30, FINANCE_OPERATOR 12, SUPPORT 8, DEVELOPER 10 — spec §6 targets); collapsible sidebar (280→64), mobile **More sheet** with grouped sublists, active state via `startsWith` + dashboard exact match (FE-015 fix).
- **Alias safety:** all 30 legacy routes resolve via rewrites/alias map (`route-resolver.ts`), old bookmarks and shared URLs keep working; 308-safe redirect behaviour unit-tested (`proxy.alias.test.ts` 6/6, `route-resolver.test.ts` 20/20).
- **Chrome:** breadcrumb (intermediate links, overview non-clickable), PageHeader with next-best-action, canonical state views (loading/empty/error/forbidden with distinct copy — "no results" ≠ "no data" ≠ "no rows match filters").
- **Command Palette (JRN-020):** rebuilt on cmdk in Wave 4, mounted via `next/dynamic` (`ssr:false`) — role-aware (only permitted routes), fuzzy, recent 5, **safe-only** (no destructive/money actions from the palette). `command-palette.test.tsx` green; E2E-023 in inventory.

---

## 8. DataTable & URL State

- **One canonical component** (`components/data-table/canonical-data-table.tsx`, CMP-005) used by Transactions, Payouts, and (Wave 3) Customers: sticky header, `aria-sort`, pagination (10/25/50), page-scoped selection with unambiguous "page scope" labeling, bulk bar (`role=region`, `aria-live`), distinct empty states, error retry, mobile cards with column priorities 0/1/2, `cardRenderer` contract (identity + status + metadata + action).
- **URL = source of truth** (`lib/table-url-state.ts`): `parseTableUrlState`/`serializeTableUrlState` — only non-defaults emitted; legacy aliases normalized (`search→q`, `page_size→pageSize`, `sortBy→sort`, `order→direction`); duplicate keys last-wins; malformed input falls back deterministically (never crashes); Wave 4 extended the same contract with `sla` (4 bands + ALL) and `refundState` (case-insensitive, chip "Refund: Awaiting approval", CSV export mirror).
- **Consequences (verified by round-trip + unit):** refresh, back/forward, bookmark, share all restore the exact view; filter/search changes reset `page`; the operator's triage state (`?sla=OVERDUE`) survives detail navigation (Wave 4 gate 2/6, PENDING browser verification; URL contract itself unit-verified).
- **Search:** 250 ms debounce, Esc clears, no-results distinct from no-data, `q` synced to URL; analytics emit `query_length`/`result_count` only (raw query is on the PII deny-list).
- **Export:** respects the current URL filter set (what you see is what you exports), guarded per resource (Wave 0 guard unchanged).

---

## 9. Governance

- **Blocklist (JRN-011, FE-013):** inline add (chip + required reason) and CSV ramp (same validator as payouts, ≥5 entries), client+server duplicate detection, actor + timestamp in the audit trail, `blocklist.manage` guard. `blocklist-governance.test.ts` 5/5.
- **Webhooks (JRN-014, FE-014):** protocol-aware endpoint copy (`${location.protocol}//host/...`), replay gated by `webhook.replay` + `provider.connect.test`, provenance (original vs retry vs replay) with DUP badge linking the original, delivery audit fields. `webhooks-improved.test.ts` 4/4.
- **KYC:** submissions surface in the Command Center `kyc_review` handoff lane (Wave 4) with the 24 h SLA policy; mandatory-gate banner per spec §36.
- **Risk:** high-risk payments (riskScore ≥ 65, non-refunded) surface as a `needs_attention` card referencing only reference IDs (PII rule); fraud-review handoff lane; velocity draft→deploy unchanged from base with destructive-confirm.
- **Audit trail:** every Wave 3/4 governance mutation records actor + timestamp + reason; the canonical timeline renders them (single-event model, deterministic dedupe now keyed by actor+action+targetId+timestamp+**entityType** — cross-store collisions fixed in W4, 58/58).

---

## 10. Idempotency

- **Contract (BE-005/BE-008, `server/data/idempotency.ts`):** key = hash(orgId + type + entityId + payloadHash). Same key + same payload → original result replayed (no second mutation). Same key + different payload → **409** (conflict, not silent overwrite).
- **Scope:** payout batch create, refund request, payment retry — the three money-adjacent mutations. Client side: `bulkPending` disables the bulk bar while in flight; CSV `seen` set dedupes duplicate accounts within a file.
- **Relationship to 409:** idempotency answers "did I already do this?"; versioning answers "did the row change under me?" — both are required for safe money movement and both are in the test suite (7/7 + 6/6).
- **Step-up (financial):** `domain/security/step-up.ts` binds a single-use, short-lived challenge proof to operation + actor + org + amount + destinations + version + nonce; verification rejects used/expired/nonce-mismatched/operation-changed proofs. (Policy + binding logic verified by unit; the MFA transport itself is out of scope for this redesign — registered as debt.)

---

## 11. Freshness & Conflict Recovery

**Freshness (CMP-008/019 + `usePolling`):**
- 20 s poll while tab visible (spec §7); pauses on `document.hidden`, resumes on `visibilitychange`; one timer chain; `inFlightRef` prevents overlapping refreshes.
- Displayed age ticks **every second without a fetch** — the >60 s stale banner trips on its own (`StaleBanner` shows age + Refresh).
- A failed refresh sets `error` and does **not** advance `lastUpdated` — the UI keeps the age honest.
- The reduced-motion defect is fixed: polling is unconditional (motion preference ≠ data currency); motion lives in CSS.
- `use-polling.test.tsx` 24/24, `stale-banner.test.tsx` green, freshness e2e gate (2 tests) PENDING EXTERNAL VERIFICATION.

**Conflict recovery (CMP-020, BE-007):**
- Client sends the `updatedAt` it rendered (`expectedUpdatedAt`); server compares → on mismatch returns `{ code: "CONFLICT", latest }` in the `ActionState`.
- `ConflictDialog` renders the **latest server state** (real information, e.g. status now PROCESSING), offers *Retry with Latest* (versioned re-send) or dismiss (sync). **Never auto-applies.**
- Recovery emits `conflict_recovered` (`version_delta`).
- Evidence: `conflict-resolution.test.ts` 6/6, `retry-button.test.tsx` 5/5, real two-tab-race e2e gate PENDING EXTERNAL VERIFICATION.

---

## 12. Command Center

The dashboard's primary content (replacing the Wave 3 Needs Attention block) — `server/data/command-center.ts` + `components/command-center/*` + `/api/dashboard/command-center`:

- **Six lanes:** `critical` (SLA critically breached, or money stuck/failed) · `needs_attention` (approaching SLA, high-risk) · `pending_approval` (awaiting a second actor) · `failed` (retryable terminal failures) · `overdue` (cross-cut: any pending item past deadline) · `recently_completed` (24 h — proof the queue drains).
- **Same stores, same queries** as the list screens — a card count and the filtered list behind it cannot disagree. Items link into filtered views (`/payouts?status=FAILED`, `/transactions?status=FAILED`, `/en/transactions?refundState=AWAITING_APPROVAL`, `/dashboard?lane=…`).
- **`canAct` computed server-side** per viewer role; items the actor cannot act on are still shown with "waiting on …" copy (hiding recreates the dead end). Handoff-derived lanes use `canActOnHandoff` (at least one closable handoff in the group).
- **No double counting:** `overdue` is `crossCut: true` and excluded from `totals.exceptions` (`COUNTED_EXCEPTION_LANES` is the shared vocabulary — asserted in tests).
- **All-clear state** (`totals.exceptions === 0`) renders the celebrate view; the worst band drives a page banner (`worstBand`).
- **PII rule:** card samples carry reference/batch ids only; risk-alert customer names never reach a card or an event.
- **Skeleton** renders the same card metrics as the loaded cards (CLS by construction); endpoint is `no-store` + `guardApiRead` + per-poll session re-check.
- Evidence: `command-center.test.ts` 15/15 (server), `command-center.test.tsx`, `command-center-card.test.tsx`; freshness/stale e2e gate exercises the endpoint (PENDING).

---

## 13. Cross-Role Journeys

**Problem solved:** before Wave 4, a journey that changed hands had no landing place for the second actor — the requester typed an `approverId` into a form field. That is a dead end for Role B.

**Engine (`server/data/handoff-store.ts` + `handoff.ts`):**
- 8 journey types (payout_approval, payout_retry, refund_approval, payment_triage, kyc_review, fraud_review, webhook_triage, invite_acceptance) × 6 statuses (OPEN/NOTIFIED/CLAIMED/COMPLETED/REJECTED/CANCELLED).
- The store imports **nothing** from the payout/transaction/KYC stores — those stores open handoffs, the engine cannot cycle.
- `deriveHandoffs` layers a derived view over the *real* stores (payouts, refunds, failed payments, risk alerts, KYC, webhooks), so the queue reflects ledger truth, not a parallel bookkeeping table.
- **Invariant: every handoff exposes a next step** — `nextStepFor` returns either an `action` (the current actor can act) or an `escalate` naming the roles that can, with a deep link into their queue. There is no third case (asserted in `handoff-store.test.ts` 25/25).
- **Visibility vs authority are separate:** a role can *see* a handoff (its queue) without being able to *act*; both are reported distinctly so the UI never shows a button it cannot back.
- Notifications are role-scoped (never individual) with a deep link into the filtered queue — that link is what makes it not a dead end.
- **Headline journey (JRN-003):** agus (SUPPORT, `refund.prepare`) requests → `AWAITING_APPROVAL` + handoff to FINANCE_ADMIN/OWNER → hendri (FINANCE_ADMIN, `refund.execute`) approves from the same transaction → money moves, handoff closes, timeline records both actors. Browser-level gate 1 PENDING EXTERNAL VERIFICATION; every server-side step unit/integration-verified (17/17 + 25/25 + 19/19).
- `journey_started` / `journey_completed` analytics (with `duration_ms`, `outcome`) measure the cross-role funnel end-to-end.

---

## 14. Accessibility

| Area | Status | Evidence |
|---|---|---|
| Focus visible | PASS | 2 px solid primary ring, `:focus-visible`, offset 2 px (Wave 0 DSN-005) |
| Skip link + landmarks | PASS | `Skip to main content` in app layout; `nav`/`main` landmarks (Wave 3) |
| Touch targets | PASS | 44 × 44 minimum (bottom nav 64 px rows, row actions, filter controls) |
| Contrast AA | PASS | success 2.5 : 1 → 5.1 : 1 (Wave 0); Wave 4 status tokens `--pending/failed/critical/overdue-text` ≥ 4.5 : 1 measured in light + dark |
| Not colour-only (1.4.1) | PASS | `SlaBadge` = text label + icon + text countdown; colour only for dot/fill |
| Table semantics | PASS | `aria-sort`, `<caption sr-only>`, checkbox `aria-label`, pagination labels |
| Live regions | PASS | bulk bar `role=region` + `aria-live`, filter count `aria-live=polite`, toasts `role=status/alert` |
| Modals/palette | PASS | `role=dialog aria-modal`, focus trap, Esc returns focus (cmdk); palette suite green |
| Reduced motion | PASS | animations honored in CSS; **polling deliberately not gated on it** (Wave 4 fix — serving stale financial data to users with vestibular disorders was the real risk) |
| Empty/error states | PASS | distinct copy per state; error states offer retry; 403 state explains who can help |
| Full automated a11y audit (axe-core sweep across all routes) | PENDING EXTERNAL VERIFICATION | Wave 3 claimed "axe-core 0 violations" on touched screens only; a full-route sweep is in the QA handoff |

---

## 15. Analytics

- **Contract:** `lib/analytics-events.ts` is the only emittable surface — every event is a typed key in `ANALYTICS_EVENTS` with a declared prop allowlist. `trackEvent` strips unlisted props, drops DENY_KEYS (email, names, phone, account, PAN, session, **raw query keys**, …) and redacts value shapes that look like PII (email, PAN, ID mobile patterns, 16-digit runs) and caps strings at 120 chars. Unknown keys are a **type error**.
- **Coverage:** ANA-001..014 (spec §26 funnel) instrumented at real call sites — auth, payment_created, refund_requested/executed (with `actor_diff`), link, balance, payout bulk/approve/retry, nav_used, filter/search (query_length + result_count only), palette (query_length — documented deviation from the spec's raw `query` prop, which would be a PII leak), empty CTA, error_shown, stale_refreshed, key_rotated/ip_added.
- **Wave 4 operational events** (the runbook's signal layer): `journey_started/completed`, `mutation_failed` (reason, code, retryable), `permission_denied` (permission, role, surface), `stale_seen` (age_sec), `conflict_recovered` (version_delta), `sla_breached` (once per item per band), `sla_filter_applied`, `command_center_action`.
- **No new vendor** — same `lib/analytics.ts` transport, no-op when the tracker key is absent.
- Evidence: `analytics-events.test.ts` 25/25. Dashboards over the funnel: **DEFERRED** (Wave 5 scope, §21).

---

## 16. Performance

**Budgets (spec §25):** LCP < 2.5 s · INP < 200 ms · CLS ≤ 0.1 (target ≤ 0.05 on table routes).

| Item | Status | Evidence |
|---|---|---|
| Skeleton CLS on 6 list routes | VERIFIED (visual) | 0.18 → 0.05 — 5 × 44 px rows, matching column widths (Wave 0) |
| Command Center skeleton CLS | IMPLEMENTED | same card metrics as loaded cards (by construction); not re-measured with web-vitals |
| Server-rendered, no client waterfall | IMPLEMENTED | list state server-rendered from URL; `Suspense` boundaries; parallel metrics+table |
| Polling cost | IMPLEMENTED + unit-verified | one 20 s timer chain, hidden-tab pause, in-flight guard (`use-polling.test.tsx` 24/24); browser request-count check PENDING |
| Search cost | IMPLEMENTED | 250 ms debounce; no re-render per keystroke |
| Bundle: palette out of SSR | IMPLEMENTED | cmdk via `next/dynamic ssr:false`; numeric audit PENDING (needs a build) |
| LCP / INP measurement | **PENDING EXTERNAL VERIFICATION** | procedure in `QA_HANDOFF_WAVE_5.md` §9 (web-vitals via CDP on a production build) |
| Production build reproduction in-sandbox | **BLOCKED_BY_ENVIRONMENT** | font network unreachable + 4 GB host OOM during trace collection; CI is the authoritative venue |
| Virtualization | DEFERRED | not needed at 10–100 rows; revisit > 500 rows (Wave 5 candidate) |
| Hero 3D replacement decision | DEFERRED | spec: replace only if LCP > 2.5 s; LCP measurement pending, decision deferred (not skipped) |

**No performance PASS is claimed in this report except the Wave 0 skeleton CLS (visual, cited).**

---

## 17. Test Evidence (executed, at HEAD `b953cc9`, 2026-09-12)

| Gate | Result | Detail |
|---|---|---|
| Typecheck | **PASS** | `tsc --noEmit` → 0 errors |
| Lint | **PASS** | `eslint .` → 0 errors, 40 pre-existing warnings |
| Unit + component | **PASS** | `vitest run` → **1075 passing / 111 files** (195 s) |
| `server/mcp/server.integration.test.ts` | **BLOCKED_BY_ENVIRONMENT** | needs `prisma generate` → `binaries.prisma.sh` unreachable in sandbox; pre-existing; CI runs it after `prisma generate` |
| Playwright Wave 4 gates (8 tests / 6 specs) | **PENDING EXTERNAL VERIFICATION** | 3 attempts in-sandbox: (1) webServer OOM-killed mid-run (kernel `oom-kill`, dmesg-cited); (2) managed dev server OOM on `/en/transactions` compile; (3) production build OOM during trace collection. Host: 3.8 GiB RAM, no swap. Specs/config/harness verified in place; exact procedure documented |
| Playwright full inventory (~224 tests / 30 specs) | **NOT_RUN** | not executed this session; CI authoritative |
| Production build | **BLOCKED_BY_ENVIRONMENT** | see §16 row |
| Performance budgets | **PENDING EXTERNAL VERIFICATION** | see §16 |

**Wave-scoped suites that make up the 1075 (Wave 4 additions, per ticket):** timeline 58 · sla 26 · analytics-events 25 · handoff-store 25 · use-polling 24 · handoff 19 · refund-lifecycle 17 · test-persona 16 · command-center 15 · + PR #9 component/targeted suites (command-center tsx + card, command-palette, sla-badge, stale-banner, retry-button, refund-workflow, canonical-transactions-table sla+refund, table-url-state extension, sla-telemetry, transactions 209-line data suite).

**E2E inventory (NOT_RUN, for QA planning):** uat-journeys 56 · settings 13 · balance 11 · billing 11 · customers 11 · links 10 · mobile 9 · webhooks 8 · dashboard 7 · table-flows 7 · team 7 · reports 6 · audit 5 · blocklist 5 · kyc 3 · onboarding 5 · risk 4 · routing 4 · subscriptions 5 · support 5 · system 4 · smoke 2 · permissions 4 · payouts 14 · **wave4 gates 8** (6 specs).

**Regression:** all Wave 0–3 suites are inside the 1075-green run; no file-level regression observed. The Wave 3 report's "140 tests" was reconciled in Wave 4 against the true full-suite baseline (706) — see §5.

---

## 18. Coverage Matrix (final traceability)

Status: **VERIFIED** (executed browser- or unit-level evidence cited) · **IMPLEMENTED** (code + tests, browser-level not executed) · **PARTIAL** · **BLOCKED** · **DEFERRED**.
"Test" = the strongest executed evidence; PENDING rows cite the authored spec that will verify them.

| JRN | SCR | INT | CMP | ANA | Ticket | Commit | Test (evidence) | Status |
|---|---|---|---|---|---|---|---|---|
| JRN-001 | 001–004 | 001/002 | 001 | ANA-001 | BE-001, FE-015, FE-001, FE-002, FE-003 | `9bf01dd` `5e4f6af` `6f7f0af` (W0) + wave1 | proxy.test 7/7, proxy.alias 6/6, bottom-nav 4/4, route-resolver 20/20, permission-adapter 12/12, sidebar 9/9 | **VERIFIED** |
| JRN-002 | 005–007 | 003 | 005 | ANA-002 | FE-005 (drawer), FE-010 | — / wave2 | create-transaction-dialog on page; ledger search/filter suites (table-url-state 11/11, canonical-data-table 9/9) | **PARTIAL** — QuickPay drawer (SCR-038) not implemented; single-payment creation via the existing dialog works (base app) |
| JRN-003 | 006 | 005/006 | 009, 020 | ANA-003 | BE-002, W4-RFD | `db4c615` + `6578f43` `bdd74ce` `57f0598` | refund-lifecycle 17/17, refund-workflow 10/10, retry-button 5/5, conflict-resolution 6/6, payment-flow (W0) | **IMPLEMENTED** (server+UI+unit VERIFIED; browser gate 1/5 PENDING) |
| JRN-004 | 016–018 | — | — | ANA-004 | base app | — | links e2e inventory (10 tests, NOT_RUN) | **IMPLEMENTED** (base) |
| JRN-005 | 007 | 019 | — | ANA-005 | base app | — | balance e2e inventory (11, NOT_RUN) | **IMPLEMENTED** (base) |
| JRN-006 | 013–015 | 009/010 | 005, 007 | ANA-006/007 | BE-003, FE-007, W4-SLA | `db4c615` `f9a9380` | export-guard 5/5, csv-import 3/3, idempotency 7/7, canonical-transactions-table.sla; payouts e2e (14, NOT_RUN) | **IMPLEMENTED** (unit VERIFIED; browser PENDING) |
| JRN-007 | 015 | — | — | — | base app | — | payouts settings surface (base) | **IMPLEMENTED** (base) |
| JRN-008 | 009–010 | — | 005 | — | FE-012 | wave3 | customers-table 8/8 (URL state, q=email cross-link, bulk export) | **VERIFIED** (unit); e2e customers (11) NOT_RUN |
| JRN-009 | 011–012, 045 | — | — | — | FE-017 (bill pay) | — | billing e2e inventory (11, NOT_RUN) | **IMPLEMENTED** (base + FE-017 not separately verified) |
| JRN-010 | 019 | — | — | — | base app | — | subscriptions e2e (5, NOT_RUN) | **IMPLEMENTED** (base) |
| JRN-011 | 021↔022 | 012 | — | ANA-012 | FE-013 | wave3 | blocklist-governance 5/5 | **VERIFIED** (unit); e2e blocklist (5) NOT_RUN |
| JRN-012 | 024 | 013 | — | — | base app | — | risk e2e (4, NOT_RUN) | **IMPLEMENTED** (base) |
| JRN-013 | 023→030 | — | — | — | base + W4 handoff lane | — | kyc e2e (3, NOT_RUN); kyc_review lane in handoff 19/19 | **IMPLEMENTED** |
| JRN-014 | 027→028 | 014 | — | ANA-014 | FE-014 | wave3 | webhooks-improved 4/4 | **VERIFIED** (unit); e2e webhooks (8) NOT_RUN |
| JRN-015 | 020 | — | — | — | BE-006 (cron) | — | team e2e (7, NOT_RUN); invite SLA policy in sla 26/26 | **PARTIAL** — 7-day expiry cron (BE-006) not implemented; surface + invite handoff lane exist |
| JRN-016 | 035–037 | 017 | — | ANA-014 | base app | — | settings e2e (13, NOT_RUN) | **IMPLEMENTED** (base) |
| JRN-017 | 025→026 | 018 | 005 | ANA-012 | BE-004, FE-010 | `fbae269` + wave2 | export-guard 5/5, table-url-state 11/11 | **VERIFIED** (unit); e2e audit/reports (11) NOT_RUN |
| JRN-018 | 031 | — | — | — | base app | — | support e2e (5, NOT_RUN) | **IMPLEMENTED** (base) |
| JRN-019 | 029 | — | — | — | base app | — | system e2e (4, NOT_RUN) | **IMPLEMENTED** (base) |
| JRN-020 | 039 | — | — | ANA-010 | FE-011 / W4-CPAL | wave3 + PR #9 | command-palette.test.tsx (component, green in 1075) | **IMPLEMENTED** (unit VERIFIED; E2E-023 in inventory NOT_RUN) |
| JRN-021 | §9 | — | — | W4-JRN | W4-HOFF/HDER/CC | PR #9 | handoff-store 25/25, handoff 19/19, command-center 15/15 | **IMPLEMENTED** (unit VERIFIED; browser PENDING) |
| — (SLA) | 004, 005, 006, 013 | — | (SlaBadge) | W4-SLA | W4-SLA | `f9a9380` | sla 26/26, sla-telemetry, sla-badge, canonical-transactions-table.sla | **IMPLEMENTED** (unit VERIFIED; gates 2/6 PENDING) |
| — (freshness) | 044 | — | 019 | ANA-013, W4-FRESH | W4-POLL, CMP-008 | wave3 + PR #9 | use-polling 24/24, stale-banner | **IMPLEMENTED** (unit VERIFIED; gate 4 PENDING) |
| — (a11y) | all touched | — | — | — | DSN-A11Y, W4-A11Y | wave0/3/4 | contrast measured; component suites | **VERIFIED** (touched screens; full-route sweep PENDING) |

**Registry totals after Wave 4:** JRN 14/21 fully implemented (7 journeys base-app-only) · SCR 36/45 · INT 19/20 · CMP 23/24 · ANA 14/14 instrumented (dashboards deferred).

---

## 19. Remaining Risks

| Risk | Severity | Likelihood | Mitigation | Owner |
|---|---|---|---|---|
| Playwright gates fail on first real run (specs unexecuted anywhere) | High | Medium | exact procedure + warm-up tip + dynamic fixtures documented; failures get honest reporting, not papering | eng + QA |
| Performance budgets missed (LCP/INP/CLS) | Medium | Medium | budgets + measurement procedure ready; Hero 3D replacement is the fallback lever (spec-sanctioned) | eng |
| In-memory ledger divergence from real Prisma persistence | Medium | Low | MCP/audit paths use Prisma; stores are the seam; integration suite runs in CI | eng |
| SLA policy drift (hardcoded commitments vs business) | Low | Medium | single-source `SLA_POLICIES`; change = 1 line + test; admin UI registered as debt | PM |
| Analytics event schema drift | Low | Low | typed catalog = only emittable surface; type error on unknown keys | eng |
| Command Center double-count confusion (`overdue` cross-cut) | Low | Low | `COUNTED_EXCEPTION_LANES` vocabulary + tests + documented | eng |
| MCP security findings (rate limit, audit log, timingSafeEqual) | Medium (security) | — | pre-existing, registered in debt with priority (R1–R3); not part of UX redesign scope | eng |
| 4 GB-class dev hosts OOM on `next dev`/`next build` | Low (devex) | High | sandbox bootstrap script; production builds belong in CI; documented in runbook | eng |

---

## 20. Technical Debt

The full register with IDs, risk, impact, priority, and recommendation is **`KNOWN_DEBT_REGISTER.md`** (D-01…D-16). Summary by class:

- **Verification debt:** Playwright execution (all), performance measurement, full-route axe sweep, production-build reproduction on a normal host.
- **Security debt (pre-existing, MCP):** R1 rate limiting, R2 call audit, R3 `timingSafeEqual`.
- **Architecture debt:** in-memory stores as the seam (Prisma only on MCP/audit paths); SLA policies hardcoded; analytics dashboards absent; offline queue absent; QuickPay drawer (SCR-038) never built; BE-006 invite-expiry cron never built.
- **Codebase debt:** 40 lint warnings (pre-existing), legacy tables retained (intentional, coexistence), Sentry config warnings at startup (deprecated config files), root `middleware.ts`/`src/proxy.ts` indirection (documented quirk, tested).

---

## 21. Deferred Work (consciously, with target)

| Item | Reason | Target |
|---|---|---|
| Analytics dashboards (per-JRN funnel) | Wave 5 scope per spec | Wave 5 |
| Performance measurement + optimization pass (memo, bundle audit) | needs production build + web-vitals | Wave 5 |
| Virtualization (>500 rows) | not needed at current row counts | on demand |
| Offline queue (IndexedDB) | spec Phase 4 | post-Wave 5 |
| Firebase SSO bridge (AI Journal) | spec Phase 4, Won't-now in MoSCoW | post-Wave 5 |
| Web push notifications | MoSCoW Won't (now) | — |
| Multi-currency | MoSCoW Won't (now) | — |
| SLA policy admin UI | 1-line policy changes are acceptable until policies churn | post-Wave 5 |
| QuickPay drawer (SCR-038, FE-005) | not in the executed wave tickets; single-payment creation exists via the dialog | candidate for next UX wave |
| BE-006 invite 7-day expiry cron | governance nicety; surface + SLA nudge exist | candidate |
| Hero 3D replacement | gated on the pending LCP measurement | after perf verification |

---

## 22. Release Decision

| Gate | Status |
|---|---|
| Typecheck | **PASS** |
| Lint | **PASS** (0 errors, 40 pre-existing warnings) |
| Unit | **PASS** (1075 / 111 files) |
| Component | **PASS** (included above) |
| Playwright (Wave 4 gates) | **PENDING EXTERNAL VERIFICATION** |
| Playwright (full inventory) | **NOT_RUN** |
| Performance | **PENDING EXTERNAL VERIFICATION** |
| Accessibility (touched screens) | **PASS** |
| Security (executed evidence) | **PASS** |
| Cross-role (unit/integration) | **PASS** (browser-level pending) |
| Mobile (unit/component) | **PASS** (browser-level pending) |
| Production build (in-sandbox) | **BLOCKED_BY_ENVIRONMENT** (CI authoritative) |

**Release Readiness: CONDITIONAL.**

**Conditions to promote to READY (both have exact procedures, no open questions):**
1. Six Wave 4 Playwright gates green: `cd apps/web && npx playwright test e2e/wave4 --project=chromium` on a host with ≥ 8 GB RAM (or CI), per `WAVE_4_E2E_TEST_PLAN.md`.
2. Performance budgets measured (LCP < 2.5 s, INP < 200 ms, CLS ≤ 0.05 targets) per `QA_HANDOFF_WAVE_5.md` §9.

Per the Wave 5 rule, **CONDITIONAL is not escalated to READY without evidence.** If the Playwright gates or budgets fail on first execution, the honest outcome is FAIL with the failure evidence — not a re-labeled PENDING.

---

## 23. Recommended Next Steps

**Immediately after merge (verification, no new features):**
1. Run the six Wave 4 Playwright gates in CI/normal machine → record results into `WAVE_4_IMPLEMENTATION_REPORT.md` §8 (promote to PASS or report FAIL with evidence).
2. Run the full E2E inventory (224 tests) — this is the regression net for the whole redesign; failures triage into `docs/QA_ISSUES.md`.
3. Measure performance (web-vitals via CDP: LCP/INP/CLS on `/en/dashboard` + `/en/transactions?sla=OVERDUE`; polling request count over 90 s; one React profiling pass) → fill §16.
4. Full-route axe-core sweep (all 30+ routes, both locales) → close the a11y "touched screens only" caveat.
5. Update this report's §22 with the executed results; promote to READY only per §22 conditions.

**Wave 5 (scope-disciplined, per spec):**
6. Analytics dashboards over the ANA-001..014 + W4 events (the funnel that feeds backlog prioritization).
7. Observability wiring of the runbook's signals (`permission_denied` spike, `sla_breached` rate, `conflict_recovered` frequency, `stale_seen` age distribution) into existing dashboards — no new vendor.
8. MCP security remediation (R1–R3) — the highest-priority non-UX debt.

**Explicitly NOT in scope (scope discipline):** new redesigns, new components not required by the above, large refactors, new frameworks, new telemetry vendors.

---

*Final consolidation of Wave 0–4. Every PASS cites executed evidence at `b953cc9`; every other status is explicit (PENDING / NOT_RUN / BLOCKED_BY_ENVIRONMENT / DEFERRED) with its reason and procedure. Companion documents: `WAVE_4_IMPLEMENTATION_REPORT.md`, `RELEASE_NOTES_WAVE_0_TO_4.md`, `PR_REVIEW_GUIDE.md`, `PRODUCTION_UX_RUNBOOK.md`, `QA_HANDOFF_WAVE_5.md`, `DEVELOPER_HANDOFF_WAVE_5.md`, `KNOWN_DEBT_REGISTER.md`, `docs/adr/*`.*

