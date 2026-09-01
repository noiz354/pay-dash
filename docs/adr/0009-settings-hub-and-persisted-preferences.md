# 0009 — Settings: a real hub, persisted preferences, reveal-once API keys

Date: 2026-09-01
Status: Accepted

## Context

The settings cluster shipped as four static screens with no index:

- `/[locale]/settings` **did not exist** — it 404'd, even though the sidebar, the billing
  summary and the invoice row menu all sent people into `/settings/*`.
- `settings/merchant` was a page of `<Input defaultValue="…">` with no `<form>`, no action,
  no dirty state; "Upload New", "Cancel" and "Save Changes" had no handlers.
- `settings/notifications` had 3 global switches, per-topic selects and per-topic switches —
  all uncontrolled, none persisted — and a breadcrumb `<a href="#">`.
- `settings/api-keys` printed three key rows as string literals, with copy buttons that copied
  nothing, `more_vert` buttons with no menu behind them, and a create button with no dialog.
- `settings/developer` had an IP input + "Add" button with no handler, no list of existing
  rules, and an `<a href="#">` documentation card.

## Decision

**1. `/settings` becomes the hub, not a 404.** `getSettingsOverview()` composes a live status
line per section (legal name, muted topic count, active live keys, IP-rule count) so the index
answers "what is configured?" before you click anything. A `<SettingsNav/>` tab strip is mounted
on all five pages so the cluster is navigable without the sidebar.

**2. One data seam, four concerns.** `src/server/data/settings.ts` holds the merchant profile,
notification channels/topics, API keys and developer settings behind async functions over an
in-memory store keyed on `globalThis` — the same swap-for-Prisma shape as `transactions.ts`,
`customers.ts` and `invoices.ts`. Client-safe vocabulary and validators live in
`src/lib/settings-options.ts` so the form and the action validate identically.

**3. Secrets are reveal-once by construction.** `createApiKey`/`rollApiKey` return the plaintext
secret from the call that creates it; the store only ever keeps a mask. The UI therefore *must*
show it once — `<SecretReveal/>` blurs it, offers reveal + copy, and requires an explicit
acknowledgement before it can be dismissed. Revoke is a status change, never a delete, so the
audit trail survives; rolling issues a replacement with the same name and scopes and stamps
`rolledFrom`.

**4. Two save idioms, chosen per screen.** The merchant profile is a *transactional* form:
controlled values, dirty tracking, Cancel restores the baseline, Save is disabled until dirty,
`beforeunload` guards unsaved edits. Notifications and developer toggles are *ambient*
preferences: optimistic flip, Server Action, revert + error toast on failure. Destructive key
actions add a confirmation checkbox on top.

**5. Critical alerts cannot be silenced.** Disputes are marked `critical` in the data layer;
the store throws on an attempt to mute them, and the UI disables the control rather than
letting a request fail silently. The prototype's "Instant (Forced)" label is preserved as the
rendered option.

## Consequences

- Every settings control now writes somewhere and reports the result in a toast.
- Prototype values are seeded as the store's defaults, so first render is byte-identical to the
  static screens; nothing was removed, only wired.
- The developer page keeps its webhook table but links to the real `/webhooks` console, and the
  documentation card routes to `/support` instead of `#`.
- Restart clears the store (in-memory). Persisting to Postgres is a swap of the four getters and
  the mutation helpers.

## Alternatives considered

- *One giant settings form with a single Save.* Rejected: notification toggles read as ambient
  state; making a switch wait for a Save button is a worse interaction than autosave.
- *Storing plaintext secrets so keys could be re-revealed.* Rejected — the whole point of the
  mask is that the platform cannot show it again.
