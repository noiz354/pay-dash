# Tasks: Provider Domain

> Module: `provider-domain`  
> Approved specification: `docs/spec/SPEC-provider-domain.md`  
> Approved plan: `tasks/plan.md`  
> Workflow: Addy Osmani SDD — Phase 3 Tasks  
> Status: **PROPOSED — HUMAN REVIEW GATE**  
> No implementation may start until this checklist is approved.

## Execution Rules

- Execute tasks in dependency order.
- Complete acceptance criteria and verification before checking a task.
- Stop for human review at every checkpoint.
- Never run provider SDK calls or live financial operations.
- Never add production secrets or copy live data into fixtures.
- Do not modify existing Better Auth tables, `LedgerEntry`, mock facades, actions, routes, or UI in this module.
- If implementation reveals a spec contradiction, stop and amend/re-approve the spec and plan rather than improvising.
- Use `corepack pnpm`; plain `pnpm` is not assumed available.

---

## Phase A — Domain contracts

## Task 1: Verify repository commands and test conventions

**Description:** Confirm the actual package scripts, Prisma invocation, test layout, server-only conventions, and existing naming patterns before creating implementation files. Record any discrepancy from the approved Plan; do not change application behavior.

**Acceptance criteria:**
- [x] Actual install, Prisma validation/generation, unit test, typecheck, lint, and build commands are identified from repository files.
- [x] Existing domain/DAL/test conventions and SDK import boundaries are documented in the implementation notes.
- [x] Any command differing from `tasks/plan.md` is corrected in planning documentation before code work continues.

**Verification:**
- [x] Inspect `package.json`, `apps/web/package.json`, workspace configuration, Prisma configuration, and representative tests/DAL files.
- [x] Dry verification uses read-only commands such as `corepack pnpm --version` and package script listing.
- [x] No tracked application source or schema is changed by this task.

**Dependencies:** None

**Files likely touched:**
- `tasks/plan.md` only if command/path corrections are required
- implementation notes in `tasks/todo.md` if no correction is required

**Estimated scope:** S (1–2 files)

---

## Task 2: Implement provider identity value objects

**Description:** Add provider key, provider mode, data source, provider resource reference, and identifier validation contracts without importing Prisma or provider SDKs.

**Acceptance criteria:**
- [x] Provider keys accept safe lowercase extensible identifiers and reject malformed values.
- [x] TEST, LIVE, MOCK/APP/PROVIDER distinctions are explicit and cannot be silently coerced.
- [x] Provider resource references require connection, provider, mode, resource type, and resource ID.

**Verification:**
- [x] Focused unit tests pass for valid, invalid, missing, and boundary inputs.
- [x] Tests prove Stripe/Xendit IDs can coincide under different connection scopes without identity collision.
- [x] Typecheck passes for the added contracts/tests.

**Dependencies:** Task 1

**Files likely touched:**
- `apps/web/src/domain/payments/provider.ts`
- `apps/web/src/domain/payments/provider.test.ts`

**Estimated scope:** S (2 files)

---

## Task 3: Implement exact money and currency contracts

**Description:** Add canonical decimal-string and ISO currency validation with no JavaScript floating-point persistence assumptions.

**Acceptance criteria:**
- [x] Money accepts canonical non-negative decimal strings and validated uppercase ISO currency codes.
- [x] Invalid precision, exponent notation, NaN/infinity-like strings, locale formatting, and unsafe numeric input are rejected.
- [x] Currency minor-unit handling is explicit and does not assume every currency has two decimal places.

**Verification:**
- [x] Focused unit tests include IDR zero-decimal and USD decimal examples plus large supported values.
- [x] Round-trip tests prove accepted decimal strings remain exact.
- [x] No arithmetic implementation uses native floating-point as authority.

**Dependencies:** Task 1

**Files likely touched:**
- `apps/web/src/domain/payments/money.ts`
- `apps/web/src/domain/payments/money.test.ts`

**Estimated scope:** S (2 files)

---

## Task 4: Define canonical status and resource contracts

**Description:** Add narrow provider-neutral interfaces and safe status-mapping principles needed by persistence and later adapters, without implementing payment workflows.

