# QA Handoff — Wave 5 (Verification of Wave 0–4)

> **For:** QA engineer.
> **What you are verifying (not building):** the Wave 0–4 redesign. Code is at `b953cc9` (or later on `main`). Unit/component evidence already exists (1075 tests green at that commit) — your job is the **browser-level, human-level, and performance evidence** that unit tests cannot produce.
> **Golden rule:** report what you observed. A gate that cannot be executed in your environment is **BLOCKED_BY_ENVIRONMENT (reason)**, never a guess.

---

## 1. Critical journeys (verify in priority order)

### P0 — safety (must all pass before any "READY" claim)

| # | Journey | Steps | Expected (assert precisely) |
|---|---|---|---|
| C1 | **Auth fail-closed** | 1. Fresh browser, no cookies. 2. `GET /en/dashboard` directly. 3. `GET /api/exports/transactions` directly. 4. Sign in as demo org. | 1→2: **302 → /sign-in**, no data in the response. 3: **401 JSON**, no CSV. 4: lands on `/en/dashboard`, menu shows the role's items. No console errors. |
| C2 | **Refund dual-control, full** | Personas: `agus` (SUPPORT) requests a refund on a SUCCEEDED payment ≥ IDR 10 M (or > 50 %) with a reason → `hendri` (FINANCE_ADMIN) opens the same transaction → Approves. | agus: success toast "Refund requested — it now needs a second approval…"; detail shows **AWAITING_APPROVAL**; queue `/en/transactions?refundState=AWAITING_APPROVAL` lists it with the "Refund: Awaiting approval" chip. **No money moves on request** (balance unchanged). hendri: Approve → toast; APPROVED pill. **Timeline shows both actors:** "requested by persona_agus … approved by persona_hendri · dual control satisfied". |
| C3 | **Same-actor approval blocked** | as `agus`, on the transaction *you* requested. | The decision panel does **not** offer Approve (copy explains a different approver is required). If any path is reachable, the server must refuse with "Requester cannot be the approver" — test by driving the action directly (DevTools/FormData) and expect the denial. |
| C4 | **Permission denial through the real UI** | `nadia` (ANALYST): open a FAILED payment → click the **visible** Retry control. | Toast: server denial ("You don't have permission to retry payments"). Row state unchanged. The refund trigger on a SUCCEEDED row is **disabled with a reason** ("Requires refund permission") and opens no dialog. |
| C5 | **409 conflict recovery** | Two tabs, same FAILED payment. Tab A: Retry (succeeds → status moves). Tab B (stale): Retry. | Tab B: **ConflictDialog** opens showing the *latest* state (status PROCESSING — not the FAILED it rendered). B dismisses → view syncs. B re-opens detail → Retry → success. Exactly **one** refused call (check network). No silent overwrite at any point. |
| C6 | **Idempotent retry** | Retry a FAILED payment; immediately resubmit the same logical retry (before state settles, e.g. fast double-action or manual re-send). | Second attempt is a replay (same result) or a version conflict — **never** a second mutation. Ledger shows one retry event. |
| C7 | **Export guard** | Unauthenticated: `GET /api/exports/audit`. `sari` (RISK) on `/api/exports/audit` (allowed) vs a role without `audit.read`. | 401 / 200 / 403 respectively. The 403 body contains no CSV data. |

### P0 — SLA contract

