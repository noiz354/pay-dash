# Implementation Plan: Provider Domain

> Module: `provider-domain`  
> Approved spec: `docs/spec/SPEC-provider-domain.md`  
> Capability map: `docs/spec/payment-platform-capability-map.md`  
> Workflow: Addy Osmani SDD — Phase 2 Plan  
> Status: **PROPOSED — HUMAN REVIEW GATE**  
> No implementation has started. Phase 3 executable task checklist is intentionally deferred until this plan is approved.

## Overview

Introduce the canonical provider-neutral domain foundation incrementally without connecting Xendit or Stripe and without changing current user-visible mock journeys. The work establishes validated value objects, relational identity/mapping foundations, provider ownership invariants, repository contracts, and database-backed tests. It does not implement provider connections, credentials, SDK calls, webhooks, payment actions, or UI.

## Architecture Decisions

1. **Canonical core plus provider mappings.** Business resources and provider resources are separate relational records; provider SDK models never become persistence models.
2. **Connection-scoped identity.** Every provider resource is unique within a provider connection and resource type. Provider IDs alone are never globally trusted.
3. **Organization ownership from day one.** Canonical rows include organization ownership, while membership and authorization behavior remain delegated to `organization-access`.
4. **Multiple connections are structurally allowed.** The schema permits multiple records per provider/mode; default/active selection constraints are added by `provider-connections`.
5. **One canonical payment equals one provider payment.** A future order/payment-attempt aggregate may own several canonical payments, but this module does not overload Payment for that purpose.
6. **Exact money.** Persistence uses Decimal; boundaries use validated decimal strings and ISO currency values.
7. **Separate canonical/provider statuses.** Unknown provider values map to safe non-success canonical states.
8. **No raw payload source of truth.** Restricted encrypted webhook evidence belongs to `webhook-ingress`; canonical mappings keep only typed, necessary projections.
9. **Soft lifecycle, no normal hard deletion.** Financial/provider identity remains referentially available after disconnect or retirement.
10. **Staged schema introduction.** Existing mock stores and `LedgerEntry` remain untouched until later module-specific migrations.

## Scope

### Included

- provider/mode/source value objects;
- money/currency/date/resource-reference validation;
- canonical/provider status principles and mapping interfaces;
- minimal Organization anchor required for ownership;
- provider connection identity shell without credentials/lifecycle behavior;
- canonical and provider mapping tables from the approved ERD;
- database constraints and indexes;
- provider-neutral repository interfaces and focused implementations needed to prove invariants;
- builders/fixtures and unit/integration/property tests;
- documentation of schema decisions.

### Explicitly excluded

- Better Auth membership/RBAC migration;
- MFA and dual approval;
- secret storage;
- provider registry/default selection behavior;
- Xendit/Stripe dependencies or calls;
- direct HTTP transport;
- webhook receipt/outbox/projectors;
- financial write workflows;
- pages/components/routes/actions;
- backfilling mock stores or existing LedgerEntry;
- production data migration beyond additive empty tables.

## Dependency Graph

```text
Approved provider-domain spec
  -> value-object contracts
     -> schema names/constraints
        -> additive migration
           -> generated Prisma client
              -> repository contracts/implementations
                 -> invariant integration tests
                    -> documentation + downstream handoff
```

Parallel-safe work after value contracts are fixed:

```text
value contracts
  ├── status vocabulary tests
  ├── money/property tests
  └── relational schema design review
```

Migration and repository implementation remain sequential because generated types depend on the approved schema.

## Data Model Rollout Strategy

### Stage A — foundational identities

Add only the entities needed to establish ownership and mapping identity:

- `Organization` anchor;
- `PaymentProviderConnection` identity shell;
- `ProviderAccount`.

This stage proves organization scoping, test/live separation, connection-scoped provider IDs, and soft lifecycle references.

### Stage B — money-in identities

Add:

- `CanonicalCustomer` / `ProviderCustomer`;
- `CanonicalPayment` / `ProviderPayment`;
- `CanonicalRefund` / `ProviderRefund`;
- `CanonicalPaymentMethod` / `ProviderPaymentMethod`.

This stage proves provider-origin routing, customer multi-provider mapping, payment/refund consistency, and safe masked method projections.

### Stage C — recurring and money-out identities

Add:

- `LocalSubscription` / `ProviderRecurringPlan`;
- `PayoutBatch` / `PayoutRecipient` / `ProviderPayoutAttempt`;
- `PlatformTransfer` / `ProviderTransfer`.

This stage proves versioned recurring mapping, per-recipient payout attempts, and same-provider transfer topology.

### Stage D — routing identities

Add:

- `SplitRule`;
- `SplitRuleVersion`;
- `SplitRoute`;
- `ProviderSplitRule`.

This stage proves immutable approved versions and provider-specific materialization.