**Acceptance criteria:**
- [x] Canonical status and provider status are represented separately.
- [x] Unknown provider values map only to an explicit unknown/non-success result.
- [x] Canonical resource DTOs include organization, source, mode, provider-origin, timestamps, and exact Money where applicable.

**Verification:**
- [x] Focused tests prove unknown status never becomes terminal success.
- [x] Compile-time tests or fixtures reject provider SDK-shaped objects leaking into canonical contracts.
- [x] Unit tests and typecheck pass.

**Dependencies:** Tasks 2–3

**Files likely touched:**
- `apps/web/src/domain/payments/statuses.ts`
- `apps/web/src/domain/payments/contracts.ts`
- `apps/web/src/domain/payments/statuses.test.ts`
- `apps/web/src/domain/payments/contracts.test.ts`

**Estimated scope:** M (3–4 files)

---

## Checkpoint A: Domain contracts

- [x] Tasks 1–4 acceptance criteria are complete.
- [x] Focused tests pass.
- [x] `corepack pnpm --dir apps/web typecheck` or the corrected equivalent passes.
- [x] No Prisma/provider SDK coupling exists in domain contracts.
- [ ] Human reviews money precision, status safety, and resource identity before schema work.

---

## Phase B — Foundational persistence

## Task 5: Add organization and provider connection identity schema

**Description:** Introduce the minimal Organization anchor, PaymentProviderConnection identity shell, and ProviderAccount mapping as an additive Prisma schema change. Do not add credentials, memberships, authorization, or active/default selection behavior.

**Acceptance criteria:**
- [x] Organization ownership, provider key, TEST/LIVE mode, provider account identity, lifecycle timestamps, and non-secret status placeholders match the approved spec.
- [x] Multiple connection records are structurally possible; default/capability selection is not implemented.
- [x] Delete behavior preserves referenced provider/financial identity and no existing model is repurposed.

**Verification:**
- [x] Prisma schema validates and client generates.
- [x] Generated migration SQL is manually reviewed for destructive changes and unintended cascades.
- [x] Existing Better Auth and `LedgerEntry` definitions are unchanged except unavoidable relation formatting, if any.

**Dependencies:** Checkpoint A

**Files likely touched:**
- `apps/web/prisma/schema.prisma`
- `apps/web/prisma/migrations/<timestamp>_add_provider_identity/migration.sql`

**Estimated scope:** S (2 files)

---

## Task 6: Prove foundational identity constraints

**Description:** Add PostgreSQL integration tests and minimal persistence helpers needed to prove organization scoping, mode separation, connection-scoped provider IDs, and restrictive deletion.

**Acceptance criteria:**
- [x] Identical provider account IDs under different valid connections do not collide, while duplicates inside one connection do.
- [x] TEST and LIVE connections remain distinguishable and organization-scoped.
- [x] Referenced connection/account identity cannot be accidentally hard-deleted.

**Verification:**
- [x] Focused PostgreSQL integration tests pass against an isolated test database.
- [x] Migration applies cleanly from the repository baseline.
- [x] Existing test suite remains green.

**Dependencies:** Task 5

**Files likely touched:**
- `apps/web/src/server/repositories/provider-connections.ts`
- `apps/web/src/server/repositories/provider-connections.integration.test.ts`
- test fixture/helper files if existing conventions require them

**Estimated scope:** M (3–5 files)

---

## Checkpoint B: Foundational persistence

- [x] Tasks 5–6 acceptance criteria are complete.
- [x] Prisma validate/generate succeeds.
- [x] Migration SQL has no destructive change to existing data/tables.
- [x] Foundation integration tests and existing tests pass.
- [x] Human reviews the first migration before money-in tables are added.

---

## Phase C — Customer and money-in identity

## Task 7: Add canonical/provider customer and payment schema

**Description:** Add explicit customer and payment canonical/mapping tables with organization-scoped merchant references, connection-scoped provider IDs, exact amounts, and separate canonical/provider statuses.

**Acceptance criteria:**
- [x] One canonical customer may map to Xendit and Stripe without email-based merging.
- [x] One canonical payment has exactly one originating provider payment mapping.
- [x] Organization merchant references and connection provider IDs enforce approved uniqueness.

**Verification:**
- [x] Prisma validates/generates and additive migration SQL is reviewed.
- [x] Integration tests cover multi-provider customer linking, ID collision scope, status separation, and Decimal round-trip.
- [x] No raw provider payload column is introduced.