| # | Journey | Steps | Expected |
|---|---|---|---|
| C8 | **SLA filter → detail → back** | `/en/transactions?sla=OVERDUE` → verify chip "SLA: Overdue" + overdue badges → open a row → **browser back**. | Back restores the **same URL + chip + rows**. Hard reload of the URL shows the same slice (shareability). Sort by SLA puts CRITICAL first. |
| C9 | **SLA badge vocabulary** | Compare a `transaction_settlement` item in the ledger vs the same item in a Command Center lane. | Same band label, same countdown style ("3h left"/"2d overdue"), text + icon (never colour-only). Band text ≥ 4.5 : 1 contrast in both themes. |
| C10 | **SLA clock honesty** | Load `/en/transactions?sla=APPROACHING`, leave the tab open. | Badges age correctly over real time (e.g. an item at 74 % crosses to OVERDUE at the window boundary). Refresh does not reset the clock (it's derived from backend timestamps). |

### P0 — freshness

| # | Journey | Steps | Expected |
|---|---|---|---|
| C11 | **Age ticks without fetch** | Dashboard, watch "Updated Ns ago", network tab open. | Age increments every 1 s with **no** request. Polls occur at ~20 s cadence, never overlapping. |
| C12 | **Stale trip + recovery** | Wait past 60 s (or throttle the endpoint). | Stale banner appears with the age. **Refresh** → age resets to ~0, banner clears. If the refresh **fails** (throttle/offline): error is visible, age keeps growing, data not blanked. |
| C13 | **Hidden tab pause** | Background the tab 2 min, return. | No accumulated burst of polls on return; one refresh shortly after visibility. |

### P1 — data operations & state

| # | Journey | Steps | Expected |
|---|---|---|---|
| C14 | **URL state round-trip** | `/en/transactions`: search "acme" → status=FAILED → sort amount desc → page 2 → copy URL → open in incognito (same persona) → reload. | Identical view (rows, chips, sort, page). Back/forward replay the states. `?page` resets when a filter changes. |
| C15 | **Empty-state taxonomy** | (a) no data at all; (b) search with no results; (c) filter combo matching nothing. | Three distinct copies: "No transactions yet" + create CTA / "No results for …" / "No transactions match these filters" + **Clear filters** (not a create CTA). |
| C16 | **Bulk selection scope** | Select rows on page 1, go to page 2. | Selection label says **page scope**; bulk bar shows the selected count; selection does not silently carry across pages. |
| C17 | **CSV import partial failure** | Upload a payout CSV: 2 valid + 1 bad amount. | Preview splits valid/invalid with reasons. Submit → "2 created, 1 skipped" style summary → **failed.csv** downloads with `line,raw,reason` preserving the original columns. Valid rows processed once. |
| C18 | **Filtered export** | Apply a filter (e.g. status=FAILED) → Export. | The CSV matches the *visible* slice (what you see is what you export); the request carries the filter params; still permission-guarded. |

### P1 — cross-role & governance

| # | Journey | Steps | Expected |
|---|---|---|---|
| C19 | **Handoff no dead-ends** | As `agus`, request a refund → as a role that can *see* but not act (e.g. `sari`) open the dashboard. | The pending-approval lane is visible; the card shows "waiting on …" (not a button); as `hendri` the same card is actionable. `nextStepFor` semantics: every open handoff has either an action or a named escalation. |
| C20 | **Blocklist governance** | Add an entry inline (reason required); CSV-ramp 5 entries with 1 duplicate of an existing entry. | Inline: chip + audit (actor, reason, time). CSV: duplicate rejected with reason; non-duplicates added; the audit trail is complete. |
| C21 | **Webhook replay permission** | As `bima` (DEVELOPER) replay a delivery; as a role without `webhook.replay`, attempt it. | bima: replay recorded with provenance (original vs replay). Other role: denied server-side; audit shows the attempt. |
| C22 | **Command Center consistency** | Count items in each lane vs the linked filtered list (`/payouts?status=FAILED` etc.). | Count on the card == rows in the linked list (same query). `totals.exceptions` does not double-count `overdue` (verify the sum on the page). |

---

## 2. Personas (spec §3 — the harness only, production stays strict)

| Persona | Role | Use for |
|---|---|---|
| `rina` | OWNER | everything (full permissions) |
| `dinda` | FINANCE_OPERATOR | money-in, payout create, refund *prepare* |
| `hendri` | FINANCE_ADMIN | payout release/cancel/retry, refund *execute* (the second actor) |
| `agus` | SUPPORT | refund *prepare* (Role A in C2), customer read |
| `sari` | RISK_ANALYST | audit read, blocklist, risk |
| `bima` | DEVELOPER | webhooks/keys (C21) |
| `nadia` | ANALYST | restricted-persona negative cases (C4) — no money perms |
| `lukman` | COMPLIANCE_ANALYST | KYC |

**Test data assumptions:**
- Dev server seeds a **deterministic in-memory ledger** (TEST mode) — transactions exist in all relevant states (SUCCEEDED, FAILED, PROCESSING, REFUNDED; refund states incl. AWAITING_APPROVAL; payouts PENDING/PARTIAL/FAILED; KYC PENDING_REVIEW).
- The gates **mutate** the shared ledger (refund requests, retries) — run e2e with `workers: 1`; after a green pass, a re-run picks fresh eligible rows dynamically (`helpers.ts`). If a gate can't find its fixture, restart the dev server (fresh seed) — that is a setup fact, not a failure.
- No database needed for the app suite; no real provider connection (in-memory fallback). Provider-connected paths are unit-covered; do not claim provider E2E.
- Amounts for dual-control tests: pick a SUCCEEDED payment ≥ IDR 10 M or > 50 % of original — walk the ledger for one (the dynamic fixture pattern) instead of hardcoding.

## 3. Running the automated gates (evidence you must produce)

```bash
git checkout <release-branch> && pnpm install --frozen-lockfile
cd apps/web
npx playwright install chromium          # normal machines
# CDN-blocked sandboxes: node ../../scripts/ensure-e2e-browser.mjs first

# The six Wave 4 gates (the release gate):
npx playwright test e2e/wave4 --project=chromium

# Full regression inventory (~224 tests, 30 specs):
npx playwright test
```

- Warm cold routes first (the plan's tip): `/`, `/en/dashboard`, `/en/transactions`, `/en/transactions?sla=OVERDUE`, `/en/transactions?status=FAILED`, `/en/transactions?refundState=AWAITING_APPROVAL`, one detail page.
- Record: pass/fail per spec, duration, any `test-results/` artifacts. **Paste the raw tail of the run** into the release evidence — not a paraphrase.
- If the host OOMs (4 GB-class): that is BLOCKED_BY_ENVIRONMENT (reason + dmesg/`Killed` evidence); re-run on ≥ 8 GB or in CI. Do not lower test budgets to force a green.

## 4. Manual regression (beyond the automated suites)

1. **Navigation:** all 5 sections collapse/expand; More sheet on mobile; every item opens; breadcrumbs correct on 2-level routes; ⌘K finds a route, opens it, and never lists a route the persona can't access.
2. **Alias safety:** paste 10 legacy URLs from before the redesign (e.g. `/payouts/bulk`, `/payments/platform`, old report URLs) — each lands on its canonical screen with state preserved.
3. **Detail→back** on every list (transactions, payouts, customers, blocklist, webhooks) — filters/sort/page survive.
4. **Dual locale:** repeat C2 and C8 on `/id/…` (default locale) — same behaviour; dates/numbers formatted `id-ID`; no mixed-language copy.
5. **Theme:** light + dark across SLA badges, stale banner, conflict dialog, command center.
6. **Toasts:** success/error/partial (bulk) — stack ≤ 3, error toasts persist, partial offers View/Download failed.csv.
7. **Error boundary:** kill the dev server mid-session → navigate → the error screen offers retry (no white screen, no silent data).
8. **Not-found:** a garbage URL → in-shell 404 with alias suggestions.

## 5. Mobile cases (390 × 844 primary; also 360 and 430)

- M1: ledger as **cards** (identity + status + SLA badge + amount + action) — no horizontal scroll, no squeezed table.
- M2: filter sheet: open, change SLA, close → chip on the URL; change status → chip; Clear all.
- M3: detail → back restores the filtered view (the mobile leg of C8).
- M4: bottom nav: active state on child routes (e.g. `/transactions/txn_…` highlights Transactions); More sheet lists grouped items; 44 px touch targets throughout (measure the refund trigger and row actions).
- M5: bulk bar wraps and stays reachable with the keyboard; CSV import flow completes end-to-end.
- M6: Command Center on mobile: lanes stack, cards tappable, "waiting on …" copy present where not actionable.

## 6. Keyboard cases

- K1: full C2 with keyboard only (no mouse): sign in → find the payment (⌘K or `/` search) → Request refund → Approve in a second persona.
- K2: ⌘K: open, fuzzy search, arrow nav, Enter, Esc (focus returns to the trigger); palette lists only permitted + safe items.
- K3: table: header sort with arrows (aria-sort updates), row focus → Enter opens detail, Esc/back restores.
- K4: dialogs (refund, conflict, confirm): focus is trapped; Esc closes and returns focus to the trigger; type-to-confirm still works.
- K5: filter sheet: Esc closes, focus returns; chips individually focusable with "Clear filter X" semantics.
- K6: skip link: Tab from a fresh load lands on "Skip to main content"; Enter jumps to main.

## 7. Accessibility checks

- A1: contrast sweep on the new tokens (`--pending-text`, `--failed-text`, `--critical-text`, `--overdue-text`, `--sla-*`) in light + dark — ≥ 4.5 : 1 for text (tool: browser devtools or axe).
- A2: SLA badge = label + icon + text countdown; test with colour-vision emulation (deuteranopia) — bands still distinguishable.
- A3: screen reader (VoiceOver/NVDA): command center lane announcements, stale banner (live), conflict dialog (dialog role, latest-state contents), refund decision panel (who requested, who must decide).
- A4: reduced motion ON: animations gone, **polling still runs**, age still ticks, stale still trips (this is the Wave 4 regression to protect).
- A5: full-route **axe-core sweep** (all routes, both locales, both themes) — the one a11y item still "touched screens only"; file violations to `docs/QA_ISSUES.md`.
- A6: 44 px minimum target audit (row actions, chips, pagination, banner Refresh).

## 8. Performance checks (procedure = the missing evidence)

On a **production build** (`next build` + `next start`) on a normal host (the in-sandbox build is environment-blocked; CI can also produce the bundle):

- P1: **LCP** on `/en/dashboard` and `/en/transactions?sla=OVERDUE` — budget **< 2.5 s** (median of 5 runs, throttled 4G profile or real network; record both).
- P2: **INP** — interact (sort, filter, search, open detail) — budget **< 200 ms**.
- P3: **CLS** — load each page, median of 5 — budget **≤ 0.1**, target **≤ 0.05** on the table routes (web-vitals via CDP: `Performance.getMetrics` LayoutShift, or `npx playwright test` with a metrics hook — a small evidence script is acceptable as a *test helper*, not a product change).
- P4: **Polling cadence** — network tab / CDP over 90 s on the dashboard: expect ~4–5 polls, zero overlap, zero polls while the tab is hidden.
- P5: **Bundle** — `next build` output: record the dashboard + transactions chunk sizes; confirm the cmdk palette is **not** in the SSR chunk (dynamic import).
- P6: **Hero 3D decision input** — the dashboard LCP result decides the spec-sanctioned hero replacement (LCP > 2.5 s → replace with placeholder; otherwise keep). Record the decision.
- Report all six with raw numbers + environment (host, network, build sha). Anything over budget → FAIL with the number, not a trend word.

## 9. Known environment limitations (so you don't chase ghosts)

1. **4 GB-class hosts OOM** `next dev`/`next build` during heavy route compilation (kernel `oom-kill`, no swap) — use ≥ 8 GB or CI. This is the reason the Wave 4 gates are PENDING, not a defect.
2. **`fonts.googleapis.com` blocked** in the authoring sandboxes → `next/font` falls back with a console warning (not a failure). In `next build` the font fetch fails harder (that's what blocked the in-sandbox build); normal hosts are unaffected. `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` expects a **mocked-responses JSON file** — `=1` is an invalid value (it causes a non-fatal font-loader error).
3. **`cdn.playwright.dev` blocked** in the sandboxes → use `node scripts/ensure-e2e-browser.mjs` (extracts Chromium from the npm tarball; config auto-wires it and narrows to the chromium project).
4. **`binaries.prisma.sh` blocked** → `prisma generate` fails → `src/server/mcp/server.integration.test.ts` cannot run in-sandbox (it does in CI).
5. **In-memory ledger resets on server restart** — a mid-run server death loses the seeded state (fresh seed on restart); e2e fixtures are picked dynamically to absorb this.
6. **Dev-server first-compile latency** — cold route compiles take 10–45 s inside the request; the Playwright budgets absorb it, but warm the routes for a clean run.
7. **TEST mode everywhere** — no real money, no real provider; provider-connected behaviour is unit evidence only.

## 10. What "done" looks like for this handoff

- [ ] Six Wave 4 gates: raw run output pasted into `WAVE_4_IMPLEMENTATION_REPORT.md` §8 (PASS, or FAIL/BLOCKED with evidence).
- [ ] Full E2E inventory run: totals + failure triage (`docs/QA_ISSUES.md`).
- [ ] P0 journeys C1–C13 manually confirmed (or the e2e equivalents).
- [ ] Mobile M1–M6, keyboard K1–K6, a11y A1–A6.
- [ ] Performance P1–P6 with raw numbers.
- [ ] `UX_REDESIGN_FINAL_IMPLEMENTATION_REPORT.md` §22 updated: PENDING/NOT_RUN rows replaced by executed results; READY promoted **only** per its two conditions.
