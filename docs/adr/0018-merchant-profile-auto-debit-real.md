# 0018 — Merchant profile: the auto-debit switch is real

Date: 2026-09-02
Status: Accepted

## Context

`/settings/merchant` is the solid half of the ADR-0009 settings pass: a real
form action, dirty-gated Save/Cancel, inline zod errors, live brand swatch,
statement-descriptor counter, `beforeunload` guard. Every field is persisted.
One of those fields, however, changed nothing:

- The **"Auto-debit platform invoices"** switch writes
  `profile.autoDebit` to the settings store correctly.
- The **billing summary card** renders from
  `summary.autoDebitEnabled` ("Auto-debit scheduled" / "Auto-debit off —
  set it up", linking to `/settings/merchant`) — in code.
- But `getBillingSummary()` (`server/data/invoices.ts`) **hardcoded
  `autoDebitEnabled: true`**. Flip the switch off, save, and the card
  still said "Auto-debit scheduled"; the "off" branch was unreachable dead
  code. Two surfaces disagreed — the defect class this audit loop exists
  to kill.

## Decision

`getBillingSummary()` reads `autoDebitEnabled` from
`getMerchantProfile()` — one data path, no UI change (the card already
renders both branches and already links to the page that owns the switch).
This is the established cross-store pattern: balance ← payouts store,
links ← ledger, now billing ← merchant profile.

## Consequences

- The switch has an observable effect end-to-end: profile → billing card.
- The "Auto-debit off — set it up" branch is live and points back to the
  profile page, closing the loop.
- No new UI, no new store field; the profile remains the single source of
  truth for merchant identity.

## Alternatives considered

- *Add an `autoDebit` field to the invoices store.* Rejected: the
  preference belongs to the merchant, not to the billing month; duplicating
  it would create the two-surface disagreement in the opposite direction.
- *Remove the switch.* Rejected: the billing card already consumes it and
  the billing pass (ADR-0008) presented it as a real state; wiring the data
  is cheaper and truer than deleting both.

## Verification

- **Unit** — `src/server/data/invoices.test.ts` gains "billing summary
  auto-debit": seed → `true`; `updateMerchantProfile({ autoDebit: false })`
  → `false`; back on → `true`.
- **Gate** — `pnpm typecheck` clean; `pnpm lint` 0 errors; vitest green.
- **E2E** — `e2e/billing.spec.ts` gains the round-trip: card shows
  "Auto-debit scheduled" (seed) → flip switch on `/settings/merchant` →
  "Unsaved changes" → save (toast) → card shows "Auto-debit off — set it
  up" → restored to "scheduled" for the rest of the suite.
- Manual procedure: `docs/audit/merchant-auto-debit-test-procedure-2026-09-02.md`.
