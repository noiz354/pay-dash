# Wave 6 Plan — Financial Correctness, Recoverability, Tenant Safety, Operability

> **Charter.** Wave 6 adds **no new UI surface**. Its only goal is to make four claims defensible
> with executed evidence: PayDash is **financially correct**, **recoverable**, **observable**,
> **tenant-safe**, and **operable during a real failure**.
>
> **Evidence rule (non-negotiable).** No area may be marked PASS without an artifact that was
> actually produced in this wave: a test run, a log line, a metric computation, a restore
> execution, or a benchmark. `NOT_RUN`, `BLOCKED_BY_ENVIRONMENT` and `FAIL` are acceptable
> outcomes; a fabricated PASS is not.
>
> Baseline at plan time (executed 2026-09-12, this sandbox):
> `npx vitest run` → **1075 tests passed / 112 suites, 1 suite failed**
> (`src/server/mcp/server.integration.test.ts` — `@prisma/client did not initialize yet`;
> `prisma generate` cannot reach `binaries.prisma.sh` from this sandbox). That single failure is a
> pre-existing environment dependency, recorded, not hidden.

---

## 0. Method

Addy Osmani loop, one pass per task: `/spec → /plan → /build → /test → /review → /ship`.
Every task is a **vertical slice**: domain rule → server seam → test → evidence. No mega-diff.
Backend is the authoritative boundary — nothing in Wave 6 trusts a browser-supplied value.

**Stack discipline (ADR-0001/0002/0003):** zero new frameworks or vendors. Everything below is
built with TypeScript + Zod + Vitest + PGlite + the existing Prisma schema. PGlite is already a
devDependency and already used by two integration suites, so the DR drill introduces no new
dependency.

### Naming and ownership

| Layer | Path | Rule |
|---|---|---|
| Pure domain (no I/O) | `apps/web/src/domain/finance/*` | Deterministic, integer minor units, unit-tested in isolation |
| Tenant guard | `apps/web/src/domain/security/tenant.ts` | Every cross-record read passes through it |
| AI governance | `apps/web/src/domain/ai/governance.ts` | Classifies tool calls; owns the approval boundary |
| Server orchestration | `apps/web/src/server/finance/*` | Binds domain to the existing stores; `server-only` |
| SLO/SLI | `apps/web/src/lib/slo.ts` | Client-safe (dashboards may read it later) |
| Operational scripts | `apps/web/scripts/*.mjs` | Executable evidence producers |

---

## 1. Financial reconciliation engine (internal ledger ↔ provider ↔ settlement)

**Problem.** The app derives balance, payouts and transactions from its own stores
(`server/data/balance.ts` header: *"the single derivation behind every figure on the page"*).
There is **no comparison against the provider at all**. If Xendit says a payment settled and the
internal ledger says it did not — or vice versa — nothing in the codebase notices. A dashboard
that can only agree with itself is not reconciled; it is self-consistent, which is a weaker claim.

**Current evidence.**
- `grep -rli "reconcil" apps/web/src` → 9 hits, **all** in comments/ADRs. No reconciliation code.
- `server/data/balance.ts:270 getBalanceOverview()` prefers a live provider `available` figure but
  performs **no** comparison with the derived figure — divergence is silently overwritten.
- `docs/AUDIT_DATA_SOURCES.md`: the dashboard stores are in-memory `globalThis`; only auth,
  webhook ingress and the AI journal touch Postgres.

**Invariant.**
> **INV-R1** For every org and window, every money-moving record exists on exactly one of three
> sides (internal ledger, provider, settlement) *or* on all three with identical
> `(amount_minor, currency, terminal_status)`. Any other arrangement is a **reconciliation
> exception** and must be emitted as a case — never silently resolved, never auto-corrected.

**Risk.** Undetected revenue leakage; a payout marked PAID internally that the bank rejected;
double-counted settlements after a webhook replay. Financial-statement risk, not UI risk.