**Dependencies:** Checkpoint B

**Files likely touched:**
- `apps/web/prisma/schema.prisma`
- `apps/web/prisma/migrations/<timestamp>_add_customer_payment_identity/migration.sql`
- `apps/web/src/server/repositories/customer-identities.ts`
- `apps/web/src/server/repositories/payment-identities.ts`
- focused integration tests

**Estimated scope:** M (5 files target; split repository/tests if this exceeds one session)

---

## Task 8: Add refund identity with origin consistency

**Description:** Add canonical/provider refund mappings and enforce that a refund routes through the original payment provider connection. Do not implement refund execution, locking, thresholds, or approvals.

**Acceptance criteria:**
- [x] Refund stores exact amount/currency, canonical status, provider status, and originating payment relationship.
- [x] Schema/reference design makes payment-provider mismatch impossible or transactionally rejected by one narrow repository operation.
- [x] Cumulative refund execution behavior remains explicitly deferred to `refunds` and `durable-operations`.

**Verification:**
- [x] Mismatched provider connection integration test fails safely.
- [x] Valid partial refund identity can be persisted without invoking a provider.
- [x] Duplicate provider refund ID within one connection is rejected.

**Dependencies:** Task 7

**Files likely touched:**
- `apps/web/prisma/schema.prisma`
- `apps/web/prisma/migrations/<timestamp>_add_refund_identity/migration.sql`
- `apps/web/src/server/repositories/refund-identities.ts`
- `apps/web/src/server/repositories/refund-identities.integration.test.ts`

**Estimated scope:** M (4 files)

---

## Task 9: Add safe payment-method identity

**Description:** Add canonical/provider payment-method mapping with common masked relational fields and strict typed JSON only for allowlisted provider display variants.

**Acceptance criteria:**
- [x] Payment method mapping is connection-scoped and linked to a canonical customer.
- [x] Masked details schema cannot contain PAN, CVV, OTP, secret/token, or arbitrary provider payload keys.
- [x] Provider customer/method consistency is enforced by the narrow repository operation.

**Verification:**
- [x] Tests reject forbidden sensitive/unrecognized fields.
- [x] Valid masked card/bank/e-wallet display fixtures persist and round-trip safely.
- [x] Cross-provider customer/method mismatch is rejected.

**Dependencies:** Task 7

**Files likely touched:**
- `apps/web/prisma/schema.prisma`
- `apps/web/prisma/migrations/<timestamp>_add_payment_method_identity/migration.sql`
- `apps/web/src/domain/payments/payment-method.ts`
- `apps/web/src/server/repositories/payment-method-identities.ts`
- focused unit/integration tests

**Estimated scope:** M (5 files target)

---

## Checkpoint C: Money-in identity

- [x] Tasks 7–9 acceptance criteria are complete.
- [x] All additive migrations apply from baseline in order.
- [x] Customer/payment/refund/payment-method invariant tests pass.
- [x] Secret/PCI scan finds no forbidden fixture or field.
- [x] Regression gate passes: focused tests, typecheck, touched-dir lint, and build pass; full suite remains 324/326 due to two independently reproduced pre-existing `getBalanceTrend` failures.
- [x] Human reviews provider-origin routing before money-out identities.

---

## Phase D — Recurring and money-out identity

## Task 10: Add local subscription and versioned provider recurring mappings

**Description:** Add app-owned subscription/entitlement records and versioned provider recurring-plan mappings while keeping commercial, entitlement, and provider execution states distinct.

**Acceptance criteria:**
- [x] Local entitlement/commercial status does not reuse provider status.
- [x] Provider plans are connection-scoped and preserve replacement/version history.
- [x] Payment-method references cannot cross provider connection boundaries.

**Verification:**
- [x] Integration tests cover plan replacement history and provider mismatch rejection.
- [x] Unknown provider status does not grant entitlement.
- [x] Exact amount/currency persists correctly.

**Dependencies:** Checkpoint C

**Files likely touched:**
- `apps/web/prisma/schema.prisma`
- `apps/web/prisma/migrations/<timestamp>_add_recurring_identity/migration.sql`
- `apps/web/src/server/repositories/recurring-plan-identities.ts`
- focused integration tests

