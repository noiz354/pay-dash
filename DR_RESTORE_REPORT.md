# Disaster Recovery Restore Report

Wave 6 · `scripts/dr-restore-drill.mjs` · evidence: `docs/evidence/dr-drill.json`

A backup that has never been restored is a hypothesis, not a backup. This drill was **executed**,
not described.

```
node scripts/dr-restore-drill.mjs --out docs/evidence/dr-drill.json
```

---

## Result: **PASS**

| Step | Measured |
|---|---|
| BUILD — apply 12 migrations | 2 982 ms |
| SEED — 9 financial rows across 4 tables | 15 ms |
| BACKUP — logical dump | 46 916 bytes, 9 rows, 29 ms |
| DESTROY — full engine teardown | 3 ms |
| **RESTORE — replay dump into an empty engine** | **2 001 ms** |
| VERIFY — checksum + constraint smoke test | 14 ms |

### Objectives

| Objective | Measured | Interpretation |
|---|---|---|
| **RTO** (restore + verify) | **2.015 s** | Procedure-level recovery time |
| **RPO** (backup lag) | **0.044 s** | Drill-level only — see the caveat below |

### Integrity

| Checksum | Before | After |
|---|---|---|
| `DurableOperation` rows | 3 | 3 |
| `WebhookDelivery` rows | 2 | 2 |
| `AuditEvent` rows | 2 | 2 |
| **Σ `amountMinor`** | **46 700 000** | **46 700 000** |
| Tables | 32 | 32 |
| Indexes | — | 102 |

Smoke test on the restored database:

- `DurableOperation.idempotencyKey` unique index — **present**
- `WebhookDelivery (provider, providerEventId)` unique index — **present**

That second class of check is the point. A restore that brings back every row but loses a unique
index has restored the data and silently removed the protection against double-processing. Row
counts alone would have called that a success.

---

## What the drill actually destroys

The database is **torn down completely**, not truncated. A drill that rehearses a gentler failure
than the one it claims to cover is theatre.

## Two real defects this drill found

Both were found by running it, and neither would have been visible in a written procedure.

**1. The dump was not foreign-key ordered.** The first execution failed with:

```
Restore failed: insert or update on table "AuditEvent"
violates foreign key constraint "AuditEvent_organizationId_fkey"
```

Tables were dumped alphabetically, and `AuditEvent` sorts before `Organization`. A backup whose
rows cannot be replayed in dependency order is not a usable backup. Fixed with a Kahn
topological sort over `pg_constraint` (self-references ignored; any residual cycle is appended
and reported rather than dropped).

**2. The drill was vacuous.** The first version seeded rows generically from
`information_schema`; every insert bounced off a foreign key or check constraint, and the drill
cheerfully "restored" **0 rows** and reported PASS. It now uses an explicit, referentially-valid
financial fixture and **fails loudly** if the control data is empty:

```
if (seededRows === 0 || Number(before.__amountMinorTotal) === 0) → FAIL
```

A green result that proves an empty database can be recreated is worse than no result.

---

## Honest limits of this evidence

| Claim | Status |
|---|---|
| The restore **procedure** works end to end | **Proven** |
| Schema, constraints and unique indexes survive a restore | **Proven** |
| Financial row counts and totals survive exactly | **Proven** |
| Production RTO on Cloud SQL | **NOT proven** — measured on PGlite in a 2-core sandbox |
| Production RPO | **NOT proven** — see below |
| Restore under load, or with a corrupt/partial backup | **NOT tested** |
| Cross-version / cross-engine restore | **NOT tested** |

### The production RPO is not 0.044 s

The measured RPO is an artefact of a drill that backs up immediately after seeding. The real
figure is bounded by the backup schedule:

> **PITR is OFF. Worst-case production RPO ≈ 24 hours.**

This has never been recorded as an accepted decision anywhere in the repository. It is recorded
here so it becomes a choice rather than an accident. Until PITR is enabled, up to a day of
financial data is at risk, and no restore drill can improve that number — only the backup
configuration can.

## Recommendations

1. **Enable PITR** on the production database, or explicitly accept the 24 h RPO in an ADR.
2. **Run this drill in CI** on a schedule; it takes ~5 s and it has already caught two real bugs.
3. **Repeat against real Postgres + `pg_dump`** once engines are available — PGlite validates the
   logical shape, not the production toolchain.
4. **Add an application-level smoke test** after restore (boot the app, hit `/api/health`, run
   `checkLedgerInvariants`) so recovery is verified at the behaviour level, not just the schema.