**Proposed design.** `domain/finance/reconciliation.ts` — a pure three-way matcher.
Input: three normalized `ReconRecord[]` sides keyed by `(orgId, externalRef)`.
Output: `ReconciliationRun { runId, orgId, window, matched, exceptions[], totals }` with a closed
exception vocabulary: `MISSING_INTERNAL`, `MISSING_PROVIDER`, `MISSING_SETTLEMENT`,
`AMOUNT_MISMATCH`, `CURRENCY_MISMATCH`, `STATUS_MISMATCH`, `DUPLICATE_PROVIDER`, `STALE_PENDING`.
All arithmetic in **integer minor units** (`bigint`-safe strings in, numbers never floated).
Server seam `server/finance/reconcile-run.ts` builds the internal side from the existing stores and
the provider side from `provider-read` — with **no connection it returns `UNAVAILABLE`, never an
empty provider side** (an empty side would manufacture `MISSING_PROVIDER` exceptions for every row).

**Alternatives.**
1. *Two-way (internal ↔ provider) only* — rejected: settlement is where the money actually lands;
   a provider "PAID" that never settles is the exact failure operators care about.
2. *SQL-only reconciliation view* — rejected: the internal side is currently in-memory, and a pure
   function is testable without a database and portable when the stores move to Prisma.
3. *Auto-correct on mismatch* — rejected outright (ADR-0039 precedent): never auto-apply.

**Tests (TDD).** Matched three-way; amount mismatch by 1 minor unit; currency mismatch;
provider duplicate; internal-only; provider-only; settlement-only; stale pending past window;
empty-vs-empty is `matched: 0, exceptions: 0`; `UNAVAILABLE` provider side yields **no** exceptions;
determinism (same input twice → identical run hash).

**Observability.** `reconciliation_run` structured log (`pino`): `run_id, org_id, window,
matched, exceptions_by_type, duration_ms`. SLI `reconciliation_exception_rate` feeds §5.

**Rollback.** Read-only module — no writes, no migrations. Delete the two files; nothing else
imports them. Zero blast radius.

**Acceptance criteria.** Engine is deterministic; all 8 exception types reproduced by a test;
no floating-point arithmetic in the module (`grep` gate in review); `UNAVAILABLE` provider side
proven to emit zero exceptions.

---

## 2. Ledger invariant checker

**Problem.** The financial rules exist only as scattered imperative guards
(`actions/transactions.ts:127` remaining-refund check, `payouts.ts` approvability). There is no
single artifact that says "these are the laws of this ledger" and can be executed against a
snapshot. `grep -rli "invariant" apps/web/src` → 4 hits, all in `command-center`/`handoff`.

**Current evidence.**
- `LedgerEntry` (Prisma) is a **single-sided** row: `amount Decimal(15,2)`, no debit/credit pair,
  no account. Double-entry is not representable today.
- `balance.ts:145 effectOf()` implements the balance rule in one place — good — but nothing
  *asserts* the result (e.g. that `available` can never go negative).
- `transactions.ts:612` clamps with `Math.min(tx.amount, tx.refundedAmount + amount)` — a clamp
  **hides** an over-refund rather than rejecting it.

**Invariant.** The checker is the invariant list itself:

| ID | Rule |
|---|---|
| **INV-L1** | Double entry: for every posting group, `Σ debit == Σ credit` (per currency) |
| **INV-L2** | `Σ refunds(payment) ≤ captured(payment)` — over-refund is an error, not a clamp |
| **INV-L3** | `Σ payouts_reserved + Σ payouts_paid ≤ opening + settled_inflow − settled_outflow` |
| **INV-L4** | `available == opening + Σ settled − Σ reserved` (the balance derivation, asserted) |
| **INV-L5** | `available ≥ 0` and `reserved ≥ 0` |
| **INV-L6** | No cross-currency arithmetic: every aggregation is per-currency |
| **INV-L7** | Terminal monotonicity: `SUCCEEDED/FAILED/CANCELLED` never transition onward |
| **INV-L8** | Every amount is an integer in minor units (no float, no rounding drift) |

**Risk.** Silent clamps and float drift are how real ledgers lose money. A clamp converts a bug
into a wrong-but-plausible number, which is worse than an exception.

