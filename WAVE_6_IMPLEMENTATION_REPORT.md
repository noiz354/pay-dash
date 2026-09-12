# Wave 6 Implementation Report

**Goal:** not new UI — prove `pay-dash` is financially correct, recoverable, observable,
tenant-safe, and operable under real failure.

**Date:** 2026-09-12 · **Branch:** `arena/01a095c5-pay-dash`

---

## Headline

| | |
|---|---|
| Wave 6 tests added | **188**, all passing, across 10 files |
| Full suite | **1218 passed** / 119 files (baseline was 1075) |
| Only failing suite | `mcp/server.integration.test.ts` — pre-existing, Prisma engines unavailable |
| Typecheck | `tsc --noEmit` **clean** |
| Executable evidence | `docs/evidence/dr-drill.json`, `docs/evidence/finance-bench.json` |
| **Release readiness** | **CONDITIONAL** |

Two gates do not pass, and both are reported rather than smoothed over: **Tenant Isolation
(FAIL)** and **Load Test (PARTIAL)**.

---

## Final gate table

| Gate | Verdict | Evidence |
|---|---|---|
| **Financial Correctness** | **PASS** | INV-L1..L8 implemented; 43 domain tests; real seeded ledger checked with `fatalCount === 0`; **2 sensitivity tests prove the checker can fail** |
| **Tenant Isolation** | **FAIL** | Measured matrix: 3 PASS / 2 GAP. 0 of 20 `server/data/*` modules accept an organization |
| **Idempotency** | **PASS** | All 7 mandated failure scenarios executed green (31 tests) |
| **Reconciliation** | **PASS** | All 8 exception types reproduced; determinism proven; unavailable-side emits zero false positives (23 tests) |
| **DR** | **PASS** | Restore **executed**: RTO 2.015 s, checksums match exactly, unique indexes survive |
| **SLO/Observability** | **CONDITIONAL** | 6 SLOs defined and unit-tested (21 tests); `api-availability` NOT_INSTRUMENTED; no live pipeline |
| **Load Test** | **PARTIAL** | Tier 1 executed — both engines **LINEAR** to 10 000 records. Tier 2 HTTP load **NOT_RUN** |
| **AI Governance** | **PASS** | Fail-closed classification proven; eval harness 5/5, **0 unsafe escapes** (18 tests) |

**Release Readiness: CONDITIONAL.** Blocking row: Tenant Isolation. `pay-dash` must not be
operated with more than one tenant's real data in the in-memory stores until Wave 7 lands.

---

## What was built

| Task | Module | Tests |
|---|---|---|
| T1 | `domain/finance/money.ts` — integer minor units, no floats | 16 |
| T2 | `domain/finance/ledger.ts` + `invariants.ts` — INV-L1..L8 | 27 |
| T3 | `server/finance/snapshot.ts` — seam from real stores | 10 |
| T4 | `domain/finance/reconciliation.ts` — three-way matcher | 23 |
| T5 | `domain/security/tenant.ts` — scope primitive | 15 |
| T6 | `server/finance/unknown-recovery.ts` — ambiguous-success gate | (in T7) |
| T7 | `server/finance/failure-scenarios.test.ts` — 7 mandated scenarios | 31 |
| T8 | `domain/finance/cases.ts` — exception/case state machine | 21 |
| T9 | `domain/observability/slo.ts` — SLO/SLI/error budget | 21 |
| T11 | `domain/ai/governance.ts` — tool tiers + approval boundary + evals | 18 |
| T12 | `scripts/dr-restore-drill.mjs` — executable DR drill | executed |
| T13 | `scripts/finance-bench.mjs` — Tier 1 benchmark | executed |
| — | `server/finance/tenant-isolation.probe.test.ts` — measured matrix | 6 |

Not built, deliberately: T10 synthetic provider probes (would add an unauthenticated surface —
deferred to a security slice), and the Wave 7 retrofit of 20 data modules (mega-diff).

---

## Three bugs this wave found in its own work

Recording these because the process that caught them matters more than the code.

### 1. The balance invariant was vacuous

`settlementTotals()` derived top-ups as a **residual** of the exact identity INV-L4 checks:

```ts
const topUps = overviewAvailable - (opening + inflow - outflow - reserved);
```

This forced `available == opening + inflow − outflow − reserved` to hold *algebraically*. INV-L4
was permanently green and completely worthless. Replaced with real `listMovements()` data so the
two sides are computed independently, then backed with two sensitivity tests that corrupt the real
snapshot and assert the checker fires.

### 2. The DR drill restored nothing

The first drill seeded rows generically from `information_schema`; every insert bounced off a
foreign key or check constraint, and the drill reported **PASS having restored 0 rows**. Now it
uses an explicit referentially-valid fixture and **hard-fails** when control data is empty.

### 3. The backup was not replayable

Once real rows existed, the restore died on `AuditEvent_organizationId_fkey` — tables were dumped
alphabetically and `AuditEvent` sorts before `Organization`. A backup that cannot be replayed in
dependency order is not a backup. Fixed with a topological sort over `pg_constraint`.

All three share a failure mode: **a check that cannot fail looks identical to a check that
passes.** Every gate in this wave now has a test proving it can go red.

---

## The seven mandated failure scenarios

