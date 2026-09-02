# 0015 — Developer settings: the webhook card tells the receive-side truth

Date: 2026-09-02
Status: Accepted

## Context

ADR-0014 rebuilt `/webhooks` as the log of callbacks the app **receives** —
and pointed the configuration surface at `/settings/developer` ("Retry
policy & IP allowlist →"). That page, built in the ADR-0009 settings pass,
was mostly sound (API keys, IP allowlist and the sandbox toggle are real)
but its webhook section still told the old, inverted story:

1. A "Webhook Endpoints" card rendered two hard-coded **delivery**
   endpoints — `https://api.acme.com/webhooks/ledger` (`payment.*`, Active)
   and `https://staging.acme.com/hooks/sync` (`customer.*`, Failing).
   INTEGRATION.md §7 (:99/:307) fixes the direction: this app receives
   webhooks, it never delivers them. No store, field or route knows those
   URLs, and the "Failing" status described a delivery that cannot exist.
   Three hops back, `/webhooks` now shows inbound callbacks to the app's
   own endpoint — the page the config card promised contradicted the log it
   pointed at.
2. The "Webhook retries" toggle (`webhookRetries`, persisted since ADR-0009)
   was framed as *"Retry failed deliveries with exponential backoff for 24
   hours"* — again delivery machinery — and nothing consumes the field. On
   the receive side retries are the **provider's** job: Xendit re-delivers
   on non-2xx (INTEGRATION.md :301), and this endpoint answers 200-fast and
   dedupes by event id (ADR-0014). Surfacing a switch for a mechanism the
   app doesn't have is a false control.
3. The single most material developer-facing fact about webhooks — whether
   `XENDIT_WEBHOOK_TOKEN` is configured, the only thing protecting the
   endpoint (INTEGRATION.md :292) — was absent.

## Decision

**1. The "Webhook Endpoints" table is replaced by a "Webhook Endpoint"
card** stating the receive-side truth, from the same sources as ADR-0014's
config card: the real endpoint URL from `headers().host` (copyable), the
token's **presence** — "Token configured (value hidden)" / "No token set —
dev accepts without verification", the value never rendered — the handled
event types (`KNOWN_WEBHOOK_EVENTS`, incl. the "…stored as unhandled"
chip), and retries stated as **fact** rather than as a switch: "The
provider re-delivers on non-2xx (INTEGRATION.md §7). This endpoint answers
200 fast and dedupes by event id, so a re-delivery is logged as
Duplicated — never processed twice (ADR-0014)." The unset-token case gets
its remediation note: set `XENDIT_WEBHOOK_TOKEN` in the environment; in
production an unset token is a hard failure (500). The "Open webhook
console" link is relabelled **Open webhook log**.

**2. `webhookRetries` is deleted end-to-end** — a false control is removed,
not re-skinned: the `DeveloperSettings` field + seed, the
`setDeveloperToggle` field union, the `DevToggleSchema` enum, the action's
message branch, the `DeveloperToggle` prop type and the one store-test
assertion. The `Environment` card now carries the sandbox toggle alone
(kept — plausible, not contradicted by INTEGRATION.md, and deliberately out
of scope).

**3. Wording parity with `/webhooks`.** The token pills use the exact
strings from ADR-0014's config card, so the two surfaces that both answer
"is my webhook auth in order" can never drift.

## Consequences

- `/settings/developer` and `/webhooks` now tell one consistent story: the
  app receives callbacks at one endpoint, verifies a token (if set), dedupes
  by event id, and stores the outcome — configurable surface and monitor
  surface of the same thing.
- The settings store is smaller and true: every field it persists is either
  surfaced honestly or not persisted at all.
- The token itself remains environment-only by design — the settings page
  reports its presence and how to set it, exactly like the config card.

## Alternatives considered

- *Keep the toggle, relabel it receive-side ("Retain rejected callbacks"?).*
  Rejected: that would coin a new setting with no consumer — the same
  fabrication the toggle already was, in new words. Deletion is the honest
  move; ADR-0009's store survives with one fewer dead field.
- *Make the endpoint card a client component with a "mark verified"
  button.* Rejected: there is nothing to verify client-side; the truth is
  `headers().host` + env presence, both server-side facts.
- *Link out to the Xendit dashboard for URL+token configuration.* Rejected
  for this pass: the merchant-portal URL is environment-specific and not in
  any store; the page states what the app knows and where the env variable
  lives, which is the actionable part.

## Verification

- **Unit** — `src/server/data/settings.test.ts` updated (the toggle test no
  longer asserts `webhookRetries`); full suite green.
- **Gate** — `pnpm typecheck` clean; `pnpm lint` 0 errors; vitest green.
- **SSR (dev server, 2026-09-02)** — `/en/settings/developer` renders the
  endpoint card with the deployment's real URL, the "No token set" pill and
  the env-var remediation note, the handled-event chips and the retry fact;
  no `api.acme.com` / `staging.acme.com` / "Webhook retries" anywhere;
  sandbox toggle, API keys table, allowlist and docs card unchanged.
- **E2E** — `e2e/settings.spec.ts` gains "the webhook section states the
  receive-side truth": no acme URLs, no retries switch, endpoint URL +
  token pill + `payment.succeeded` chip visible, "Open webhook log" links
  to `/webhooks`. Runs in CI (Playwright browser not installable in this
  sandbox).
- Manual procedure: `docs/audit/settings-developer-test-procedure-2026-09-02.md`.