**Proposed design.** `domain/finance/invariants.ts` exporting
`checkLedgerInvariants(snapshot): InvariantReport` with `{ ok, violations[{code, severity,
subject, expected, actual}] }`. Severity `FATAL` (money is wrong) vs `WARN` (shape is suspicious).
`server/finance/snapshot.ts` builds a `LedgerSnapshot` from the existing stores — the seam that
will point at Prisma unchanged when the stores migrate (ADR-0027 forward path).

**Alternatives.**
1. *Database CHECK constraints* — rejected as the primary mechanism: the authoritative stores are
   in-memory today, and cross-row rules (L2/L3/L4) are not expressible as portable CHECKs. The
   existing migration CHECKs stay as defence in depth.
2. *Assertions inside each mutation* — rejected as the only mechanism: they cannot detect drift
   that accumulated before the assertion existed. A snapshot checker can.

**Tests (TDD).** One failing-then-passing test per INV-L1..L8, plus: balanced snapshot is `ok`;
over-refund by 1 minor unit is FATAL; negative available is FATAL; mixed-currency aggregation is
rejected; float input (`0.1 + 0.2`) is rejected by L8; the **real seeded store** passes the checker.

**Observability.** `ledger_invariant_check` log with `violations_by_code`; SLI
`invariant_violations_total` (target: 0 FATAL, always).

**Rollback.** Pure function, no writes. Delete the file.

**Acceptance criteria.** 8/8 invariants covered by tests; the live seeded snapshot is checked in
CI and reported honestly (a violation found in the real seed is **published**, not suppressed).

---

## 3. Multi-tenant isolation suite (API, exports, search, MCP, AI, webhook logs)

**Problem.** `server/services/org-context.ts` resolves a real `OrgContext` with a documented
`isDemoFallback`, and `export-guard.ts` is fail-closed on **authn/authz**. But the data functions
those guards protect **take no `organizationId` at all**:
`grep -Ln "organizationId" src/server/data/*.ts` → **every** data module. `getLedgerRows()`,
`getPayoutBatches()`, `listAuditEvents()` read one process-wide singleton.

**Current evidence.**
- `guardExport()` returns `{ ok: true, organizationId }` — and **no caller uses the returned
  `organizationId`** (verified in `api/exports/transactions/route.ts`, `.../audit/route.ts`).
  The guard proves *who you are*; the query then ignores *which tenant you are*.
- `recordWebhookDelivery()` writes `organizationId: "unresolved"` for every inbound event.
- `authorizeMcpRequest()` is a single global bearer token with **no org binding at all**, and
  compares with `!==` (not constant-time — `KNOWN_DEBT_REGISTER` D-08).
- AI journal *is* correctly isolated (`users/{uid}/interactions`, Firestore rules) — the one
  surface that already passes.

**Invariant.**
> **INV-T1** Every read and write that returns tenant data takes an `organizationId` derived from
> the **session**, and returns ∅ (not an error leaking existence) for a foreign tenant's id.
> **INV-T2** No cross-tenant identifier is ever accepted from the browser, a URL, an export
> parameter, an MCP argument, or an AI tool call.

**Risk.** P0. In a genuinely multi-tenant deployment, any authenticated user of org A would read
org B's ledger through `/api/exports/transactions`. Today this is masked only because the
deployment is single-tenant with a demo fallback — an operational accident, not a control.

**Proposed design.**
1. `domain/security/tenant.ts` — `TenantScope` value object + `assertTenantMatch(scope, record)` +
   `scopeFilter(scope)`; foreign-tenant reads return empty, foreign-tenant **writes** throw
   `TenantIsolationError` (deny + audit, never a silent no-op).
2. All **Wave 6** surfaces (reconciliation, cases, SLO, synthetic) are org-scoped from birth.
3. A **probe suite** (`tenant-isolation.test.ts`) that enumerates each surface and records the
   actual, measured behaviour — PASS or FAIL. The legacy in-memory data layer is expected to
   **FAIL** and that FAIL is published in `TENANT_ISOLATION_REPORT.md` with the exact remediation.

