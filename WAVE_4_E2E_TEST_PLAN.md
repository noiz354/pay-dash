# Wave 4 — E2E Critical Gate Tests (Playwright)

> **Status: specs authored, execution delegated to the developer environment.**
> All six gate specs, the sandbox browser bootstrap, and the config wiring are
> on `arena/01a09497-pay-dash` (PR #9). The authoring sandbox could not hold a
> dev server stable for the full run (Google-Fonts fetch retries + heavy
> first-visit compiles — details in §7), so the *execution* step below is meant
> to run on a normal development machine. Nothing in this plan requires any
> network beyond `registry.npmjs.org` + `localhost`.

These are the six browser-level gates the Wave 4 checklist calls for (scope
item 9). They drive the **real UI** — no API workarounds — against `next dev`
with the persona harness, so a test can become two different actors and prove
the journeys end-to-end:

| # | Spec file | Gate (Wave 4 checklist) |
|---|---|---|
| 1 | `refund-handoff.spec.ts` | **Cross-role handoff (JRN-003)** — Role A requests → dual-control queue → Role B approves → dual-actor timeline |
| 2 | `sla-filter-back-restore.spec.ts` | **SLA contract** — `?sla=` filter → detail → **back** restores the filtered view (chip + rows) |
| 3 | `permissions.spec.ts` | **Restricted persona** — server denies a protected action through the real UI; trigger disabled with its reason |
| 4 | `freshness-stale.spec.ts` | **Stale → refresh** — age ticks without a fetch, manual refresh resets it, >60s raises the banner, refresh clears it |
| 5 | `conflict-recovery.spec.ts` | **409 → review latest → retry** — a real two-tab race, ConflictDialog shows the latest server state, nothing auto-applies |
| 6 | `mobile-journey.spec.ts` | **Mobile 390px** — cards with SLA badges → filter sheet → chip → detail → back restores state |

Spec location: `apps/web/e2e/wave4/` (shared helpers in `helpers.ts`, short
pointer README inside the folder).

---

## 1. Prerequisites

```bash
git checkout arena/01a09497-pay-dash
pnpm install --frozen-lockfile        # repo root
```

No database is needed — the app runs on its deterministic in-memory ledger in
dev. No real login is needed — see §5 (persona harness).

## 2. Running

```bash
cd apps/web

# Every gate, Chromium only (recommended first run):
npx playwright test e2e/wave4 --project=chromium

# A single gate:
npx playwright test e2e/wave4/refund-handoff.spec.ts --project=chromium

# Headed / debug:
npx playwright test e2e/wave4 --project=chromium --headed
npx playwright test e2e/wave4 --project=chromium --debug
```

`playwright.config.ts` starts the dev server itself (`webServer`, with
`AUTH_ENFORCED=off`), or reuses one already listening on `localhost:3000`.

> **Warm-up tip (dev server):** the first hit on each route triggers an
> on-demand compile (tens of seconds on a cold cache). If you see navigation
> timeouts, warm the routes once in a browser or with curl — `/`,
> `/en/dashboard`, `/en/transactions`, `/en/transactions?sla=OVERDUE`,
> `/en/transactions?status=FAILED`, `/en/transactions?status=SUCCEEDED`,
> `/en/transactions?refundState=AWAITING_APPROVAL`, and one
> `/en/transactions/txn_…` detail — then re-run. Config budgets already absorb
> slow first visits (120s test / 90s navigation), so on a warm server this is
> rarely needed.

## 3. Running where `cdn.playwright.dev` is unreachable

`scripts/ensure-e2e-browser.mjs` resolves a Chromium binary in this order:

1. `PW_EXECUTABLE_PATH` (explicit override),
2. the standard Playwright cache (`~/.cache/ms-playwright/chromium-*`),
3. an already-extracted `/tmp/chromium`,
4. **bootstrap**: extracts Chromium **from the `@sparticuz/chromium` npm
   tarball** (only `registry.npmjs.org` needed) into `/tmp/chromium`, plus its
   bundled NSS/nspr libs into `/tmp/al2023-libs/lib`.

```bash
node scripts/ensure-e2e-browser.mjs     # one-time per machine/session
cd apps/web && npx playwright test e2e/wave4
```

When `/tmp/chromium` exists the config automatically narrows the projects to
`chromium` (the tarball ships one engine) and wires `launchOptions`
(`executablePath`, `--no-sandbox`, `LD_LIBRARY_PATH`). Verified working:
Chromium 153 (dev channel) driving the app end-to-end. In normal environments
the script is a no-op and all five default projects remain available.

## 4. What each gate proves (and its pass criteria)

### Gate 1 — `refund-handoff.spec.ts` (JRN-003, the headline journey)

**Journey:** agus (*SUPPORT*, `refund.prepare`) opens a SUCCEEDED payment →
*Request refund* → dialog (amount + reason) → success toast. The detail now
shows `AWAITING_APPROVAL`, the decision panel names `persona_agus` as requester
and tells them a different approver must decide (BE-002 mirrored as copy).
The shareable queue `/en/transactions?refundState=AWAITING_APPROVAL` lists the
transaction with its chip. hendri (*FINANCE_ADMIN*, `refund.execute`) opens the
same transaction → *Approve refund* → success toast → `APPROVED` pill. The
timeline records both actors: `requested by persona_agus … approved by
persona_hendri · dual control satisfied`.

**Pass =** the whole state machine driven by two different humans through UI
controls only; both actors auditable on the canonical timeline.

### Gate 2 — `sla-filter-back-restore.spec.ts` (SLA URL contract)

**Journey:** open `/en/transactions?sla=OVERDUE` → chip `SLA: Overdue` +
overdue badges visible → click into a detail → **browser back**.

**Pass =** back lands on the filtered URL, the chip and rows are restored
(the operator's triage state survives navigation), and a hard reload of the
same URL shows the same slice (shareability).

### Gate 3 — `permissions.spec.ts` (restricted persona)

**Journeys:** nadia (*ANALYST* — no `money_in.create`, no refund permission):

1. clicks the visible *Retry payment* control on a FAILED payment → the
   **server** answers "You don't have permission to retry payments." (toast).
   The backend remains the enforcement point; a hidden button would prove
   nothing.
2. sees the *Request refund* trigger `aria-disabled` with the explaining
   title "Requires refund permission", and no dialog is reachable from it.

**Pass =** denial comes from the server through the real UI; the UI never
offers a reachable protected control to a persona lacking the permission.

### Gate 4 — `freshness-stale.spec.ts` (stale → refresh)

**Journeys:** on the dashboard Command Center:

1. the freshness line ticks (`Updated Ns ago`) **without any fetch** (the 1s
   age tick), and the *Refresh* button resets the age to ~0;
2. genuinely waiting past the 60s threshold raises the stale banner
   ("Data may be outdated…"), and the banner's *Refresh data* clears it back
   to a fresh age.

**Pass =** freshness is real, not decorative — the threshold trips on its own
and the manual refresh recovers it.

### Gate 5 — `conflict-recovery.spec.ts` (409 → review → retry)

**Journey (a real race, two tabs):** both tabs render the same FAILED payment.
Tab A retries successfully (server-side `updatedAt` moves). Tab B — still on
the stale version — retries and is refused: the **ConflictDialog** opens with
the server's latest state (status now `PROCESSING`, not the `FAILED` tab B
rendered — the review shows real information). Only then does tab B click
*Retry with Latest*, which re-sends against the reviewed version and succeeds.

**Pass =** the mutation is never blind-applied; exactly one refused call, an
explicit review, then a versioned retry that recovers (and emits
`conflict_recovered`).

### Gate 6 — `mobile-journey.spec.ts` (390px)

**Journey:** 390×844 viewport → `/en/transactions?sla=OVERDUE` renders as
**cards** with overdue badges → open the filter sheet → switch the SLA select
to CRITICAL → close → chip updates to "Critically overdue" on the URL → open a
card's detail → **back** restores the filtered view.

**Pass =** the whole triage loop is usable at 390px and rides the same URL
contract as desktop.

## 5. Environment contract (what the tests rely on)

- **Personas, not logins.** `e2e/test-utils.ts::loginAs(page, persona)` sets
  the `paydash_persona` cookie, honoured **only** when `AUTH_ENFORCED` is
  `off`/`preview` (the config's `webServer.env` sets `off`). In `strict`
  (production default) the cookie is never read — the harness widens nothing.
  Persona → role: agus=SUPPORT, hendri=FINANCE_ADMIN, nadia=ANALYST,
  rina=OWNER (spec §3).
- **Dynamic fixtures.** The dev ledger is seeded deterministically but the
  gates mutate it (refund requests, retries), so specs walk the filtered
  ledger and take the first row matching the needed UI state
  (`helpers.ts::findTransaction`). Gates run `workers: 1` (config) so the
  picks stay deterministic; re-running after a green pass may need fresh rows
  for gates 1/5 — restart the dev server (or just re-run; gate 1 refuses a
  second request on the same row by design, and the specs pick the first
  *eligible* row).
- **Toasts are the action feedback** — assertions wait on
  `[data-sonner-toast]` text (`expectToast`), never on arbitrary sleeps.
- **Time budgets.** 120s per test, 90s navigation, 15s expect — sized for
  `next dev` on-demand compilation, not for production latency.
- **Fonts.** `next/font/google` falls back gracefully when
  `fonts.googleapis.com` is unreachable (a console warning, not a failure).

## 6. Mapping back to the Wave 4 gate checklist

| Checklist item | Proven by |
|---|---|
| Cross-role handoff (Role A → handoff → Role B → completion) | Gate 1 |
| SLA contract (badge, filter, URL, back/refresh/share) | Gate 2 (+ component/URL unit suites) |
| Restricted persona cannot reach protected actions | Gate 3 |
| Stale → refresh | Gate 4 |
| 409 → review latest → retry | Gate 5 |
| Mobile 390px journey | Gate 6 |

A full green run here — together with the already-green typecheck, lint,
unit/component suites (1075 passing) — closes Wave 4 scope items 3 and 9,
leaving performance verification (item 8) and
`WAVE_4_IMPLEMENTATION_REPORT.md` before the final gate checklist.

## 7. Why execution was delegated (authoring-sandbox notes)

The authoring sandbox could not keep `next dev` stable for a full run:

- `fonts.googleapis.com` is unreachable → `next/font` retries each fetch 3×
  with TLS resets before falling back (per compile, per route);
- every cold route compiles on demand (dashboard ≈ 45s, ledger ≈ 12s of
  compile inside the request), so unwarmed runs blew even the generous
  budgets;
- after one heavy pass the dev server process exited mid-run
  (`next dev` 15.5.24, webpack), failing the remaining specs at `page.goto`.

Mitigations that *are* in place (config budgets, the warm-up tip, the font
fallback) make this a dev-server-ops nuisance rather than a spec problem — on
a normal machine with a warm `.next` cache and reachable fonts, `pnpm
test:e2e -- e2e/wave4 --project=chromium` is the whole procedure. If the font
noise is unwanted even locally, `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=1` in the
dev-server env silences the fetch entirely.