| # | Scenario | Result |
|---|---|---|
| 1 | Duplicate webhook | **PASS** — deduped on `(provider, providerEventId)`; projection idempotent; cross-provider ids stay separate |
| 2 | Out-of-order webhook | **PASS** — terminal success cannot regress; `OUT_OF_ORDER` and `STALE_VERSION` distinguished; unmapped status → `UNKNOWN`, never success |
| 3 | Provider timeout | **PASS** — lands in `UNKNOWN` not `FAILED`; audited `OPERATION_UNKNOWN`; a definitive 4xx still yields `FAILED` |
| 4 | Ambiguous success | **PASS** — `CONFIRMED_APPLIED` never retries; failed probe → `STILL_UNKNOWN`, never optimistic; retry reuses the same idempotency key |
| 5 | Concurrent approval | **PASS** — two concurrent identical releases produce **exactly one** provider write; self-approval refused; threshold release blocked *before* the provider call |
| 6 | Cross-tenant access | **PASS** at the domain/durable layer (gaps documented separately) |
| 7 | Restore + smoke test | **PASS** — executed by `scripts/dr-restore-drill.mjs` |

Scenario 4 is the one that matters most. A blind `UNKNOWN → EXECUTING` retry pays a recipient
twice; `guardUnknownRetry()` makes that unreachable without a recorded provider verdict.

---

## Performance (Tier 1, measured)

Intel Xeon @ 2.60GHz, 2 cores, 3.85 GB, Node v22.22.3 — a floor, not a production figure.

| Records | Invariant checker (mean / p95) | Reconciliation (mean / p95) |
|---|---|---|
| 100 | 0.07 ms / 0.10 ms | 0.15 ms / 0.36 ms |
| 1 000 | 0.30 ms / 0.59 ms | 1.00 ms / 1.57 ms |
| 10 000 | 2.84 ms / 4.40 ms | 14.22 ms / 31.28 ms |

**Both LINEAR** (per-record cost ratios 0.42 and 0.93 across a 100x size increase). This is the
number that decides whether these checks survive contact with a growing ledger: an O(n²) invariant
checker is one you quietly stop running exactly when you need it most.

**NOT_RUN:** Tier 2 HTTP load test (no load generator available — deferred rather than faked),
Postgres-backed throughput, concurrent-writer contention.

---

## Review across the five axes

**Correctness.** Money is integer minor units end to end; cross-currency operations throw rather
than convert; zero-decimal currencies (IDR/JPY/VND) handled explicitly. Invariants report rather
than repair, preserving evidence. Every checker has a test proving it can fail.

**Security.** The tenant primitive makes reads return ∅ and writes throw — the asymmetry avoids an
enumeration oracle while refusing to let a bug corrupt a neighbour's book. AI tool governance is
fail-closed: an unknown tool is classified `WRITE_MONEY` and blocked, because guessing "read"
wrongly means an autonomous money movement while guessing "money" wrongly means an unnecessary
question. Approvals bind to an args hash, so approving "refund 50 000" cannot be replayed for a
different amount.

**Reliability.** Ambiguous outcomes are separated from failures throughout. A failed probe never
resolves to "nothing happened". Retries reuse the stable idempotency key so provider-side dedupe
still protects us if our verdict is wrong. DR is proven by execution.

**Performance.** Linear scaling measured, not assumed.

**Maintainability.** Each module is one concern with a docblock explaining *why*, not what. The
`CURRENT GAP` probes are tripwires that force the reports to be updated when the gaps close.

---

## What I would not ship without saying

1. **Tenant isolation is not done.** Three surfaces isolate correctly; the 20 legacy in-memory
   modules cannot isolate at all because no function accepts an organization. See
   `TENANT_ISOLATION_REPORT.md`.
2. **INV-L1 is `NOT_APPLICABLE`, not passing.** There is no double-entry table. Reporting a green
   double-entry check over zero postings would be a lie.
3. **INV-L7 cannot fail on real data.** `tx.events` is prose, not a typed state log. Unit-tested,
   not live.
4. **INV-L2 is masked upstream.** `server/data/*` clamps `refundedAmount` with `Math.min(...)`, so
   an over-refund is hidden before the checker sees it.
5. **Production RPO ≈ 24 h.** PITR is off. The drill's 0.044 s RPO is an artefact of backing up
   immediately after seeding; only backup configuration can improve the real number.
6. **SLOs are computable, not running.** The maths is tested; no live pipeline feeds it.
7. **Nothing is wired into the UI.** This wave is a correctness substrate. The reconciliation
   engine, case machine and SLO library have no screens yet — by design, since the brief was
   explicitly "not new UI".

## Deliverables

| Document | Contents |
|---|---|
| `WAVE_6_PLAN.md` | The plan (10 areas, T1–T14, gate definitions) |
| `FINANCIAL_INVARIANTS.md` | INV-L1..L8, coverage and non-coverage |
| `RECONCILIATION_RUNBOOK.md` | 8 exception types, triage order, ambiguous-operation procedure |
| `SLO_SLI_ERROR_BUDGET.md` | 6 SLOs, budget maths, release gate |
| `DR_RESTORE_REPORT.md` | Executed drill, measured RTO/RPO, two defects found |
| `TENANT_ISOLATION_REPORT.md` | Measured matrix, the failing gate, Wave 7 plan |

## Recommended next steps

1. Wave 7 slice-by-slice tenant retrofit (one `server/data/*` module per PR).
2. Remove the `Math.min` refund clamp so INV-L2 can see reality.
3. Enable PITR or record the 24 h RPO as an accepted decision in an ADR.
4. Emit typed status transitions so INV-L7 goes live.
5. Add a provider-vs-ledger divergence check to `getBalanceOverview()`.
6. Run the DR drill in CI — it takes ~5 s and has already caught two real bugs.
