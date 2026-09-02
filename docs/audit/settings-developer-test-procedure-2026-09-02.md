# Developer settings (webhook card) — manual test procedure (2026-09-02)

Run `pnpm dev` from `apps/web` and start at
`http://localhost:3000/en/settings/developer`.

## A. The webhook card is the receive-side truth

1. **Webhook Endpoint** card (no "Webhook Endpoints" table): no
   `api.acme.com`, no `staging.acme.com`, no Active/Failing delivery rows —
   the old outbound fiction is gone.
2. The **Endpoint** row shows this deployment's real URL
   (`https://<host>/api/webhooks/xendit`) with a working copy button.
3. **Callback token** row: with no `XENDIT_WEBHOOK_TOKEN` in the env →
   "No token set — dev accepts without verification" pill plus the note
   telling you to set the env variable (and that production fails hard
   without one). The value is never rendered on any surface.
4. With `XENDIT_WEBHOOK_TOKEN=wh_test` in the env (restart the dev server)
   → pill flips to "Token configured (value hidden)"; the note switches to
   "rejected with 401 and logged". Both `/settings/developer` and the
   `/webhooks` config card show the same wording.
5. **Handled event types** row: `payment.succeeded`, `payment.completed`,
   `invoice.paid`, `invoice.completed`, `refund.succeeded` + the
   "…stored as unhandled" chip — same list as the route's handler switch.
6. **Retries** row is a sentence, not a switch: provider re-delivers on
   non-2xx; the endpoint answers 200 fast and dedupes by event id
   (Duplicated, never processed twice).
7. **Open webhook log** links to `/en/webhooks` (the inbound log).

## B. What was removed

8. No "Webhook retries" switch anywhere on the page; the `Environment`
   card carries only the **Sandbox mode** toggle (still persists via its
   toast).

## C. Invariants

9. The rest of the page is untouched by this pass: API keys table +
   Generate Key dialog, Manage keys → `/settings/api-keys`, IP allowlist
   manager, API Documentation card → `/support`, SettingsNav + breadcrumb.
10. No surface in the app now describes webhook *delivery* — search the
    rendered page for "deliver", "Failing" and target-URL patterns: the
    only webhook direction is provider → this endpoint.
