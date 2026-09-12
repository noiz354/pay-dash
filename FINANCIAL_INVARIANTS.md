# Financial Invariants

Wave 6 · `apps/web/src/domain/finance/`

An invariant is a statement that must be true of the books at every instant. This document
defines the ones `pay-dash` enforces, how each is checked, and — just as importantly — what
each one does **not** cover.

The checker is `checkLedgerInvariants(snapshot)` in `domain/finance/invariants.ts`. It is
**report-only**: it never repairs anything. Auto-correcting a financial discrepancy destroys the
evidence of how the discrepancy arose, which is the one thing you cannot recreate later. This
mirrors ADR-0039's "never auto-apply" rule.

---

## The arithmetic foundation

Everything below depends on `domain/finance/money.ts`, which represents money as **integer minor
units** tagged with a currency.

| Rule | Behaviour |
|---|---|
| No floats | `0.1 + 0.2 !== 0.3` has no place in a ledger. All arithmetic is on integers. |
| No implicit conversion | `addMinor(idr, usd)` throws `CURRENCY_MISMATCH`. It does not convert. |
| No silent rounding | A fractional minor unit throws `NOT_INTEGER` rather than rounding. |
| Explicit persistence boundary | `fromDecimalString` / `toDecimalString` for `Decimal(20,4)` columns. |
| Guarded legacy bridge | `fromLegacyNumber` accepts the existing `number` stores and rejects values with float drift beyond `1e-6`. |

Zero-decimal currencies are handled explicitly: IDR, JPY and VND have `MINOR_UNITS = 0`, so
"1000 IDR" is 1000 units, not 100 000. Getting this wrong is a 100x error.

---

## The invariants

| Code | Statement | Severity | Status |
|---|---|---|---|
| **INV-L1** | Every posting group balances: Σdebits = Σcredits | FATAL | **NOT_APPLICABLE** — see below |
| **INV-L2** | Σ successful refunds ≤ captured amount, per payment | FATAL | Enforced |
| **INV-L3** | Σ payouts (settled + reserved) ≤ available funds | FATAL | Enforced |
| **INV-L4** | reported available = opening + inflow − outflow − reserved | FATAL | Enforced |
| **INV-L5** | No balance component is negative | FATAL | Enforced |
| **INV-L6** | Every amount in a snapshot shares the snapshot currency | FATAL | Enforced |
| **INV-L7** | No state transition occurs after a terminal state | FATAL | Enforced (see coverage note) |
| **INV-L8** | Every amount is an integer count of minor units | FATAL | Enforced |

### INV-L1 — double-entry balance

**Reported `NOT_APPLICABLE`, not `PASS`.**

There is no double-entry posting table in this system. `buildLedgerSnapshot()` returns
`doubleEntryAvailable: false` and emits zero postings. A checker that ran "Σdebits = Σcredits"
over an empty array would return `true` forever — a green light that means nothing.

The checker therefore distinguishes the two cases explicitly. When postings exist the rule is
enforced per posting group, independently, so one unbalanced journal does not mask another.

### INV-L2 — refunds never exceed capture

The ceiling is the transaction's **gross amount**, not `net` (amount − fee). A merchant refunds
what the customer paid; using `net` would flag a legitimate full refund as an over-refund.

Failed refunds are excluded from the sum — a refund that did not happen did not return money.
Orphan refunds (a refund whose payment is not in the snapshot) are reported separately rather
than being silently ignored.

> **Known upstream weakness.** `server/data/*` clamps `refundedAmount` with `Math.min(...)`,
> so an over-refund is *hidden before this checker can see it*. INV-L2 is correct, but on the
> current in-memory data it cannot fire. This is recorded rather than papered over.

### INV-L3 — payouts never exceed available funds

Both settled and `PENDING` payouts count against the balance: a pending payout is a reservation
of real money, and ignoring it is how an account goes overdrawn while the dashboard looks fine.

### INV-L4 — balance derivation

```
available == opening + settledInflow − settledOutflow − reserved
```

This is the invariant most likely to be *accidentally made vacuous*, and it was. The first
implementation of `settlementTotals()` derived top-ups as a **residual** of the very identity
INV-L4 checks, which forced the equation to hold by construction. It has been replaced: the
snapshot now enumerates the balance module's own `listMovements()` output, so the two sides of
the equation are computed from independent data and the check can genuinely fail.

Two tests in `server/finance/snapshot.test.ts` prove the checker is sensitive — they corrupt the
real snapshot and assert INV-L2 and INV-L3 fire.

### INV-L5 / INV-L6 / INV-L8 — shape rules

Shape checks run **first** and suppress the arithmetic checks when they fail. A snapshot with a
mixed currency or a non-integer amount produces one meaningful violation instead of a cascade of
derived nonsense.

### INV-L7 — terminal monotonicity

Transitions are evaluated in **timestamp order**, not array order, so an out-of-order webhook
replay is judged by when it happened rather than when it was stored.

> **Coverage note.** The current stores keep `tx.events` as prose, not a typed state log, so no
> real transition data reaches the checker. INV-L7 is fully unit-tested but **cannot currently
> fail on production data**. It becomes live when durable operations feed the snapshot.

---

## Report semantics

```ts
{ ok, fatalCount, warnCount, violations, byCode }
```

- The checker **never throws**. A crash mid-check would hide every violation after the first.
- It collects *all* violations — you get the whole picture in one run.
- FATAL and WARN are separated: a stale pending payment is worth a look, an unbalanced ledger
  stops the line.
- It is deterministic: the same snapshot yields byte-identical output.

## What is NOT covered

1. **Cross-organization aggregation.** A snapshot is one org, one currency. Multi-currency
   organizations need a per-currency snapshot each; there is no FX logic here on purpose.
2. **Provider-side truth.** These invariants check internal consistency only. Agreement with
   Xendit/Stripe/the bank is the reconciliation engine's job (`RECONCILIATION_RUNBOOK.md`).
3. **Time-travel.** A snapshot is as-of an instant. Nothing here detects a figure that was wrong
   yesterday and is right today.
4. **The legacy in-memory stores' own bugs** (the `Math.min` clamp above). The checker is only as
   truthful as its input.

## Evidence

| What | Where |
|---|---|
| Money arithmetic | `domain/finance/money.test.ts` — 16 tests |
| Invariants INV-L1..L8 | `domain/finance/invariants.test.ts` — 27 tests |
| Real seeded ledger gate | `server/finance/snapshot.test.ts` — 10 tests, incl. 2 sensitivity proofs |
| Performance | `docs/evidence/finance-bench.json` — LINEAR to 10 000 records |