**Alternatives.**
1. *Retrofit `organizationId` into all 20 in-memory data modules now* — rejected for this wave:
   a 20-file mega-diff across every screen contradicts the reviewability rule and would land
   untested. Wave 6 delivers the **primitive + the measured truth**; the retrofit is Wave 7 with
   its own slice per module.
2. *Row-level security in Postgres* — correct long-term destination, blocked until the data layer
   is on Prisma (D-09). Recorded as the Wave 7 design.

**Tests.** Per surface: same-tenant read returns data; cross-tenant read returns ∅; cross-tenant
write throws and emits an audit event; MCP token bound to org rejects a foreign org argument;
webhook delivery for an unresolvable org is quarantined rather than attributed.

**Observability.** `tenant_isolation_denied` audit action with `{surface, requested_org,
actor_org}`. Any occurrence in production is an incident, not a metric.

**Rollback.** Guard is additive; new surfaces only. Legacy paths are untouched by design.

**Acceptance criteria.** A published per-surface PASS/FAIL matrix backed by executed tests.
A FAIL row with an owner and a Wave 7 ticket is an acceptable wave outcome; an **unmeasured** row
is not.

---

## 4. Ambiguous success / idempotency under lost responses

**Problem.** `payment-flow.ts` already models this well: `isAmbiguousOutcome()` maps
`TIMEOUT|UNAVAILABLE|IDEMPOTENCY_CONFLICT` to state `UNKNOWN` and audits `OPERATION_UNKNOWN`
(strong design). But **nothing ever resolves an `UNKNOWN`**. There is no reconciler that asks the
provider "did that write actually land?", and `transitionOperation` permits `UNKNOWN → EXECUTING`,
i.e. a **blind retry of a possibly-completed money movement**.

**Current evidence.**
- `domain/payments/operations.ts:29` — `UNKNOWN: ["EXECUTING","SUCCEEDED","FAILED","CANCELLED"]`.
  The unguarded `UNKNOWN → EXECUTING` edge is the double-payment path.
- `operations.ts` docblock states the intended rule — *"ambiguous outcome is reconciled before any
  retry"* — but no code implements the reconcile step.
- Two idempotency implementations coexist: the durable, correct one
  (`repositories/operation-identities.ts`, DB-unique `idempotencyKey`) and a legacy in-memory one
  (`server/data/idempotency.ts`, `Map`, never awaited by the money paths). Duplication invites a
  future caller to pick the weak one.

**Invariant.**
> **INV-I1** An operation in `UNKNOWN` may only leave that state via a **provider-confirmed**
> outcome. `UNKNOWN → EXECUTING` requires a recorded reconciliation verdict; without one the
> transition is refused.
> **INV-I2** Same idempotency key + same request hash → replay the first result, never a second
> provider write. Same key + different hash → `CONFLICT`, never a write (ADR-0036).

**Risk.** A timeout on a IDR 100 M payout followed by an operator clicking "retry" pays twice.
This is the single highest-severity defect class in the repository.

**Proposed design.** `server/finance/unknown-recovery.ts`:
`resolveUnknownOperation(op, probe)` where `probe` queries the provider by the **stable
idempotency key**. Verdicts: `CONFIRMED_APPLIED → SUCCEEDED`, `CONFIRMED_ABSENT → retry allowed`,
`STILL_UNKNOWN → stays UNKNOWN, opens a case (§7), never retried automatically`.
`guardUnknownRetry()` is the hard gate wired in front of the state machine.

**Alternatives.**
1. *Always retry on timeout* — rejected: doubles money.
2. *Never retry, always manual* — rejected: a confirmed-absent operation should self-heal;
   manual-only converts a solved problem into an SLA backlog.

**Tests (mandated by the brief).** duplicate webhook; out-of-order webhook; provider timeout;
ambiguous success (provider applied, response lost) → **no second write**; concurrent approval
(two actors, one row) → exactly one wins; same-key-different-payload → `CONFLICT`;
`UNKNOWN → EXECUTING` without a verdict → refused.

