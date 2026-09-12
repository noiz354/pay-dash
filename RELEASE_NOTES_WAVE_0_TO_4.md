# Release Notes — PayDash Kinetic Ledger UX Redesign (Wave 0–4)

> **Audience:** non-technical (PM, business, support) and technical (eng, QA, ops).
> **Base:** `main` at `b953cc9` (PR #9 merged 2026-09-12) · **Date:** 2026-09-12
> **One line:** the dashboard became an operations console — exceptions first, every action permission-checked, every state shareable, and money movement protected by dual control, idempotency, and conflict review.

**How to read status:** ✅ shipped & tested in this release · 🕐 verified in code and unit tests, browser-level checks scheduled · ⏸ not yet shipped (deferred, listed with target).

---

## What changed in plain language

Before, an operator could get stuck: the menu was a 30-item alphabet list, "waiting for someone else" work was invisible to that someone else, nobody could tell if the numbers were live, and — most seriously — some money-related actions and file exports did not check whether the person was allowed to do them. This release fixes the serious gaps first (Waves 0–1), then makes daily work faster and safer (Waves 2–4).

**Non-technical checklist of what you will notice:**
- You only see the menu items and buttons your role is allowed to use — and if something is locked, the screen tells you *why* and *who* can help (not just a failed click).
- The dashboard opens with **what needs action** (exceptions: overdue, failed, waiting on a second person), not vanity charts. When nothing needs action, it says so.
- Every list view (transactions, payouts, customers) can be **filtered, searched, sorted and shared as a URL** — refresh, back-button, and bookmark all keep your view.
- Money-out actions that exceed the company's dual-control limits now **wait in a visible queue for a different, authorized person** — the second person is pointed at exactly the right screen.
- Every item shows **how long it has been waiting** against the company's own SLA (on track / approaching / overdue / critical), in words and icons, not just colour.
- Stale data is labeled with its age, and if it gets old a banner appears with a Refresh button.
- Bulk uploads no longer throw away the bad rows — you get a `failed.csv` with the reason for each.
- Mobile works as a full console (card lists, same filters), not a squeezed-down desktop.
- Keyboard and screen-reader users get the same workflows (skip link, visible focus, live announcements, reduced-motion respected).

---

## User-visible changes

| Area | Change | Status |
|---|---|---|
| Dashboard | **Command Center**: six lanes (Critical, Needs Attention, Pending Approval, Failed, Overdue, Recently completed). Cards link into the exact filtered list. Per-role "can act" state. All-clear celebrate state. | ✅ |
| SLA badges | 4-band vocabulary (On track / Approaching SLA / Overdue / Critically overdue) on Command Center cards **and** the transactions ledger, with a `?sla=` filter + urgent-first sort | ✅ (unit) 🕐 (browser gates) |
| Refund journey | Two-phase: *Request refund* → visible *Awaiting approval* queue (`/transactions?refundState=AWAITING_APPROVAL`) → a different Finance Admin/Owner *Approves* or *Rejects*. Timeline shows both people. | ✅ (unit) 🕐 (browser gates) |
| Ledger | One table design across transactions/payouts/customers: search (250 ms), filter chips, sort, pagination, selection ("page scope"), bulk bar, mobile cards. All state lives in the URL. | ✅ (unit) 🕐 (browser gates) |
| Bulk CSV upload | Invalid rows are **kept** with per-row reasons; `failed.csv` download; summary with retry path. | ✅ |
| Stale data | "Updated Ns ago" ticks live; >60 s shows a stale banner with Refresh; refresh failures are shown, never hidden. | ✅ (unit) 🕐 (browser gates) |
| Conflict (two people editing) | A "data changed" dialog showing the **current** server state; you choose to retry against the reviewed version. Nothing is applied behind your back. | ✅ (unit) 🕐 (browser gates) |
| Navigation | Grouped menu (Overview / Money In / Money Out / Governance / Operations / Developer), collapsed mode, mobile More sheet, breadcrumbs, page headers with next-best-action. All 30 old links still work (redirected). | ✅ |
| Command palette | ⌘K — role-aware navigation + entity search, recent 5, safe actions only. | ✅ (unit) |
| Timeline | One entry per real state change: who, what, from→to, when, why — no duplicates. | ✅ (unit) |
| Webhooks | Copy uses the correct protocol; replay requires permission; duplicate deliveries are labeled and link the original. | ✅ |
| Blocklist | Inline add + CSV ramp, duplicate detection, reason required, actor + time recorded. | ✅ |
| Empty states | Distinct copy for "no data", "no search results", "no rows match your filters" (with a Clear filters action). | ✅ |

## Security changes

| Change | Why it matters | Status |
|---|---|---|
| **Authentication is fail-closed by default** (`AUTH_ENFORCED=strict`) | Before, missing/invalid config meant *open* access. Now it means *closed*; unauthenticated users get sign-in redirects (pages) or 401 (API). A documented `preview` bypass exists for demos only. | ✅ (unit) |
| **Export files are permission-checked** (11 endpoints, per-resource least privilege) | Before, the CSV endpoint could be fetched directly even if the page was protected. | ✅ (unit) |
| **Every money action is server-authorized** (create/retry payment, payout create/release/cancel/retry, refund request/approve) | The UI hiding a button is no longer the security control. | ✅ (unit) 🕐 (browser gates) |
| **Dual control for large refunds** (≥ IDR 10 M or ≥ 50 % of original): requester can never be the approver; both actors recorded | Prevents one person from both asking for and approving money out. | ✅ (unit) 🕐 (browser gates) |
| **No duplicate money mutations** (idempotency keys) | A double-click or retried request cannot move money twice; contradictory retries get a conflict, not a silent overwrite. | ✅ (unit) |
| **E2E test "personas" cannot widen production auth** | The test cookie is only read in dev/preview modes; in strict mode it is never read. | ✅ (unit) |

## Operational improvements

- **Exceptions are observable:** the dashboard is the exception queue (with counts, SLA age, and a deep link into the filtered list behind each card).
- **SLA telemetry:** an item crossing its deadline emits a `sla_breached` event (once per item per band) — alertable.
- **Denials are observable:** every permission denial emits `permission_denied` (permission, role, surface) — a spike means a role/permission mismatch or an attempt.
- **Conflicts are observable:** `conflict_recovered` with the version delta.
- **Freshness is observable:** `stale_seen` (age in seconds) vs `stale_refreshed` (user acted).
- **Ops runbook** covering auth failure, permission-denial spike, stale dashboard, polling failure, payout/refund conflict, idempotency conflict, webhook replay, failed bulk operation, failed CSV import, and SLA-overdue spike: **`PRODUCTION_UX_RUNBOOK.md`**.

## UX improvements

- 30-item flat menu → role-aware grouped IA (depth 4.2 → target 2.8; findability target +40 %).
- 3 payout entry points → 1 Payouts hub (bulk + settings + withdraw folded).
- No-data / no-results / filtered-empty states separated; error states offer retry.
- Mobile parity: card lists with the same URL contract as desktop.
- 250 ms search debounce; filter chips with active count and clear-one/clear-all.
- Back/forward and bookmarks now preserve the operator's exact triage view (including SLA filter).
- Amount formatting consistent (IDR masking on inputs).

## Accessibility improvements

- Contrast fixes: success token 2.5 : 1 → 5.1 : 1; new status-text tokens (pending/failed/critical/overdue) ≥ 4.5 : 1 in light **and** dark.
- SLA band never conveyed by colour alone (text label + icon + text countdown) — WCAG 1.4.1.
- Skip link, landmarks, visible 2 px focus ring, 44 px minimum targets.
- `aria-sort`, live regions for bulk/filter/toasts, dialog semantics for the palette (⌘K, Esc, focus trap).
- Reduced motion respected for animation; **data polling intentionally not disabled** by motion preference (freshness is not animation).
- Full-route automated sweep: 🕐 scheduled (touched screens verified; all-route axe sweep in the QA plan).

## Developer changes

- **`lib/sla.ts`** — single source of the SLA vocabulary (4 bands, 10 entity policies, clock-injected evaluation, locale-safe formatter).
- **`lib/analytics-events.ts`** — typed event catalog (ANA-001..014 + 9 Wave 4 operational events); PII allowlist + value redaction; the only emittable surface.
- **`server/data/handoff-store.ts` / `handoff.ts`** — cross-role handoff engine (no store imports; no cycles) + derived view over the real stores.
- **`server/data/command-center.ts`** — server-side lane aggregation with `canAct`; `lib/command-center.ts` is the shared client-safe vocabulary (cannot drift).
- **`lib/table-url-state.ts`** — URL parser/serializer (legacy aliases, malformed-safe) extended with `sla` + `refundState`.
- **`hooks/use-polling.ts`** — rewritten freshness hook (1 s age tick, hidden-tab pause, surfaced failures).
- **`server/actions/transactions.ts`** — three two-phase refund actions (actor from session, never from form).
- **`e2e/wave4/*`** — six critical gate specs + helpers + README; **`scripts/ensure-e2e-browser.mjs`** — browser bootstrap for CDN-blocked sandboxes; `playwright.config.ts` auto-wires it.
- **No new frameworks, no new vendors, no database migrations.** Legacy tables and routes are retained (coexistence), not deleted.
- CI (`.github/workflows/ci.yml`) unchanged: typecheck → lint → test → build → prisma → Playwright.

## Known limitations (honest list)

1. **Browser-level Wave 4 verification is pending.** The six Playwright gates and the full E2E inventory have not been executed anywhere yet (the authoring environments OOM on `next dev` at 4 GB RAM). Everything server/unit/component is tested; the browser gates are the remaining evidence. Procedure is exact and documented — see `WAVE_4_IMPLEMENTATION_REPORT.md` §8.
2. **Performance budgets (LCP/INP/CLS) are not yet measured** on a production build (in-sandbox build is environment-blocked: font CDN + RAM). Measurement procedure documented in `QA_HANDOFF_WAVE_5.md` §9.
3. **Data is in-memory (TEST mode)** in dev/preview by design; the Prisma-backed MCP/audit paths are the persistence seam. Real-provider behaviour is provider-gated and never mocked when a connection is configured.
4. **QuickPay drawer (the 4-field create drawer, SCR-038) is not built** — single-payment creation works via the existing dialog; the drawer is a deferred item.
5. **Analytics dashboards are not built** — events are emitted and PII-safe; the funnel dashboards are the next wave.
6. **SLA commitments are hardcoded** (same-day settlement desk values) — changeable in one place, no admin UI yet.
7. **Offline queue (retry after disconnection) is not implemented** — failures are surfaced, not queued.
8. **Pre-existing MCP security items** (rate limiting, call audit, constant-time token compare) are open and registered in `KNOWN_DEBT_REGISTER.md`.

## Upgrade / rollout notes

- No database migration; no config required. `AUTH_ENFORCED` defaults to `strict` — if you were running on the old opt-in behaviour, verify your deployment sets the intended mode explicitly.
- All old URLs keep working (308-safe redirects); shared links and bookmarks from before this release remain valid.
- Rollback is per-unit and file-scoped (see `WAVE_4_IMPLEMENTATION_REPORT.md` §15); no data-level rollback needed.

## Verification summary (executed 2026-09-12 at `b953cc9`)

Typecheck **PASS** (0 errors) · Lint **PASS** (0 errors, 40 pre-existing warnings) · Unit+component **PASS** (1075 tests / 111 files; 1 suite environment-blocked — Prisma binary download) · Playwright Wave 4 gates **PENDING EXTERNAL VERIFICATION** · Full E2E inventory **NOT_RUN** (CI is the venue) · Production build in-sandbox **BLOCKED_BY_ENVIRONMENT** (CI authoritative) · Performance **PENDING EXTERNAL VERIFICATION**.

**Release status: CONDITIONAL** — merge-ready on code quality; declare READY after the two pending verifications (exact procedures documented). See `UX_REDESIGN_FINAL_IMPLEMENTATION_REPORT.md` §22.