Although staged conceptually, the Phase 3 task breakdown will decide whether these become several additive migrations. Preference: multiple reviewable migrations/checkpoints rather than one large migration.

## Constraint Plan

### Organization and connection

- organization foreign key required on canonical resources;
- provider key validated in application code and constrained to safe storage format;
- mode constrained to TEST/LIVE;
- unique provider account ID scoped by connection;
- no cascade deletion from connection to financial/provider mappings.

### Customer

- unique merchant reference per organization;
- unique provider customer ID per connection;
- normalized email indexed only if needed; never a provider identity uniqueness assumption;
- manual linking supports multiple provider mappings to one canonical customer.

### Payment/refund

- payment merchant reference unique per organization;
- provider payment ID unique per connection;
- one provider mapping per canonical payment;
- refund provider connection consistency cannot be fully expressed with a simple FK unless payment mapping identity is referenced directly; prefer explicit originating ProviderPayment FK on ProviderRefund or enforce transactionally plus composite constraints;
- exact refundable-reservation locking deferred to `refunds`/`durable-operations`.

### Payment methods/recurring

- provider method ID unique per connection;
- masked details use a typed JSON schema only if relational columns cannot express provider variants;
- provider recurring plan ID unique per connection;
- version history retained; only one active mapping policy deferred to recurring module.

### Payouts/transfers

- unique attempt number per recipient;
- provider payout ID unique per connection when present;
- current-attempt selection represented explicitly or derived from max attempt with transaction locks—the task phase must choose one after database review;
- platform transfer source/destination reference ProviderAccount rows;
- cross-provider compatibility enforced in domain/repository transaction if SQL constraint is impractical.

### Split rules

- unique rule key per organization;
- unique version per rule;
- unique route reference per version;
- allocation CHECK ensures exactly one of flat/percent;
- approved version immutable by repository policy and database trigger only if Prisma-safe enforcement is justified;
- provider split-rule ID unique per connection.

## Repository Plan

Repositories are narrow and organization-scoped. Initial implementations exist to test invariants, not to expose broad application CRUD.

Expected boundaries:

```text
ProviderConnectionRepository
CustomerIdentityRepository
PaymentIdentityRepository
RefundIdentityRepository
PaymentMethodIdentityRepository
RecurringPlanIdentityRepository
PayoutIdentityRepository
TransferIdentityRepository
SplitRuleIdentityRepository
```

Rules:

- every read accepts organization ID or trusted scoped context;
- no general unscoped `findById` for application use;
- creation accepts canonical commands, not Prisma input types;
- provider mapping operations accept validated `ProviderResourceRef`;
- optimistic version checks guard projections where included;
- repository errors normalize unique/conflict/not-found outcomes;
- Prisma models do not leak into provider adapter interfaces.

## Verification Checkpoints

### Checkpoint 1 — domain contracts

- value-object tests pass;
- decimal/currency/resource-reference contracts reviewed;
- provider/mode/source and status behavior approved;
- no schema or provider SDK dependency introduced prematurely.

### Checkpoint 2 — foundational schema

- Prisma schema validates and client generates;
- additive migration applies to empty/test database;
- organization/connection/provider-account constraints pass integration tests;
- rollback procedure is documented and does not touch existing tables/data destructively.

### Checkpoint 3 — canonical resource mappings

- customer/payment/refund/payment-method invariants pass;
- recurring/payout/transfer/split routing constraints pass;
- provider identity cannot change or collide across connection scope;
- TEST/LIVE and organization isolation tests pass.

### Checkpoint 4 — repositories and handoff

- repository contract tests pass against PostgreSQL;
- no unscoped application lookup is exported;
- all module success criteria are traced to tests;
- full repository test/type/lint/build gates pass;
- human review before starting `provider-connections`.

## Test Plan

### Unit tests

- ProviderKey format and registry-independent validation;
- ProviderMode/DataSource distinctions;
- ISO currency and decimal-string parsing;
- Date/ID validation;
- unknown provider status safe behavior;
- provider-origin routing decisions.

### PostgreSQL integration tests

- uniqueness and FK constraints;
- organization isolation;
- connection-scoped IDs;
- inability to hard-delete referenced connections;
- customer mapping to multiple providers without email auto-merge;
- payment/refund provider mismatch rejection;
- payout attempt ordering and collision;
- transfer topology validation;
- split allocation and version constraints;
- exact Decimal round trips.

### Property tests

Prefer existing dependencies if capable; adding a property-test library requires approval.

- arbitrary valid decimal values round-trip exactly;
- unknown statuses never map to success;
- provider ownership remains immutable under update sequences;
- split allocation rejects both/neither flat-percent cases;
- provider ID collisions remain isolated by connection.

### Regression gates

Existing mock tests must remain green. No current page/action behavior changes in this module.

## Migration Strategy

