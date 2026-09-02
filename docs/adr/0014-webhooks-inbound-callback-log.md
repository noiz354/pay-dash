# 0014 — Webhooks: the log of callbacks the app actually receives

Date: 2026-09-02
Status: Accepted

## Context

`/webhooks` ("Webhook Logs") shipped the prototype in full: four hard-coded
rows, a search box with no state, two uncontrolled selects, a Refresh button
with no handler, "Showing 1 to 4 of 1,024 results" with no page 2, and rows
with chevrons that go nowhere. Worse, the fiction it told was inverted. The
rows described the gateway *delivering* events to a merchant URL
(`api.merchant.com/webhooks/stripe`, HTTP 200/500, "24ms" latency) — but
INTEGRATION.md §7 is explicit about the direction of webhooks in this app:
"you *receive* webhooks (§7); no log-fetch API" (:99) and the screen "should
surface these received events + their delivery status" (:307) — i.e. what
**the app did with each inbound callback**.

And the app had never recorded a single callback. The receiving route
(`/api/webhooks/xendit`, ADR-0003 Phase 2) verifies the
`x-callback-token`, parses, dedupes, answers 200 fast — and then
`processWebhookAsync` throws the event away into a TODO stub. The only trace
was an anonymous 1,000-entry `webhookSeen` set: no types, no timestamps, no
payloads, no reasons. There was no `WebhookEvent` store and no prisma table
for it.

What the app genuinely knew, all along: the configured endpoint, whether
`XENDIT_WEBHOOK_TOKEN` is set (presence, never value), the retry policy and
IP allowlist already persisted on `/settings/developer` (ADR-0009), and the
event vocabulary its handler switches on.

## Decision

**1. A callback log the endpoint writes.** `server/data/webhooks.ts` — an
in-memory store (`__kineticWebhooksStore`, the ADR-0011/0013 pattern) of
`WebhookEvent { id, eventId, type, receivedAt, source, status, reason,
unhandled, payload }`, seeded with seven callbacks inside the ledger window:
the two money events reference *real* seeded ledger rows
(`payment.succeeded` → a SUCCEEDED `referenceId`, `refund.succeeded` → a
REFUNDED one — ARCHITECTURE.md:42 traceability), one is a provider retry of
the first, one is an unknown type flagged unhandled, two are the endpoint's
refusal paths (invalid token, invalid JSON) with their reasons.

**2. Status is a fact of receive-time, stored — not derived.** A log row is
immutable history, not a mutable entity state: `RECEIVED` (verified, stored,
queued), `DUPLICATED` (the provider retried an event id we already held —
the idempotency no-op, logged so it is *visible*), `REJECTED` (refused at
the endpoint, with the reason). This is the one deliberate departure from
the app's derive-everything rule, and it is why links and balance derive
their status while log rows do not.

**3. The route persists before it answers.** `recordInbound` /
`rejectInbound` are the single persistence seam: the route logs REJECTED
rows for 401/400/422 (with the raw body, which is how you debug a bad
callback) and RECEIVED/DUPLICATED rows for 200s — dedupe by `eventId`, the
QUEUES.md verification step ("replay webhook twice → second is deduped")
now holds *and is observable*. The anonymous `webhookSeen` set is gone. The
route's public contract — 401/400/422/200, `{received, event}` /
`{received, deduped}`, 200-fast, GET probe — is byte-identical. Ledger
processing stays a documented TODO (QUEUES.md: queue → worker → idempotent
ledger update is the next phase, not this pass).

**4. TEST MODE stands in for the provider.** `simulateWebhookAction`
(`?simulate=1` dialog: event type incl. a deliberately-unknown
`invoice.issued`, optional ledger reference) and `replayWebhookAction`
(detail page: re-POST the same event id) both run `recordInbound` — the
same dedupe + unhandled logic as the route; only the token-auth step is
skipped, the same relationship as simulate-payment skipping channel capture
(ADR-0013). A replay lands as a visible DUPLICATED row: the idempotency
guarantee, demonstrated.

