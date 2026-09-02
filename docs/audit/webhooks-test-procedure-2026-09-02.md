# Webhooks — manual test procedure (2026-09-02)

Run `pnpm dev` from `apps/web` and start at
`http://localhost:3000/en/webhooks`.

The store is in-memory: restart the dev server to reset simulated and
replayed callbacks (seeded rows always return).

## A. The log (receive-side, not deliveries)

1. Seven seeded rows, newest first. Statuses: **Received ×4, Duplicated ×1,
   Rejected ×2** — and no outbound-delivery fiction anywhere: no
   `api.merchant.com`, no `stripe`, no `1,024 results`.
2. The two money events reference real ledger rows: open
   `whk_seed_1` (payment.succeeded) — its payload's `data.id` is a `txn_…`
   reference that exists on `/en/transactions`. Same for `whk_seed_3`
   (refund.succeeded → a REFUNDED row).
3. The seeded duplicate (`evt_a1b2c3d4`) sits directly above its original —
   same event id, later received-at, reason "Duplicate — first received …".
4. The unknown seeded type (`invoice.issued`) carries the **unhandled**
   badge; its detail page says no handler branch exists.

## B. The config card

5. The endpoint URL is this deployment's real URL
   (`…/api/webhooks/xendit`) with a working copy button.
6. Token line: with no `XENDIT_WEBHOOK_TOKEN` in the env → "No token set —
   dev accepts without verification"; with one set → "Token configured
   (value hidden)" — the value itself is never rendered.
7. **Retry policy & IP allowlist →** links to `/en/settings/developer` (the
   controls live there, not duplicated here).

## C. Filters

8. Status select → `?status=REJECTED` (2 rows); type select →
   `?type=payment.succeeded` (3 rows); "Unhandled types" → the 3 unhandled
   rows (invoice.issued + the two rejections); they compose (REJECTED +
   payment.succeeded → 0 rows).
9. Search (350 ms debounce) matches event id, type, row id and **payload**
   (type a `txn_…` reference from a seeded payload and its event appears).
   **Clear filters** resets everything.
10. More than 10 events → real pagination footer ("Showing 1 to 10 of N
    results", prev/next, `?page`).

## D. The endpoint, for real

11. `curl -X POST …/api/webhooks/xendit -H 'content-type: application/json'
    -d '{"id":"evt_manual_1","event":"payment.succeeded","data":{"id":"txn_x"}}'`
    → `200 {"received":true,"event":"payment.succeeded"}` — and a new
    Received row appears on the page.
12. POST the same body again → `200 {"received":true,"deduped":true}` — a
    **Duplicated** row for the same event id (QUEUES.md's verification step,
    now visible in the UI).
13. `curl … -d 'not-json{{'` → `400 {"error":"Invalid JSON"}` — a Rejected
    row whose detail shows the raw body.
14. With `XENDIT_WEBHOOK_TOKEN=wh_test` in the env (restart): no/wrong
    token → `401` + a Rejected row ("Invalid x-callback-token"); correct
    token → `200` + Received. The config card flips to "Token configured".

## E. TEST MODE

15. **Simulate callback** (or `/en/webhooks?simulate=1`): pick an event type
    (`invoice.issued` is the unhandled demo), optional ledger reference,
    **Send callback** → "Callback recorded" panel with the generated
    `evt_…` id; **View event** → its detail page; **Done** removes
    `?simulate=1`; the new row is first in the log.
16. On any received event's detail: **Replay callback** → toast "Replayed
    … — logged as a duplicate (idempotent no-op)" and the log gains a
    Duplicated row for the same event id. Rejected events offer no replay.

## F. Invariants

17. Every POST leaves a row (accepted, deduped or refused); the pill on the
    detail page and the row in the log always agree; a log row's status
    never changes after receive-time; no surface offers outbound delivery
    configuration — this app receives, it does not deliver.
