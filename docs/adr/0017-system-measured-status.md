# 0017 — System: the status page states only what's measured

Date: 2026-09-02
Status: Accepted

## Context

`/system` (sidebar entry; the target of `/support`'s "View detailed status"
pointer added in ADR-0016) was the app's most fiction-dense page. It
invented an entire observability layer:

1. **Three infrastructure metric cards** — "Core API Uptime 99.99% / Avg
   latency 42ms", "Ledger DB Healthy / 15% capacity", "Webhook Queue Depth
   142 events / Est delay < 1s" — no APM, no DB telemetry, and **no queue
   exists** (QUEUES.md: *no queue initially*; the route processes inline).
   The green "All Systems Operational" pulse badge restated the fiction in
   the header.
2. **The outbound-delivery fiction, again.** A "Webhook Delivery Traffic
   (Last 24h)" chart (10 hard-coded bars) and a "Recent Webhook Deliveries"
   table (4 hard-coded rows to `api.merchant.com/wh`,
   `hooks.erp-system.net`, `hooks.legacy-app.io` with 200/503/Pending and
   retry counters) — the same merchant-delivery story ADR-0014 removed
   from `/webhooks` — while the app's *real* inbound data
   (`listWebhooks()`) sat unused.
3. **A monitoring panel with zero machinery.** Failure-rate and
   queue-depth sliders (alerting on a queue that doesn't exist),
   notification channels (`ops-alerts@kinetic.local`, `#alerts-critical`,
   "SMS — premium tier") and **Save Settings** → `e.preventDefault()` —
   no store, no action, no consumer. Real notification preferences already
   live at `/settings/notifications` (ADR-0009).
4. **Dead affordances.** Four per-row "Inspect" buttons without handlers,
   an uncontrolled "Search event ID" input, and two `href="#"` links
   ("View Full Webhook Log", "Go to Developer Portal").

## Decision

The page states only what the app measures — **inbound webhook flow** —
and says plainly what it can't measure:

**1. A `getSystemWebhookSummary()` store helper** (`server/data/webhooks.ts`):
last-24h counts by outcome (received / duplicated / rejected + total),
the five most recent callbacks (newest first), and the newest
`receivedAt`. The seeds are already now-relative offsets
(`Date.now() − …`), so window membership is deterministic regardless of
run time: `whk_seed_1` (2h) and `whk_seed_2` (1h59m) inside, `whk_seed_3`
(27h) outside — no seed change was needed.

**2. Three 24h count cards** (the pill colour language: received =
success, duplicated = pending, rejected = failed), each with the
semantics the merchant needs ("verified and stored", "idempotent no-ops",
"refused — raw body kept").

**3. A "Most recent callbacks" list** — status pill, type, event id,
relative time — each row a link to `/webhooks/[id]`, with "View full log"
→ `/webhooks`.

**4. A "What this page measures" card** that is itself the documentation:
inbound flow — measured; uptime/latency/DB — **not measured, no APM,
refuses to print invented numbers**; queue depth — **zero by design**
(inline processing; a queue is QUEUES.md's next rung). Doors out to
`/settings/developer` (endpoint & token) and `/settings/notifications`
(the real notification settings).

**5. A header chip with a measurable claim**: "Last callback: 2h ago"
(from the newest log row) — replacing "All Systems Operational".

**6. Removed outright**: the three metric cards, the 24h delivery chart,
the delivery table (+ dead search + Inspect buttons), the Monitoring
Settings panel (`system-form.tsx` deleted — its Save was a no-op), and the
Pro Tip card ("custom webhook retry schedules in the Developer Portal" —
invented; its `href="#"` is the developer page's job, now covered by link
4). `metadata` added.

## Consequences

- `/support`'s pointer ("platform health is monitored on the System Status
  page — live from the app, not a static banner") is now literally true.
- The app has one story about webhooks everywhere: inbound, logged,
  deduped — `/webhooks`, `/settings/developer` and `/system` all read the
  same store.
- The only "monitoring settings" are the real ones: notification
  preferences (ADR-0009) and developer toggles (ADR-0015).
- `e2e/uat-journeys.spec.ts` F4 asserted the old title ("System Health");
  it was already stale before this pass and joins the known C4/D5/K2/F4
  rewrite owed to a later small fix.

## Alternatives considered

- *Keep metric cards with "—" placeholders.* Rejected: cards with no
  values are layout for a future APM; the measures-card states the same
  thing in words and is honest without the scaffolding.
- *Derive a synthetic "operational" status from the log (e.g. no rejections
  in 24h ⇒ healthy).* Rejected: that would re-invent a health model the
  app's operators never defined; counts are the claim, health is an
  interpretation.
- *Move the 24h window to a URL param (`?window=24h|7d`).* Rejected: one
  honest window is enough until there's a real time series to query.

## Verification

- **Unit** — `src/server/data/webhooks.test.ts` gains "getSystemWebhookSummary"
  (3): deterministic 24h counts `{2, 1, 1, 0}`, five recent rows with
  `whk_seed_2` newest, and a live rejection appearing in both views.
- **Gate** — `pnpm typecheck` clean; `pnpm lint` 0 errors; vitest green.
- **SSR (dev server, 2026-09-02)** — `/en/system` renders the three count
  cards (1/1/0), the "Last callback 2h ago" chip, five recent rows and all
  four real links; none of the 16 removed strings present; zero
  `href="#"`.
- **E2E** — `e2e/system.spec.ts` (4): the 16 invented strings + dead links
  absent, the 24h cards + header chip, recent row → `/webhooks/whk_seed_2`
  detail (duplicate note), all four link destinations. Runs in CI
  (Playwright browser not installable in this sandbox).
- Manual procedure: `docs/audit/system-test-procedure-2026-09-02.md`.
