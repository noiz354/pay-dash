# Provider Connections Verification Matrix

> Module: `provider-connections`
> Specification: `docs/spec/SPEC-provider-connections.md`
> Scope: implementation evidence — foundation slice (state machine, capability manifest, provider registry)

## Automated evidence (unit tests, no external network)

Run in the `apps/web` workspace:

```bash
corepack pnpm test -- src/domain/payments/connection.test.ts src/domain/payments/capabilities.test.ts src/server/providers/registry.test.ts
corepack pnpm exec tsc --noEmit
corepack pnpm exec eslint src/domain/payments/connection.ts src/domain/payments/capabilities.ts src/domain/payments/connection.test.ts src/domain/payments/capabilities.test.ts src/server/providers/registry.ts src/server/providers/registry.test.ts
```

## Results (2026-09-03, +07:00)

- **Focused tests:** 24 passed across 3 files (`connection` 6, `capabilities` 7, `registry` 11).
- **Full suite:** 362 passed / 2 failed (only the two pre-existing `getBalanceTrend` failures in `src/server/data/balance.test.ts`; the previously flaky `balance-dialogs` test passed). No new regressions.
- **Typecheck:** `tsc --noEmit` exit 0.
- **Lint:** `eslint` exit 0 on all new files.
- **Provider SDK boundary:** `registry.ts` imports only `server-only`, domain modules, and Zod; a unit test asserts no `xendit-node` / `stripe` import.

## Requirement → evidence

| Requirement | Evidence |
|---|---|
| Allowed transitions validated | `connection.test.ts` valid/invalid/REVOKED-terminal cases |
| Status union covers full state machine | `connection.ts` `ConnectionStatusSchema` (11 statuses) + test |
| `ACTIVE` only services operations | `canServiceConnection` + test |
| Canonical 12 capability keys | `CAPABILITY_KEYS` (12) + test |
| Strict manifest (rejects unknown keys / secret fields) | `capabilities.test.ts` unknown-key and pan/secret tests |
| `available` = supported && configured && no blocking reqs | `deriveCapabilityState` + tests |
| Unsupported never becomes available | `capabilities.test.ts` supported:false test |
| Server-only registry, no SDK import | `registry.ts` + source-boundary test |
| Register/resolve by provider key | `registry.test.ts` |
| Duplicate provider registration rejected | `registry.test.ts` |
| Unknown provider → typed error | `registry.test.ts` |
| Capability gate: no fake fallback | unsupported + not-configured tests |
| Invalid manifest rejected | `validateManifest` → `INVALID_MANIFEST` (unit-verified via registry path) |

## Environment constraint / outstanding

- The Prisma schema engine binary could **not** be downloaded in this sandbox (network to `binaries.prisma.sh` is blocked) and no PostgreSQL service is available. Therefore:
  - `prisma validate` / `prisma generate` / `prisma migrate` and DB-backed integration tests **were not run** here.
  - The durable connection fields (capability manifest, requirements, webhook-health, `lastVerifiedAt`, created/updated-by) are specified in `SPEC-provider-connections.md` §"Persistence follow-up" and remain the immediate next implementation artifact, to be applied via a reviewed migration in an environment with the Prisma engine.
  - No secret is stored; no provider SDK call is made; no financial write occurred.

## Scope boundaries verified

- No page, component, server action, or route was changed.
- No provider SDK imported outside `apps/web/src/lib/xendit.ts`.
- No connection is `ACTIVE` in this slice; the registry only resolves adapters that will be registered by the `xendit-adapter` / `stripe-adapter` modules.