**Observability.** `operation_unknown_total`, `unknown_resolution_seconds`,
`ambiguous_retry_blocked_total`. `UNKNOWN` older than 15 min is an SLO burn event.

**Rollback.** The guard is a new function; reverting restores today's (unsafe) behaviour. The
state machine change is additive and covered by tests.

**Acceptance criteria.** All seven mandated scenarios executed and green; a blind
`UNKNOWN → EXECUTING` is provably impossible.

---

## 5. Business SLO / SLI + error budget

**Problem.** Observability exists as *plumbing* (Sentry, OTEL, pino, `track()`, Web Vitals) but
there is no **business** SLO. `lib/sla.ts` defines per-item operational commitments (approve within
4 h), which is a queue-ageing model, not a service objective with an error budget.
`grep -rli "error budget" apps/web/src` → 0.

**Current evidence.** `lib/sla.ts` `SLA_POLICIES` (10 entity types, good); `sla-telemetry.ts`
emits `sla_breached` exactly once per item/band (good). Nothing aggregates these into a rate,
a target, or a budget. D-11: events are emitted but no dashboard consumes them.

**Invariant.**
> **INV-S1** Every SLO states: SLI formula, target, window, and the **consequence** of exhausting
> the budget. An SLO without a declared consequence is decoration.

**Proposed design.** `lib/slo.ts` — declarative catalog + pure `evaluateSlo()` / `burnRate()`:

| SLO | SLI | Target | Window |
|---|---|---|---|
| Webhook ingestion | `2xx_verified / total_received` | 99.9 % | 28 d |
| Webhook processing latency | `p95(received→projected)` | < 60 s | 28 d |
| Payout release success | `released / (released + provider_failed)` | 99.5 % | 28 d |
| Refund dual-control latency | `p95(requested→decided)` | < 8 h | 28 d |
| Reconciliation cleanliness | `1 − exceptions / records` | 99.95 % | 7 d |
| Unknown-operation resolution | `resolved<15m / total_unknown` | 99 % | 28 d |
| Dashboard read availability | `2xx / total` on `/api/dashboard/*` | 99.9 % | 28 d |

Consequence: **> 2 × burn rate ⇒ feature freeze on money paths until the budget recovers.**

**Alternatives.** A vendor SLO product — rejected (ADR-0005: no new vendor; the events already
exist). Reusing `lib/sla.ts` — rejected: per-item ageing and service objectives are different
mathematics; conflating them was the original error.

**Tests.** Budget arithmetic; burn-rate windows; a breach of each SLO produces the right band;
zero-traffic windows do not report false 100 % (they report `INSUFFICIENT_DATA`).

**Rollback.** Pure library. No runtime coupling until a dashboard consumes it.

**Acceptance criteria.** Seven SLOs with formula + target + window + consequence, each unit-tested,
each computable from data the app **already** records.

---

## 6. Disaster recovery: restore drill with RPO/RTO evidence

**Problem.** `docs/DEPLOY_GCP.md:72` sets `--backup-start-time=02:00`;
`docs/DEPLOY_GCP_PRACTICES.md:33` states **PITR is disabled to save cost**. A backup that has never
been restored is a hypothesis. RPO/RTO are undeclared. `grep "restore"` → only "restore the env"
in the runbook.

**Current evidence.** Daily backup, PITR off ⇒ theoretical worst-case **RPO ≈ 24 h**, which is
almost certainly unacceptable for a payments ledger and has never been stated as a decision.
No restore has ever been executed in this repository.

**Invariant.**
> **INV-D1** A backup is valid only if a restore has been executed and the restored database
> **passes the §2 invariant checker** and a smoke test. Untested backups are assumed invalid.

**Proposed design.** `scripts/dr-restore-drill.mjs` — executable, no cloud account required:
1. apply the full `prisma/migrations` chain to a fresh PGlite instance (same technique as the two
   existing integration suites);
2. seed a known financial fixture (org, connection, payments, refunds, payout batch, webhook
   deliveries, durable operations, audit events);
