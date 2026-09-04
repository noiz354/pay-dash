# Wave 0 Persistence Verification Matrix

> Scope: provider-connections verification evidence + provider-secrets / durable-operations / audit-ledger / webhook-ingress persistence tables
> Method: real Postgres engine via `@electric-sql/pglite` (embedded, WASM) — no Prisma engine download or external server required; the **full Prisma migration chain** is applied to a fresh DB in-memory.

## Why PGlite

The Prisma CLI engine binary cannot be downloaded in this sandbox (`binaries.prisma.sh` is blocked) and no PostgreSQL server is present. `@electric-sql/pglite` runs a real Postgres engine in WASM and accepts standard Postgres DDL, so the migration SQL can be executed and its constraints verified without either. It was installed as a devDependency in `apps/web` and works in the repo's vitest environment.

## Commands

```bash
corepack pnpm test -- src/server/repositories/wave0-persistence.integration.test.ts
corepack pnpm exec tsc --noEmit
corepack pnpm exec eslint src/server/repositories/operation-identities.ts src/server/repositories/webhook-deliveries.ts src/server/repositories/wave0-persistence.integration.test.ts
```

## Results (2026-09-04, +07:00)

- **Integration test:** 10 passed (applies the full migration chain from a clean DB).
- **Typecheck:** `tsc --noEmit` exit 0.
- **Lint:** `eslint` exit 0.

## What is verified (real Postgres constraints)

| Constraint | Test |
|---|---|
| Full migration chain applies cleanly to a fresh DB | `beforeEach` runs all migrations in order |
| Wave 0 tables created (`SecretRecord`, `DurableOperation`, `AuditEvent`, `WebhookDelivery`) | `creates all Wave 0 tables` |
| Connection `mode` CHECK (`TEST`/`LIVE`) rejects invalid | `rejects an invalid connection mode` |
| Secret per connection/mode unique (TEST + LIVE coexist) | `enforces connection-scoped unique secret per mode` |
| Secret `mode` CHECK rejects invalid; provider format regex | `rejects invalid secret mode` |
| `DurableOperation.idempotencyKey` unique | `enforces idempotency-key uniqueness` |
| `DurableOperation.state` CHECK enum | `rejects an out-of-enum operation state` |
| `AuditEvent.eventId` unique + `outcome` CHECK | `enforces audit event id dedupe and outcome enum` |
| `WebhookDelivery(provider, providerEventId)` unique + provider CHECK | `enforces webhook provider/event dedupe` |
| `ON DELETE RESTRICT` prevents deleting a referenced connection | `uses restrictive deletion` |
| Exact Decimal(20,4) sums without float drift | `stores exact decimal amounts` |

## Repository contracts added

- `src/server/repositories/operation-identities.ts` — durable operation identity, stable idempotency key, request-hash mismatch guard, validated state transitions.
- `src/server/repositories/webhook-deliveries.ts` — provider-scoped dedupe key, duplicate classification, allowed-provider guard.

## Schema/migration artifacts

- `apps/web/prisma/schema.prisma` — extended `PaymentProviderConnection` with `capabilityManifest`, `requirements`, `webhookHealthStatus`, `lastVerifiedAt`, `createdByUserId`, `updatedByUserId`; added `SecretRecord`, `DurableOperation`, `AuditEvent`, `WebhookDelivery`.
- `apps/web/prisma/migrations/20260904000000_add_wave0_foundation_persistence/migration.sql` — additive DDL mirroring the schema, validated by the PGlite integration run.

## Remaining / not verified here

- `prisma validate` / `prisma generate` / `prisma migrate status` could **not** be run (engine download blocked). The migration SQL is verified directly via PGlite, but the Prisma client generation and any Prisma-specific check must be re-run in a Prisma-enabled environment (CI/local with network to `binaries.prisma.sh`).
- The repository **implementations** are contracts + validation only (consistent with the repo's existing `provider-domain` repositories, which also do not touch the Prisma client directly). Wiring them to the generated Prisma client is a downstream step once `prisma generate` is available.
