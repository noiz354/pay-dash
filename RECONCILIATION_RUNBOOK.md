# Reconciliation Runbook

Wave 6 · `apps/web/src/domain/finance/reconciliation.ts`

For the operator who has been handed a reconciliation exception and needs to know what it means
and what to do about it.

---

## What reconciliation actually compares

Before Wave 6 the dashboard could only agree with itself: every figure came from one store, so
"consistent" and "correct" were indistinguishable. Reconciliation introduces the second and third
opinions.

| Side | Authority on |
|---|---|
| **INTERNAL** | What our ledger believes happened |
| **PROVIDER** | Whether the API call actually took effect (Xendit / Stripe) |
| **SETTLEMENT** | Whether money truly entered or left the bank account |

Agreement between all three is the only basis for saying the books are right.

## The rule that prevents false alarms

**An absent side is not an empty side.**

If the provider API is unreachable we do not have "zero provider records" — we have *no opinion*.
Conflating the two would raise `MISSING_PROVIDER` against every payment in the book and bury the
real exceptions in noise.

`SideInput` makes this explicit: `{ available: false, reason }`. A run missing any side is marked
`partial: true`, and `reconciliationCleanliness()` returns **`null`** — never a percentage. You
cannot report a cleanliness figure when a source did not answer.

---

## The eight exception types

### FATAL — money may be wrong

#### `MISSING_INTERNAL`
Provider and/or bank record a movement our ledger never captured.

- **Means:** money moved and we did not book it. Our balance is understated.
- **Do:** find the provider reference; confirm against the settlement file; if real, book it and
  open an `INVARIANT_VIOLATION` case. Check whether a webhook was lost around that timestamp.

#### `MISSING_PROVIDER`
We (and possibly the bank) believe a movement succeeded; the provider has no record.

- **Means:** either we booked something that never happened, or we are querying the wrong
  provider account/mode (TEST vs LIVE is the classic cause).
- **Do:** verify the connection's mode and account identity **first** — most instances of this are
  a configuration error, not a lost payment.

#### `MISSING_SETTLEMENT`
Booked and provider-confirmed, but never appeared in settlement.

- **Means:** the money has not landed. Often a timing artefact near a settlement cut-off.
- **Do:** check the settlement window; if it persists past the provider's stated T+n, escalate to
  the provider with the reference. This is the exception most likely to be a genuine loss.

#### `AMOUNT_MISMATCH`
Two sides disagree on the amount.

- **Means:** fee handling, partial capture, partial refund, or a currency-unit bug.
- **Do:** check whether one side is gross and the other net. A difference exactly equal to the fee
  is a mapping bug, not a lost payment. A 100x difference is a minor-unit bug (see IDR below).

#### `CURRENCY_MISMATCH`
The same reference appears under different currencies. Amounts are **not** compared afterwards —
comparing them would be meaningless.

- **Do:** treat as a data-integrity incident. This should be impossible.

#### `STATUS_MISMATCH`
Two **terminal** sides disagree on the outcome. A side that is merely still `PENDING` does not
trigger this — that is a timing artefact, and `STALE_PENDING` catches it if it persists.

#### `DUPLICATE_PROVIDER`
The same external reference appears twice on one side.

- **Means:** one of the clearest **double-charge / double-payout** signals available.
- **Do:** treat as urgent. Identify both provider ids, determine which is authoritative, and check
  whether an idempotency key was regenerated instead of reused.

### WARN — needs attention, not panic

#### `STALE_PENDING`
Pending for longer than the threshold (default 24h).

- **Do:** probe the provider for the current state. If it resolves to ambiguous, follow
  *Ambiguous operations* below.

---

## Ambiguous operations (the dangerous one)

An operation in `UNKNOWN` means **we do not know whether money moved**. A transport timeout is not
a failure; the provider may have applied the write and the response was lost.

**Never retry an `UNKNOWN` operation without a verdict.** `guardUnknownRetry()` enforces this in
code (`server/finance/unknown-recovery.ts`), but the reasoning matters:

| Verdict | Next state | Retry? |
|---|---|---|
| `CONFIRMED_APPLIED` | `SUCCEEDED` | **Never.** Mark it succeeded. Retrying pays twice. |
| `CONFIRMED_ABSENT` | `EXECUTING` | Yes — under the **same** idempotency key. |
| `STILL_UNKNOWN` | `UNKNOWN` | No. Human decision required; a case is opened. |

A probe that *itself* fails returns `STILL_UNKNOWN`, never `CONFIRMED_ABSENT`. Treating a failed
probe as "nothing happened" is the double-payment bug with extra steps.

The probe asks about the **idempotency key**, not a provider resource id — if the response was
lost we never received an id, which is exactly why keys are derived from the logical operation
(ADR-0036) rather than generated randomly.

---

## Running a reconciliation

```ts
const run = reconcile({
  organizationId,
  window: { from, to },
  internal:   { available: true, records: internalRecords },
  provider:   { available: true, records: providerRecords },
  settlement: { available: false, reason: "bank file not delivered" },
});
```

Runs are **deterministic** — references are sorted, so two operators investigating the same window
see identical output. Records belonging to another tenant are dropped before comparison
(INV-T2): one tenant's provider data must never shape another tenant's book.

## Triage order

1. `DUPLICATE_PROVIDER` — possible double movement, highest blast radius.
2. `MISSING_SETTLEMENT` — money that has not arrived.
3. `MISSING_INTERNAL` — our books are understated.
4. `AMOUNT_MISMATCH` / `CURRENCY_MISMATCH` — usually a mapping bug; fix the mapping, not the row.
5. `MISSING_PROVIDER` — check configuration before assuming loss.
6. `STATUS_MISMATCH`.
7. `STALE_PENDING` — batch these.

## Case management

Exceptions become cases (`domain/finance/cases.ts`). Rules with teeth:

- A case cannot be resolved unless it was acknowledged — no silent closes.
- Resolution requires a written reason and an actor.
- A **FATAL** case cannot be closed `WONT_FIX`. Either fix it or correct its severity.
- `RESOLVED` is terminal. A recurrence opens a *new* case, so the record of the first resolution
  survives.
- Identical signals dedupe on `{org}:{type}:{subject}` — 500 repeats become one case, not a flood.

## Known gotchas

- **IDR has zero decimals.** A 100x discrepancy is almost always a minor-unit bug, not a loss.
- **Provider mode.** A TEST connection reconciled against LIVE settlement produces total
  `MISSING_PROVIDER` noise.
- **`getBalanceOverview()` prefers the live provider figure and discards the ledger-derived one**
  without comparing them. Divergence there is currently invisible on the balance screen; the
  reconciliation engine is the only place it surfaces.

## Evidence

`domain/finance/reconciliation.test.ts` — 23 tests: all 8 exception types reproduced, determinism
proven, unavailable-side behaviour verified, tenant filtering verified.