3. capture a logical dump + a content fingerprint (row counts + money checksums);
4. destroy the instance (simulated loss);
5. restore into a fresh instance and **measure RTO**;
6. verify: fingerprint equality, referential integrity, money checksum equality, invariant checker
   green, smoke queries;
7. emit `DR_RESTORE_REPORT.md` with measured numbers.

**Alternatives.** A real Cloud SQL PITR drill — correct and *necessary before production*, but
requires a GCP project and billing; not executable here. The script is written so the same
verification steps run against a `pg_restore`d Cloud SQL instance (documented procedure), and the
report states plainly which half was executed and which is pending.

**Tests.** The drill *is* the test; it exits non-zero on any mismatch and is runnable in CI.

**Observability.** Drill result + measured RTO recorded in the report and the runbook.

**Rollback.** Script only; touches no application code.

**Acceptance criteria.** A drill executed in this wave with real measured RTO and a byte-level
fingerprint match; declared RPO/RTO targets; the PITR-off gap escalated as a decision, not left
as a config detail.

---

## 7. Exception / case management

**Problem.** Exceptions are *displayed* (Command Center lanes) but not *owned*. There is no case
record with an id, an assignee, a state machine, an audit trail, or a resolution — so "who is
fixing this mismatch and what did they decide?" has no answer in the system.

**Current evidence.** `server/data/command-center.ts` aggregates six lanes from the same stores —
excellent for visibility, but every item is **derived and stateless**: acknowledging one leaves no
trace and it reappears on the next render.

**Invariant.**
> **INV-C1** Every reconciliation exception, payout failure, webhook processing failure and SLA
> breach produces exactly **one** case (idempotent on its subject key), and a case may only reach
> `RESOLVED` through a recorded actor + reason. A write-off resolution requires **dual control**
> (ADR-0035).

**Proposed design.** `domain/finance/cases.ts` — `Case { id, orgId, kind, severity, subjectKey,
openedAt, state, assigneeId, slaBand, resolution }`; states
`OPEN → ACKNOWLEDGED → (RESOLVED | WONT_FIX)`; `deriveCaseKey()` guarantees idempotency;
`resolveCase()` enforces actor-distinctness for `WRITE_OFF`.

**Alternatives.** An external ticketing integration — rejected (no new vendor; the audit trail
must live with the money). Extending Command Center items in place — rejected: derived items
cannot carry state.

**Tests.** Idempotent case creation from a repeated exception; illegal transitions refused;
write-off by the requester refused; resolution recorded with actor + reason; SLA band derived from
the existing `lib/sla.ts` policy (no second clock).

**Observability.** `case_opened` / `case_resolved` with `kind` and `time_to_resolve_seconds`.

**Rollback.** Additive module; no UI dependency in this wave.

**Acceptance criteria.** State machine fully tested; dual control on write-off proven; one
exception never produces two cases.

---

## 8. Scheduled provider synthetic tests

**Problem.** Provider health is only observed when a real customer transaction fails. There is no
probe. `grep -rli "synthetic"` → 2 hits, neither related.

**Current evidence.** `registry.invokeCapability()` has a capability gate but no health history;
`capabilityManifest.webhookHealth` exists as a field with no producer.

**Invariant.**
> **INV-P1** A synthetic probe is **read-only or self-cleaning** and is never counted as merchant
> revenue. Probe traffic must be attributable and excludable from every financial aggregate.

**Risk.** A probe that creates real payments pollutes the ledger and the reconciliation engine —
the cure becomes the disease.

**Proposed design.** `server/finance/synthetic.ts` — declarative probe catalog
(`balanceRead`, `transactionRead`, `webhookRoundTrip`, `capabilityManifest`), each with a latency
budget and an expected shape. `runSyntheticProbes(clock, registry)` returns
`ProbeResult[] { probe, ok, latencyMs, budgetMs, breached, error }`. Money-moving probes are
**forbidden by type** in this wave. Scheduling is Cloud Scheduler → a guarded internal endpoint
(documented; the endpoint itself is Wave 7 so this wave ships no new unauthenticated surface).

