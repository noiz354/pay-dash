# ADR-0003: PostgreSQL + Prisma

Date: 2026-08-30
Status: Accepted

## Context
Payment/ledger flows need relational invariants (`INTEGRATION.md:32-41`, payout `idempotencyKey` at `INTEGRATION.md:222`). No DB exists yet (`AGENTS.md:4`). Stack plan recommends Postgres + Prisma.

## Decision
We will use PostgreSQL (Neon/Supabase/Prisma Postgres or local) with Prisma. `lib/db/prisma.ts` singleton. Migrations via `prisma migrate deploy` for staging/production, `prisma migrate dev` locally. `DATABASE_URL` validated via `@t3-oss/env-nextjs` (Zod).

## Consequences
Positive: type-safe client, migration history, fits `forUserId` multi-tenant pattern (`INTEGRATION.md:335`). Negative: Prisma engine binary size; requires careful `prisma generate` in CI.

## Alternatives Considered
Drizzle — lighter, but Prisma has broader Xendit-recipe examples. MySQL/PlanetScale — viable but Postgres full-text search defers need for external search.

## Verification
`pnpm prisma migrate dev`, `pnpm build` includes `prisma generate`, `GET /api/balance` returns live `xenditClient.Balance.getBalance()` data.