**5. The page states what the app knows.** Config card: the endpoint URL as
this deployment serves it (from `headers().host`, copyable), token
**configured or not** (value never rendered), the handled event types, and a
link to `/settings/developer` for the retry policy / IP allowlist (we link
out, not duplicate controls). The log itself: URL filters (`?q` over event
id/type/payload, `?status`, `?type` with `unknown` as the unhandled bucket),
real pagination (10/page, `TablePagination`), `ClickableRow`s to
`/webhooks/[id]`, both empty states (the honest one: "No webhook callbacks
yet — simulate one, or POST with your token"), `loading.tsx`, and a detail
page (event id + status pill, payload JSON with copy — or the raw body for
rejections, and a status note explaining what each outcome means and what
the provider will do next). The `bg-white` literals and the
outbound-delivery columns are gone.

**6. The setup step says what the page does.** "Enable Webhooks — Receive
payment events on your endpoint in real time" (gateway→merchant direction)
is retitled **"Monitor Webhooks"** with a description matching the page:
track the callbacks arriving at `/api/webhooks/xendit`, simulate them in
TEST MODE.

## Consequences

- The log can never disagree with the endpoint: every POST — accepted,
  deduped or refused — leaves a row, and the dedupe key (`eventId`) is the
  same one the route uses, so a simulated or replayed retry of a real event
  is still recognised as a duplicate.
- Rejected callbacks keep their raw body, making bad tokens and malformed
  payloads debuggable from the dashboard instead of a server log.
- `processWebhookAsync` remains a no-op switch: a `payment.succeeded`
  callback is *stored*, not yet *processed* into the ledger. The log pass
  deliberately stops at persistence — wiring the worker is QUEUES.md's
  next rung and would be a separate ADR.
- One more in-memory store; a restart resets the log (same as every other
  store in the app; production persistence is the prisma `WebhookEvent`
  table already named in the route's original TODO).

## Alternatives considered

- *Keep the outbound-delivery model (Target URL / 200-500 / latency).*
  Rejected: this app never delivers webhooks; INTEGRATION.md §7/:307 fixes
  the direction. Keeping the columns would mean keeping the fiction.
- *Derive callback status from somewhere.* There is nothing to derive from
  — a callback's outcome is decided at receive-time and never changes;
  storing it is the honest model for an append-only log.
- *Persist to Postgres/Prisma.* Rejected for this pass: the prisma client
  is stubbed in this environment, every other store is in-memory with a
  documented production path, and the route's own TODO already names the
  table (`webhookEvent.create`).
- *Inline row expansion instead of a detail route.* Rejected: every other
  table in the app (transactions, payouts, billing, balance, links) routes
  rows to a detail page; consistency wins for a payload that needs room.
- *Make the simulator POST over real HTTP to the route.* Rejected: the
  action and the route share `recordInbound`, which is the pipeline that
  matters; an in-process call keeps the test surface small and the result
  deterministic.

## Verification

- **Unit** — `src/server/data/webhooks.test.ts` (15): seed coverage (7 rows;
  4/1/2 status spread; ledger-referenced payloads; both refusal reasons;
  unhandled flag), filters (status/type incl. the `unknown` bucket/q) and
  pagination with clamping, `recordInbound` (new → RECEIVED; repeat eventId
  → DUPLICATED with first-received reference; unhandled detection; dedupe
  spans sources), `rejectInbound`.
- **Route** — `route.test.ts` (7, `@vitest-environment node`: t3-env's
  server-var guard rejects jsdom) drives the handler as HTTP would: valid →
  200 + RECEIVED row; **replay → 200 `{deduped: true}` + DUPLICATED row**
  (the QUEUES.md step); invalid JSON → 400 + REJECTED row with raw body;
  empty body → 400; unknown type → RECEIVED + unhandled; `event_id`
  fallback; GET probe. `route.auth.test.ts` (3, token stubbed before module
  load): missing token → 401 + REJECTED row and no RECEIVED row; wrong
  token → 401; correct token → 200 + RECEIVED. `webhook-status-pill.test.tsx`
  (2).
- **Gate** — `pnpm typecheck` clean; `pnpm lint` 0 errors; 23 test files /
  223 unit tests green.
- **SSR + real HTTP (dev server, 2026-09-02)** — `POST /api/webhooks/xendit`
  over curl: first → `200 {received, event}`, immediate replay →
  `200 {received, deduped}`, `not-json{{` → `400 {error: "Invalid JSON"}`,
  GET probe → 200. All four landed in the log. `/en/webhooks` SSR renders
  the seeded rows plus the four live rows (10/page — "Showing 1 to 10 of 11
  results"), the config card (`/api/webhooks/xendit`, "No token set"), and
  no `api.merchant.com` / stripe / "1,024" anywhere; `?status=REJECTED`
  renders exactly the two seeded rejections + the live one; detail pages
  render the payload, the status notes and the replay button (absent for
  rejections); unknown ids render the not-found state; `?simulate=1` renders
  the dialog trigger.
- **E2E** — `e2e/webhooks.spec.ts` (8 tests, serial): no invented
  deliveries, seeded status spread, config-card truth, URL filters + clear,
  row → detail with payload, rejected detail (reason, no replay),
  not-found, simulate round-trip into the log, replay → Duplicated row.
  Runs in CI (Playwright browser not installable in this sandbox).
- Manual procedure: `docs/audit/webhooks-test-procedure-2026-09-02.md`.