**Estimated scope:** M (4–5 files)

---

## Task 11: Add payout batch, recipient, and attempt identity

**Description:** Add app-owned payout batch/recipient records and immutable provider attempt history, resolving the current one-row-per-batch mismatch without executing payouts.

**Acceptance criteria:**
- [x] A batch contains independently tracked recipients and exact amounts.
- [x] A recipient may have ordered attempts; duplicate attempt numbers are rejected.
- [x] Provider payout IDs are unique per connection and old attempts remain historical.

**Verification:**
- [x] Tests cover multi-recipient batches, attempt ordering, provider ID collisions, and current-attempt selection.
- [x] Failed attempt history is not overwritten by a later attempt.
- [x] No destination secret is stored in plaintext general-purpose fields.

**Dependencies:** Checkpoint C

**Files likely touched:**
- `apps/web/prisma/schema.prisma`
- `apps/web/prisma/migrations/<timestamp>_add_payout_identity/migration.sql`
- `apps/web/src/server/repositories/payout-identities.ts`
- focused integration tests

**Estimated scope:** M (4–5 files)

---

## Task 12: Add platform transfer identity and topology guard

**Description:** Add canonical/provider transfer-attempt identity with explicit source/destination provider accounts and same-provider topology validation. Do not execute transfers.

**Acceptance criteria:**
- [x] Source and destination accounts are explicit and organization-scoped.
- [x] One transfer attempt uses one provider connection; silent cross-provider transfer is rejected.
- [x] Provider transfer IDs and attempt numbers are collision-safe.

**Verification:**
- [x] Same-provider valid topology integration test passes.
- [x] Cross-provider and cross-organization topology tests fail safely.
- [x] No live transfer adapter or endpoint is introduced.

**Dependencies:** Task 6, Checkpoint C

**Files likely touched:**
- `apps/web/prisma/schema.prisma`
- `apps/web/prisma/migrations/<timestamp>_add_transfer_identity/migration.sql`
- `apps/web/src/server/repositories/transfer-identities.ts`
- focused integration tests

**Estimated scope:** M (4 files)

---

## Checkpoint D: Recurring and money-out identity

- [x] Tasks 10–12 acceptance criteria are complete.
- [x] Subscription, payout, and transfer invariant tests pass.
- [x] Migration chain applies cleanly from baseline.
- [x] No financial execution capability exists yet.
- [x] Regression gate passes: focused tests (45/45), typecheck, touched-dir lint, and build pass; full suite remains 329/331 due to two independently reproduced pre-existing `getBalanceTrend` failures.
- [x] Human reviews before split-routing identity.

---

## Phase E — Split routing identity

## Task 13: Add versioned split-rule schema and allocation validation

**Description:** Add app-owned split rules, immutable versions, routes, and provider materialization mapping without activating or applying rules to payments.

**Acceptance criteria:**
- [x] Approved versions cannot be mutated through the repository contract.
- [x] Exactly one allocation kind—flat or percentage—is present per route.
- [x] Route destinations and provider materializations use compatible provider account/connection context.

**Verification:**
- [x] Tests reject both/neither allocation fields, duplicate route references, and provider topology mismatches.
- [x] Version replacement preserves prior approved versions.
- [x] Provider split-rule IDs are unique per connection.

**Dependencies:** Checkpoint D

**Files likely touched:**
- `apps/web/prisma/schema.prisma`
- `apps/web/prisma/migrations/<timestamp>_add_split_rule_identity/migration.sql`
- `apps/web/src/server/repositories/split-rule-identities.ts`
- focused integration tests

**Estimated scope:** M (4–5 files)

---

## Checkpoint E: Split-routing identity

- [x] Task 13 acceptance criteria are complete.
- [x] Prisma validates/generates and all eight migrations apply from baseline.
- [x] Split allocation, topology, uniqueness, version, and Decimal constraints pass on isolated PostgreSQL.
- [x] Focused tests (51/51), typecheck, touched-dir lint, and build pass.
- [x] Regression assessment records two known balance failures and one unrelated UI test that passes in isolation.
- [ ] Human reviews split-routing identity before repository hardening.

---

## Phase F — Repository hardening and handoff

## Task 14: Harden organization-scoped repository contracts