**Alternatives.** Probing in the money paths (piggyback) — rejected: mixes test and real traffic.

**Tests.** Budget breach detection; provider error classified, not thrown; no probe declares a
money-moving capability (type-level + runtime assertion).

**Observability.** `synthetic_probe_result` log; feeds the availability SLO in §5.

**Rollback.** Pure module, not yet scheduled. Zero production impact.

**Acceptance criteria.** Probe runner tested with a stub registry; the "no money-moving probe"
rule enforced by a test that fails if someone adds one.

---

## 9. AI-agent evals, tool-call correctness, human-approval boundary

**Problem.** The AI journal calls Gemini with function-calling enabled
(`gemini.ts:99 tools: [{ functionDeclarations: XENDIT_READ_FUNCTIONS }]`, `mode: "AUTO"`).
Today the catalog is read-only by *happenstance* — two read tools — not by an enforced boundary.
Nothing prevents a future contributor from adding `xendit_create_payout` to that array, and there
is no eval suite that would notice.

**Current evidence.** `XENDIT_READ_FUNCTIONS` = `xendit_get_balance`, `xendit_list_transactions`
(both read). `MCP` exposes `set_data_source` and `rotate_mcp_token` — **state-changing tools behind
a single global bearer token with no org binding and no audit** (D-06/D-07 open).
`getEvaluationSummary()` summarises *journal usage*, not *agent correctness*.

**Invariant.**
> **INV-A1** Every agent-invocable tool is classified `READ_ONLY`, `STATE_CHANGING` or
> `MONEY_MOVING`. An agent may auto-invoke only `READ_ONLY`. `STATE_CHANGING` requires an explicit
> human approval token bound to that call; `MONEY_MOVING` is **not agent-invocable at all** in this
> wave.
> **INV-A2** Every tool call is audited: tool, argument digest, outcome, actor, timestamp.

**Risk.** An LLM with an unclassified tool list is one merge away from moving money on a
hallucinated instruction.

**Proposed design.** `domain/ai/governance.ts` — `TOOL_CLASSIFICATION` registry,
`assertAgentMayInvoke(tool, { approval })`, `requiresHumanApproval(tool)`, plus a deterministic
eval harness `scoreToolCalls(fixtures, transcript)` measuring: correct-tool selection, no
unauthorised tool, argument validity, refusal correctness on out-of-scope prompts. Fixtures are
committed; the harness runs offline (no Gemini call, no flakiness, no cost) against recorded
transcripts.

**Alternatives.** LLM-as-judge evals — rejected for the gate: non-deterministic and cannot block a
release. Deterministic assertions gate; subjective quality can be judged separately later.

**Tests.** Unclassified tool → invocation refused (fail-closed); `MONEY_MOVING` refused even with
an approval token; `STATE_CHANGING` without a token refused, with a valid token allowed; eval
harness scores a known-good and a known-bad transcript correctly.

**Observability.** `agent_tool_invoked` + `agent_tool_refused` audit actions.

**Rollback.** Governance module is additive; Gemini path is only *asserted against* in tests until
Wave 7 wires the runtime call site.

**Acceptance criteria.** Fail-closed classification proven; an unclassified tool cannot be invoked;
eval harness produces a numeric score on committed fixtures.

---

## 10. Load / capacity benchmark

**Problem.** No capacity evidence exists anywhere in the repository. D-03 records that performance
budgets are unmeasured and the in-sandbox production build is blocked.

**Current evidence.** `KNOWN_DEBT_REGISTER` D-03 `BLOCKED_BY_ENVIRONMENT`; the sandbox has
**2 cores / 3 GB RAM**, and `next build` fetches Google Fonts at build time (D-14) — an HTTP load
test here would measure the sandbox, not the app.

**Invariant.**
> **INV-B1** A published performance number must state the machine, the input size and the method.
> A number without those three is not evidence.

**Proposed design.** Two honest tiers:
- **Tier 1 (executed here):** in-process benchmark of the new financial hot paths —
  invariant checker and reconciliation matcher at 1 k / 10 k / 100 k records — reporting
  throughput, p50/p95 latency and peak RSS. These are the algorithms that will run on every
  reconciliation cycle; their complexity must be proven sub-quadratic.
