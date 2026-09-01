# 0010 — Payouts: batches own recipients, disbursement is a gated action

Date: 2026-09-01
Status: Accepted

## Context

Payouts shipped as two orphan screens with no parent and no record of a payout:

- `/[locale]/payouts` **did not exist** — 404, while the sidebar showed two children under it.
- `payouts/bulk` printed `,250,890.00` and `8,405,200.50` — string literals that had lost their
  currency symbol and leading digit — next to "Across 3 active batches" that led nowhere, because
  no batch entity, no batch list and no batch route existed anywhere in the app.
- Its drag-and-drop zone was a decorative `<div>`: no `<input type="file">`, no drop handler, no
  parsing, no validation, no preview. "Download Template" was `href="#"`. "New Batch" and
  "Export Log" had no handlers.
- `payouts/settings` had an uncontrolled switch, a `defaultValue="weekly"` radio group with no
  follow-up day question, a `defaultValue="50,000"` string amount, a "Change" button with no
  account list, and Discard/Save with no handlers.

## Decision

**1. A batch is the unit, and it owns its recipients.** `server/data/payouts.ts` stores
`PayoutBatch { recipients[], timeline[] }`. Every aggregate — pending total, completed 30d,
failed exposure, batch status, progress bar — is *derived* from those recipients via
`summarise()` / `deriveStatus()`, so a summary card can never disagree with the table under it.
Batch status is computed (`PROCESSING` while rows are pending, `PAID` when all settled,
`PARTIAL` on a mixed outcome, `FAILED`/`RETURNED` at the extremes) except while a batch is still
editable (`DRAFT`/`SCHEDULED`), which the operator controls.

**2. Parse before you pay.** `lib/payout-csv.ts` is client-safe and used *twice*: the browser
parses the dropped file to render a valid/rejected preview, and `createBatchAction` re-parses the
same text server-side because the preview is a convenience, not a trust boundary. Every rejected
row carries its line number and a human reason, and can be exported as its own CSV to fix and
re-upload. The download template is generated from the same module, so schema and parser cannot
drift.

**3. Disbursement is a gated, deep-linkable action.** Releasing or cancelling a batch requires an
explicit confirmation checkbox in a dialog that opens on `?send=1` / `?cancel=1` — the pattern
established by invoice payment (ADR-0008). Settlement is deterministic (accounts ending `0000`
are rejected by the "partner") so demos, tests and the retry path are reproducible.

**4. Failure is a first-class state.** Rows keep a `failureReason`; the detail page shows it, and
recovery exists at two granularities: retry one recipient, or retry every failed row in the batch.
Both report a result toast; neither deletes history — the timeline records each attempt.

**5. Schedule settings become a transactional form.** Cadence adds the conditional follow-up
question the prototype implied (weekday for weekly, day-of-month for monthly, capped at 28), the
amount field parses `50,000` / `Rp 50.000` / `50000` through one shared `parseAmount`, and the
destination account picker refuses unverified accounts with the reason visible rather than
failing silently.

## Consequences

- `/payouts` is now the payout history the product was missing; `/payouts/[id]` is the destination
  for "3 active batches".
- Money is rendered with `formatMoney` everywhere; the broken literals are gone.
- Export endpoints: `/api/exports/payouts` (filtered batch log), `/api/exports/payouts/[id]`
  (recipients), `/api/exports/payout-template` (schema).
- The store is in-memory: a restart resets seeds. Swapping to Postgres is a change of the read and
  mutation helpers only.
- Settlement being deterministic means the demo cannot show a *random* failure — it is a
  documented rule (`…0000`) instead.

## Alternatives considered

- *Deriving payouts from ledger transactions*, as invoices are derived from fees. Rejected: a
  disbursement is an instruction the merchant authors, not a consequence of the ledger, and it
  must exist in DRAFT before any money moves.
- *Uploading the file to the server and parsing there only.* Rejected: the operator needs the
  valid/invalid split before committing, and a round trip per correction is a worse loop.