**Description:** Review all provider-domain repositories as one boundary, remove any accidental generic/unscoped CRUD, normalize identity conflict/not-found outcomes, and ensure Prisma types do not leak into adapter-facing contracts.

**Acceptance criteria:**
- [ ] Every application-facing lookup requires organization context or a trusted scoped context.
- [ ] No generic unscoped `findById` or arbitrary Prisma-input write is exported.
- [ ] Conflict, not-found, invalid-topology, and stale-version outcomes use typed provider-neutral errors.

**Verification:**
- [ ] Repository contract tests pass for every entity group.
- [ ] Static search finds no provider SDK imports in domain/repository files.
- [ ] Typecheck/lint pass without broad unsafe casts or disabled rules.

**Dependencies:** Task 13

**Files likely touched:**
- `apps/web/src/server/repositories/*.ts`
- repository contract/integration tests
- `apps/web/src/domain/payments/contracts.ts`

**Estimated scope:** M (review should be split by repository group if more than five files require substantive edits)

---

## Task 15: Verify full migration chain and compatibility

**Description:** Run the complete approved verification matrix against a clean database and existing application behavior, proving the provider-domain module is additive and implementation-ready for downstream modules.

**Acceptance criteria:**
- [ ] All migrations apply in order from repository baseline to a clean PostgreSQL database.
- [ ] Existing Better Auth tables, `LedgerEntry`, mock facades, routes/actions, and UI behavior remain compatible.
- [ ] Every `SPEC-provider-domain.md` success criterion is traced to a passing test or explicit reviewed constraint.

**Verification:**
- [ ] Full unit/integration test suite passes.
- [ ] Prisma validation/generation, typecheck, lint, and production build pass using verified repository commands.
- [ ] Git diff confirms no provider dependency, secret, endpoint, UI, or live execution was added.

**Dependencies:** Task 14

**Files likely touched:**
- test/fixture configuration only if required
- `tasks/todo.md` for evidence/checkmarks

**Estimated scope:** S (verification-focused)

---

## Task 16: Record provider-domain architecture decision and downstream handoff

**Description:** Write a concise ADR recording the implemented persistence decisions, constraint tradeoffs, migration policy, and contracts consumed by `provider-connections`. Update specification links without expanding scope.

**Acceptance criteria:**
- [ ] ADR records canonical/provider separation, explicit mapping tables, exact money, organization ownership, soft lifecycle, and staged migration decisions.
- [ ] Any invariant enforced transactionally rather than directly by SQL is named with its test evidence.
- [ ] Handoff lists only contracts needed by `provider-connections`; no downstream implementation begins.

**Verification:**
- [ ] ADR links the capability map, approved spec, plan, migration names, and verification evidence.
- [ ] Documentation contains no secrets or production identifiers.
- [ ] Human review confirms `provider-domain` is complete before the next module starts.

**Dependencies:** Task 15

**Files likely touched:**
- `docs/adr/<next-number>-provider-domain-persistence.md`
- `docs/spec/SPEC-provider-domain.md` only for status/evidence links
- `tasks/plan.md` and `tasks/todo.md` only for completion state

**Estimated scope:** S (2–4 documentation files)

---

## Final Checkpoint: Provider Domain Complete

- [ ] Tasks 1–16 are complete.
- [ ] All specification success criteria are satisfied.
- [ ] All approved migration SQL has been reviewed.
- [ ] Full tests, Prisma validation/generation, typecheck, lint, and build pass.
- [ ] Existing user-visible behavior is unchanged.
- [ ] No credentials, provider calls, financial execution, webhook, action, route, or UI code was introduced.
- [ ] Human approves completion before `provider-connections` enters Phase 1 Specify.

## Phase 3 Task-List Acceptance Criteria

- [ ] Every task has a single focused outcome.
- [ ] Tasks are S/M-sized; any implementation expansion is split before work begins.
- [ ] Dependencies and human checkpoints are explicit.
- [ ] High-risk identity, money, migration, and provider-origin invariants are tested early.
- [ ] Each schema stage remains additive and independently reviewable.
- [ ] Verification commands are concrete and corrected by Task 1 if repository scripts differ.
- [ ] No task implements provider connection, credentials, SDK calls, webhooks, UI, or financial execution.
- [ ] Human approves this checklist before Phase 4 Implement.