1. Add new tables only; do not modify current `LedgerEntry`, Better Auth tables, or mock modules.
2. Use explicit migration names and review generated SQL before application.
3. Prefer restrict/no-action deletion for provider/financial identity.
4. Add indexes for organization scoping and provider lookup paths.
5. Apply to disposable PostgreSQL test database first.
6. Document rollback as dropping only empty/new tables during pre-production. Once canonical financial data exists, rollback becomes forward-fix and must not destroy records.
7. Defer mock/LedgerEntry backfill to capability modules with reconciliation specifications.

## Existing Code Reuse

- Prisma client setup: `apps/web/src/lib/db/prisma.ts`;
- server-only DAL convention: `apps/web/src/server/dal/*`;
- Zod boundary pattern: current DAL/actions;
- Better Auth `User` remains untouched;
- existing `LedgerEntry` remains untouched;
- mock stores/tests remain regression suite;
- current formatting functions remain presentation-only, not decimal persistence utilities.

## File Impact Forecast

Final task paths can change after task review, but likely areas are:

```text
apps/web/prisma/schema.prisma
apps/web/prisma/migrations/<approved migrations>/migration.sql
apps/web/src/domain/payments/provider.ts
apps/web/src/domain/payments/money.ts
apps/web/src/domain/payments/ids.ts
apps/web/src/domain/payments/statuses.ts
apps/web/src/domain/payments/contracts.ts
apps/web/src/server/repositories/provider-*.ts
apps/web/src/**/*.test.ts
docs/adr/<provider-domain persistence ADR>.md
```

The work must be split so no individual task is XL or spans unrelated entity groups.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Over-generalized canonical model erases provider semantics | High | Keep provider status/mapping tables and narrow canonical guarantees |
| Large schema migration is difficult to review | High | Stage identity, money-in, money-out and routing migrations with checkpoints |
| Organization model conflicts with future Better Auth organization support | High | Keep minimal anchor; delegate memberships/session context to `organization-access` |
| Incorrect money precision | High | Analyze supported currencies, use Decimal and round-trip/property tests before schema finalization |
| Polymorphic mapping loses FKs | High | Prefer explicit provider mapping tables per resource |
| Prisma cannot enforce complex cross-table invariant | Medium | Repository transaction + integration tests; database trigger only after explicit review |
| Typed JSON drifts into raw payload dumping | High | Strict Zod schema and field allowlist; raw evidence belongs elsewhere |
| Existing mock/LedgerEntry behavior regresses | Medium | Additive-only module and run complete existing test suite |
| Too many repositories become boilerplate | Medium | Narrow identity repositories; avoid generic repository abstraction |
| Provider key extensibility permits invalid providers | Medium | Validate against provider registry at service boundary plus safe-format storage constraint |
| Hard rollback could delete financial history later | High | Destructive rollback only while new tables are empty; forward-fix once used |

## Parallelization

Safe after contract approval:

- money/value-object tests;
- status/source contracts;
- SQL/index review;
- fixture design.

Must remain sequential:

- schema decision -> migration -> generated client -> repositories;
- foundational identities -> resource mappings;
- repository implementation -> integration invariant verification.

No parallel agent may edit the same Prisma schema/migration concurrently.

## Implementation Sequence Summary

```text
contracts
  -> foundational identity migration
  -> money-in identity migration
  -> recurring/money-out identity migration
  -> routing identity migration
  -> scoped repositories
  -> invariant/property/regression verification
  -> ADR/handoff
```

## Plan Acceptance Criteria

- [ ] Plan implements only the approved `provider-domain` module.
- [ ] Current UI/provider integrations remain untouched.
- [ ] Schema rollout is additive and staged.
- [ ] Dependency order is explicit and cycle-free.
- [ ] High-risk money/identity constraints are tested early.
- [ ] Every checkpoint leaves tests/schema valid.
- [ ] No task will be XL; Phase 3 must decompose stages into S/M units.
- [ ] Existing mock and Better Auth behavior remains compatible.
- [ ] Risks and mitigations cover identity, precision, migration and provider semantics.
- [ ] Human approves this Plan before `tasks/todo.md` is created.

## Open Decisions for Plan Approval

1. Approve multiple provider connections structurally, with default-selection policy deferred to `provider-connections`?
2. Approve multiple additive migrations rather than one complete ERD migration?
3. Approve a minimal Organization anchor now, while membership/session organization context remains for `organization-access`?
4. Approve explicit mapping tables per canonical resource rather than one polymorphic `ProviderResource` table?
5. Approve destructive down migration only while tables are empty, then forward-fix policy once financial data exists?
6. For typed masked payment-method details, prefer relational common columns plus strict typed JSON for provider variants?

## Gate

After human approval, Phase 3 creates `tasks/todo.md` with small S/M tasks, acceptance criteria, verification commands, dependencies and checkpoints. No implementation begins until that task list receives its own human approval.
