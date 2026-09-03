# Provider Domain Verification Matrix

> Module: `provider-domain`  
> Specification: `docs/spec/SPEC-provider-domain.md`  
> Scope: implementation evidence through Task 16

## Automated and database evidence

| Requirement | Enforcement | Evidence |
|---|---|---|
| Organization ownership | Required organization FKs and composite topology FKs | Isolated PostgreSQL constraint runs for migrations 050000–080000 |
| Provider resource identity | Connection-scoped unique indexes | Duplicate/cross-connection database scenarios |
| TEST/LIVE separation | `PaymentProviderConnection_mode_check` | Invalid modes rejected; TEST/LIVE coexist |
| Exact money | Decimal(20,4), decimal-string boundary | Decimal unit tests and exact DB round trips |
| Safe unknown statuses | Canonical mapping defaults to `UNKNOWN` | `statuses.test.ts` |
| Payment origin immutability | One-to-one provider mapping and restrictive FKs | Duplicate origin mapping rejected |
| Refund origin routing | ProviderPayment/connection composite FK | Cross-connection refund rejected |
| Safe payment-method projection | Strict discriminated Zod union | Forbidden-field tests and DB topology tests |
| Dual subscription ownership | LocalSubscription plus versioned ProviderRecurringPlan | Plan replacement and mismatch tests |
| Payout attempts | Recipient/attempt unique constraints | Consecutive and duplicate-attempt tests |
| Transfer topology | Account/connection composite FKs | Cross-connection and same-account rejection |
| Split-rule versioning | Version uniqueness and repository immutability guard | DB constraints plus split repository tests |
| No hard-delete cascade | All module FKs use RESTRICT | Catalog inspection in isolated PostgreSQL |
| Scoped repository contracts | Organization required in lookup interfaces and strict scope parser | Repository policy tests/static review |
| Optimistic concurrency contract | Positive version fields and typed stale-version guard | `repository-policy.test.ts` |
| No SDK leakage | Provider-neutral types only | Static import search |

## Migration chain

1. `20260903050000_add_provider_identity`
2. `20260903060000_add_customer_payment_identity`
3. `20260903061000_add_refund_identity`
4. `20260903062000_add_payment_method_identity`
5. `20260903070000_add_recurring_identity`
6. `20260903071000_add_payout_identity`
7. `20260903072000_add_transfer_identity`
8. `20260903080000_add_split_rule_identity`

All eight migrations were independently reported as applied in order to fresh disposable PostgreSQL before Phase F. Final verification must repeat the chain at the Phase F commit.

## Compatibility

- Existing Better Auth models are not altered.
- Existing `LedgerEntry` is not repurposed or backfilled.
- Existing mock data facades remain the active user-facing implementation.
- No page, component, route, server action, provider adapter, credential flow, webhook, or financial execution is added.
- Known baseline: two `getBalanceTrend` tests fail independently of this module; one UI dialog test has been observed flaky but passes in isolation. Regression assessment must compare against the clean baseline rather than conceal these failures.

## Transactional/application invariants

The following intentionally remain outside a simple SQL constraint and must be enforced by the named narrow boundary:

- optional payment/customer organization match — payment identity repository;
- canonical payment-method/provider-customer identity match — payment-method identity repository plus connection FKs;
- unknown provider state cannot grant entitlement — recurring identity repository;
- consecutive payout attempt intent — payout identity repository plus unique attempt numbers;
- approved split-version immutability — split-rule repository;
- provider materialization and every route use compatible connection context — split repository plus route FKs;
- stale projector update rejection — repository optimistic-version policy.

## Final local verification commands

Run against a disposable local PostgreSQL database:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm --dir apps/web exec prisma validate
corepack pnpm --dir apps/web exec prisma generate
corepack pnpm --dir apps/web exec prisma migrate deploy
corepack pnpm --dir apps/web exec prisma migrate status
corepack pnpm --dir apps/web test -- src/domain/payments src/server/repositories
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web build
```

Do not run these migrations against production as part of verification.
