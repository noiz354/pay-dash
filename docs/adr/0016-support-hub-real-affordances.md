# 0016 — Support: the hub that knows where you came from

Date: 2026-09-02
Status: Accepted

## Context

`/support` (sidebar entry, plus two deep-link sources: the transaction
**row action "Report issue"** → `/support?ref=<id>` and the transaction
detail page's report link) was the app's last raw prototype:

- **Four `href="#"` topic cards** — "API Reference", "Settlement Guide",
  "KYC Requirements", "Reporting & Export" — while the app already has the
  exact pages each describes (`/settings/api-keys`, `/payouts`, `/kyc`,
  `/reports/builder`).
- **The `?ref` parameter was silently dropped.** A merchant clicking
  "Report issue" on `txn_abc` arrived at a generic hub that forgot the
  transaction — the only parameterized entry point on the page carried no
  state.
- **A dead knowledge-base search** (input + **Cmd+K** kbd) with no
  behaviour — INTEGRATION.md documents the screen as *"Static content; no
  API"*, so there is no KB to search.
- **An invented status widget** — three hard-coded "Operational" rows
  (API Gateway / Settlement Engine / Webhooks) with a ping dot and a
  `href="#"` "View detailed status". No store backs any of those rows.
- **Three no-op contact buttons** — "Live Chat — Available" (no
  capability, no availability), "Email Support" (no destination),
  "Ticket History" (no ticket store).

## Decision

The screen stays static (per INTEGRATION.md) — but every affordance on it
becomes **true**:

**1. Topic cards route.** Each card is now a `Link` into the page that
actually covers the topic: API Reference → `/settings/api-keys`
(credentials, scopes, webhook endpoint), Settlement Guide → `/payouts`
(batches, failures, per-recipient retry), KYC Requirements → `/kyc`,
Reporting & Export → `/reports/builder`. Descriptions were reworded to
match what those pages do.

**2. `?ref` is honoured.** When present, a banner states "You're reporting
on `<ref>`" (the value transaction surfaces pass), and the support email's
subject is pre-filled: `Kinetic Ledger — issue with txn_…` — built by
`supportMailto(ref?)` in `lib/support.ts` (client-safe, unit-tested). The
report arrives with its context instead of losing it on arrival.

**3. The status widget stops inventing rows.** One honest line — platform
health is monitored on the System Status page — with "View detailed
status" → `/system`. (The `/system` page's own metrics are a known,
separately-queued pass; this link is correct either way because it names
the page rather than re-stating the facts.)

**4. Contact is one real action.** "Email support" →
`mailto:support@kinetic.test` (same domain family as the established
`pay.kinetic.test` share links; the address is the single documented
constant `SUPPORT_EMAIL`). Live Chat and Ticket History are **removed** —
no capability or store exists behind them, and a removed button is more
honest than a labelled no-op.

**5. The dead search bar and Cmd+K kbd are removed**; the page is
normalized to `max-w-container-max` and gains a `metadata` export.

## Consequences

- Zero dead affordances left on the page (was seven): four `href="#"`
  cards, one `href="#"` status link, three no-op buttons.
- The "Report issue" journey from `/transactions` now closes the loop:
  click → context preserved → email subject carries the transaction id.
- `support@kinetic.test` becomes the app's single documented support
  address (one constant, one place to change it).

## Alternatives considered

- *Build a knowledge base (searchable static articles).* Rejected:
  INTEGRATION.md explicitly fixes this screen as "Static content; no
  API"; inventing article content would be fabricating product copy the
  team never wrote. Linking into the app's real pages covers the same
  intents (API, settlement, KYC, reporting) with zero invented content.
- *Keep a status widget with real data.* The only platform facts the app
  can state live elsewhere (sandbox mode, token presence) and are already
  surfaced on `/settings/developer` and `/webhooks`; restating them here
  would create a second source. The pointer-to-`/system` is the honest
  minimal version until `/system` itself is rebuilt.
- *`/support?ref=` detail page per reference.* Rejected: a reference chip +
  pre-filled mailto subject preserves the context with no new route; a
  full per-ref report form would need a ticket store that doesn't exist.

## Verification

- **Unit** — `src/lib/support.test.ts` (3): plain mailto, ref pre-fills the
  subject (em-dash percent-encoded), blank refs treated as absent.
- **Gate** — `pnpm typecheck` clean; `pnpm lint` 0 errors; vitest green.
- **SSR (dev server, 2026-09-02)** — `/en/support` renders the four cards
  with real hrefs, the status pointer and the mailto; no `href="#"`
  anywhere; `?ref=txn_abc` renders the banner and the encoded subject.
- **E2E** — `e2e/support.spec.ts` (5): no dead links/buttons/search,
  card destinations, status → `/system`, mailto with and without `?ref`.
  Runs in CI (Playwright browser not installable in this sandbox).
- Manual procedure: `docs/audit/support-test-procedure-2026-09-02.md`.
