# SLOs, SLIs and Error Budgets

Wave 6 · `apps/web/src/domain/observability/slo.ts`

## Why these and not latency graphs

The repository already measures technical latency (`lib/sla.ts` bands, web vitals). None of it
answers the question an operator is paid to answer: **is the money flowing correctly, and how much
margin is left before we must stop shipping?**

Every SLI here is a **business** indicator expressed as `good / valid` events, so the error budget
is a count of events rather than a vague percentage. "You have 12 failed payouts left this month"
changes behaviour; "0.4% remaining" does not.

---

## The catalogue

| SLO | Objective | Window | User impact when broken |
|---|---|---|---|
| `payment-success` | 99.5% | 30d | A customer tries to pay and fails for a reason that is our fault |
| `payout-success` | 99% | 30d | A merchant's payout does not arrive, or arrives late |
| `webhook-processing` | 99.9% | 30d | A provider event is lost; the dashboard shows a wrong status |
| `reconciliation-cleanliness` | 99.5% | 30d | Our books disagree with the provider or bank and nobody notices |
| `ambiguous-resolution` | 99% | 30d | Money is in an unknown state and stays there |
| `api-availability` | 99.5% | 30d | The dashboard or API is unreachable |

Targets are deliberately **achievable-but-meaningful**. Inventing 99.99% for a system that has
never measured itself produces a permanently-breached budget that everyone learns to ignore.

### SLI definitions

| SLO | Valid events (denominator) | Good events (numerator) | Source |
|---|---|---|---|
| `payment-success` | Payment attempts that reached the provider, excluding customer-side declines | Attempts reaching terminal `SUCCEEDED` | `DurableOperation(operationType='payment.*')` |
| `payout-success` | Payout releases accepted by the platform | Releases confirmed `PAID` without manual intervention | `DurableOperation(operationType='payout.release')` |
| `webhook-processing` | Verified deliveries received | Processed to `SUCCEEDED` (dedupe counts as success) | `WebhookDelivery.processingStatus` |
| `reconciliation-cleanliness` | References compared in a **complete** run | References matching on all available sides | `reconciliationCleanliness()` |
| `ambiguous-resolution` | Operations that entered `UNKNOWN` | Resolved to terminal within 15 min | `agedUnknownOperations()` |
| `api-availability` | Non-health requests to `/api/*` | Answered with status < 500 | **NOT_INSTRUMENTED** |

Excluding customer-side declines from `payment-success` is deliberate: a customer with an expired
card is not an outage, and counting it as one trains everyone to ignore the alert.

---

## Unmeasured is not healthy

The most important behaviour in this module:

```ts
if (m.valid === 0) → severity: "NO_DATA", sli: null
```

An SLI with zero valid events returns **`NO_DATA`**, never 100%. A dashboard that shows green
because nothing was observed is worse than one showing nothing — it actively misleads. `sli` and
`burnedFraction` are `null` rather than defaulted, so a caller cannot accidentally arithmetic its
way to a false pass.

`api-availability` declares `NOT_INSTRUMENTED` **in its own definition**. It is in the catalogue
because the gap should be visible, not because it is measured.

---

## Error budget mechanics

For a 99% objective over 1 000 valid events: budget = **10** allowed failures.

| Burn | Severity |
|---|---|
| < 50% | `OK` |
| ≥ 50% | `WARNING` |
| ≥ 90% | `CRITICAL` |
| ≥ 100% | `EXHAUSTED` — freeze risky changes |

Two edge cases handled explicitly:

- **Fractional budgets floor.** 1% of 150 events = 1.5 → **1**. You cannot spend 0.4 of a failed
  payout, and rounding up hands out budget the objective does not permit.
- **A zero budget is not a free pass.** 1% of 10 events floors to 0 allowed failures, so one
  failure yields `burnedFraction: Infinity` and `EXHAUSTED`. Small windows are strict, not lenient.

Remaining budget goes **negative** once breached so the depth of the breach is visible rather than
clamped at zero.

### Input validation

`errorBudget()` throws on `good > valid` — that condition means the SLI definition is being applied
inconsistently between numerator and denominator, and silently computing a >100% ratio would hide
a measurement bug behind a reassuring number.

---

## The release gate

```ts
releaseGate(budgets) → "READY" | "CONDITIONAL" | "BLOCKED"
```

| Condition | Decision |
|---|---|
| Any money-path budget `EXHAUSTED` | **BLOCKED** |
| Any budget `CRITICAL`, or any SLI `NO_DATA` | **CONDITIONAL** |
| All measured and healthy | **READY** |

An unmeasured indicator does **not** block a release, but it is always reported — "we don't know"
and "we're fine" are different answers and the gate never merges them. A breach outranks an
unmeasured indicator, but the unmeasured one still appears in the output rather than being
swallowed.

---

## Current instrumentation status

| Component | Status |
|---|---|
| SLO definitions + error budget maths | **Implemented and tested** (21 tests) |
| Computable from existing data | `payout-success`, `webhook-processing`, `ambiguous-resolution`, `reconciliation-cleanliness` |
| Requires new instrumentation | `api-availability` (request-level metrics) |
| Live dashboard wiring | **Not done** — Wave 7 |
| Alerting / burn-rate alerts | **Not done** — needs a metrics backend |

`lib/logger.ts` is bare pino and `/api/health` is a `SELECT 1`. The maths is ready; the pipeline
that feeds it real numbers continuously is not. Stated plainly so nobody reads this document as
evidence of a live SLO practice.

## Evidence

`domain/observability/slo.test.ts` — 21 tests covering every severity boundary, the `NO_DATA`
path, fractional and zero budgets, input validation, and all four release-gate decisions.