- **Tier 2 (specified, NOT_RUN here):** HTTP load profile (50/200/500 rps on
  `/api/dashboard/command-center` and `/api/webhooks/xendit`) with pass criteria, to be executed on
  a ≥ 8 GB CI host. Written as a runnable script + documented procedure; the report marks it
  `NOT_RUN — BLOCKED_BY_ENVIRONMENT` with the exact command.

**Alternatives.** Running Tier 2 here anyway — rejected: it would produce numbers that look like
evidence and are not.

**Tests.** The benchmark asserts a complexity bound (10× input ⇒ < 20× time) so a future
accidental O(n²) fails CI.

**Acceptance criteria.** Tier 1 executed with real numbers and machine specs; Tier 2 documented as
NOT_RUN with a reproducible command. No extrapolated numbers.

---

## Task breakdown (small, reviewable, one slice each)

| # | Task | Files | Depends | Reviewable size |
|---|---|---|---|---|
| T1 | Minor-unit money + `LedgerSnapshot` types | `domain/finance/money.ts`, `ledger.ts` | — | S |
| T2 | Invariant checker INV-L1..L8 + tests | `domain/finance/invariants.ts` | T1 | M |
| T3 | Snapshot seam over existing stores | `server/finance/snapshot.ts` | T2 | S |
| T4 | Reconciliation matcher + tests | `domain/finance/reconciliation.ts` | T1 | M |
| T5 | Tenant scope primitive + isolation probes | `domain/security/tenant.ts` | — | M |
| T6 | Unknown-operation recovery + idempotency gates | `server/finance/unknown-recovery.ts` | T1 | M |
| T7 | Failure-scenario suite (7 mandated scenarios) | `server/finance/failure-scenarios.test.ts` | T4, T6 | M |
| T8 | Case management state machine | `domain/finance/cases.ts` | T4 | M |
| T9 | SLO/SLI + error budget library | `lib/slo.ts` | — | M |
| T10 | Synthetic probe runner | `server/finance/synthetic.ts` | — | S |
| T11 | AI governance + eval harness | `domain/ai/governance.ts` | — | M |
| T12 | DR restore drill (executable) | `scripts/dr-restore-drill.mjs` | T2 | M |
| T13 | Benchmark tier 1 (executable) | `scripts/finance-bench.mjs` | T2, T4 | S |
| T14 | Reports + final gate | 6 markdown deliverables | all | M |

**Not in scope (explicitly deferred, with reasons).** Retrofitting `organizationId` into the 20
legacy in-memory data modules (Wave 7, one slice per module); Postgres RLS (blocked on D-09);
the guarded synthetic-probe HTTP endpoint (no new unauthenticated surface this wave); wiring the
governance gate into the live Gemini call site (Wave 7); MCP rate limiting + audit + constant-time
compare (D-06/D-07/D-08 — security slice of its own, not mixed into a financial wave).

## Gate definition (how each verdict is earned)

| Gate | PASS requires |
|---|---|
| Financial Correctness | INV-L1..L8 tested **and** the real seeded snapshot checked, result published |
| Tenant Isolation | Per-surface measured matrix; every row PASS **or** FAIL-with-owner; no unmeasured row |
| Idempotency | All 7 mandated failure scenarios executed green |
| Reconciliation | 8 exception types reproduced; determinism proven; `UNAVAILABLE` emits none |
| DR | A restore **executed** with measured RTO + fingerprint match |
| SLO/Observability | 7 SLOs defined, unit-tested, computable from existing signals |
| Load Test | Tier 1 executed with machine specs; Tier 2 documented NOT_RUN |
| AI Governance | Fail-closed classification proven; eval harness scores committed fixtures |

Overall: **READY** only if no gate is FAIL and every gate is measured. Any FAIL or unmeasured gate
⇒ **CONDITIONAL** or **BLOCKED**, stated plainly with the blocking row.
