# Remaining Capability-by-Capability Specification Plan

> Initiative: multi-provider payment platform (`noiz354/pay-dash`)
> Workflow: Addy Osmani `spec-driven-development` — Phase 0 continuation → Phase 1 roadmap
> Authority: `docs/spec/payment-platform-capability-map.md` (Phase 0, approved)
> Status: **ACTIVE ROADMAP — Wave 0 foundation contracts implemented**
> Date: 2026-09-03 (+07:00)
> Scope of this document: the **specification tranche** for every module that remains after `provider-domain`, plus the live implementation progress of the Wave 0 foundation contracts.

---

## 1. Purpose

`provider-domain` (module 1 of the capability map) is implemented behind PR #3 (branch `arena/01a06507-pay-dash` → `main` at `84b40f1`). The canonical ERD, migration chain (8 additive migrations), value objects, and narrow identity repositories exist. This document is the **Phase 0 → Phase 1 continuation plan**: it tells the maintainers, capability by capability, which focused module specification must be written and approved next, what each spec must decide, which existing research documents are its inputs, and which prerequisites block it.

It intentionally replaces a "one big implementation" impulse with the module-by-module gated sequence the capability map mandates. Nothing below is a Plan or a Task list for `provider-domain`; Plan and Task artifacts for each remaining module are produced only after that module's Phase 1 spec is approved.

## 2. Current state (evidence)

| Item | Evidence | Status |
|---|---|---|
| Capability map approved | `docs/spec/payment-platform-capability-map.md` | ✅ |
| `provider-domain` spec | `docs/spec/SPEC-provider-domain.md` | ✅ approved |
| `provider-domain` verification matrix | `docs/spec/provider-domain-verification-matrix.md` | ⚠️ needs re-run at PR head |
| ADR-0027 persistence | `docs/adr/0027-provider-neutral-domain-persistence.md` | ✅ Accepted (db domain) |
| `provider-domain` schema | `apps/web/prisma/schema.prisma` (Organization, PaymentProviderConnection, ProviderAccount, Canonical/ProviderCustomer, Payment, Refund, PaymentMethod, LocalSubscription/ProviderRecurringPlan, PayoutBatch/Recipient/Attempt, PlatformTransfer/ProviderTransfer, SplitRule/Version/Route/ProviderSplitRule) | ✅ implemented |
| `provider-domain` value objects | `apps/web/src/domain/payments/*` (provider, money, statuses, contracts, errors, payment-method) | ✅ implemented |
| `provider-domain` repositories | `apps/web/src/server/repositories/*` (connection, customer, payment, refund, payment-method, recurring, payout, transfer, split-rule, repository-policy) | ✅ implemented |
| Migration chain | 8 migrations `20260903050000` → `081000` | ✅ implemented; final re-run pending |
| Better Auth models / `LedgerEntry` / mock facades | untouched | ✅ |
| Provider SDK imports | only `apps/web/src/lib/xendit.ts` | ✅ |
| `xendit-node@7.0.0` mapping audit | `docs/audit/xendit-mapping-audit.md` (5 iterations, `MISSING_COUNT = 0`) | ✅ historical; must be re-run per-capability after implementation |
| Stripe SDK | not present | ⛔ not started |
| Stripe ADR | not present | ⛔ required before `stripe-adapter` |

**Known baseline (from `provider-domain-verification-matrix.md`, not re-run here because node_modules is not installed in this sandbox):** focused domain/repository tests pass (51/51 at split-rule point); full suite `329/331` with two independently reproduced pre-existing `getBalanceTrend` failures; one isolated UI-dialog test has been observed flaky in the historical sweep. This gate does not rely on those numbers for approval; it flags them so the next module compares against the same baseline.

**Important:** the `provider-domain` Final Checkpoint has two outstanding manual items (a clean migration-chain run + human sign-off) that should be closed before calling the foundation truly green.

### Verified baseline in this sandbox (2026-09-03, after `corepack pnpm install --frozen-lockfile`)

- Focused `provider-domain` domain/repository tests: 54 passed.
- Full suite: baseline 337/340 (2 pre-existing `getBalanceTrend` + 1 flaky `balance-dialogs`). After Wave 0 implementation added, **433 passed / 2 failed** (only the 2 `getBalanceTrend`; the flaky dialog passed this run).
- Typecheck (`tsc --noEmit`) exit 0; eslint exit 0 on all new files.
- Prisma CLI engine binary **cannot be downloaded** in this sandbox (network to `binaries.prisma.sh` blocked) and **no PostgreSQL service** is present. Therefore `prisma validate`, `prisma generate`, `prisma migrate`, and DB-backed integration tests **were not run here**. Schema/db work must run in an environment with the Prisma engine + a PostgreSQL instance.

### Wave 0 implementation progress

| Module | Domain/service contract | Committed | Persistence + adapter (blocked here) |
|---|---|---|---|
| `provider-connections` | state machine + capability manifest + provider registry | `88269f3` | connection `capabilityManifest`/requirements/webhook-health/`lastVerifiedAt` columns — next migration |
| `provider-secrets` | SecretStore abstraction + local AES-256-GCM adapter + redaction | `f83b203` | `secret_ref`/`credential_version`/rotation columns + KMS SDK wiring |
| `organization-access` | org roles + least-privilege permission matrix | `bea2906` | membership model + session→org resolution |
| `financial-step-up` | challenge binding + dual-control policy | `bea2906` | persisted challenge/proof records + WebAuthn/TOTP integration |
| `durable-operations` | operation state machine + stable idempotency + request hash + UNKNOWN reconcile | `b3c5686` | durable operation table + outbox worker |
| `audit-ledger` | strict AuditEvent + redaction + dedupe id | `b3c5686` | immutable audit table + sink |
| `webhook-ingress` | Xendit token / Stripe signature verify + dedupe + redacted envelope | `56f6aea` | durable webhook_delivery table + route wiring |
| `event-projection` | canonical status map + optimistic-version projector guard | `56f6aea` | projector jobs + outbox |

Specs/matrices: `SPEC-provider-connections.md`, `SPEC-provider-secrets.md`, `SPEC-organization-access.md`, `SPEC-financial-step-up.md`; verification evidence in `provider-connections-verification-matrix.md`, `provider-secrets-verification-matrix.md`.

## 3. Which existing research documents feed which module

The Xendit research corpus is **input**, not implementation. Each focused module spec must reference, not copy, the relevant document(s).

| Module | Research inputs (read-first) |
|---|---|
| `provider-connections` | `payment-provider-plugin-and-agent-skills.md` §§4–13; `xendit-shared-contracts.md`; `SPEC-provider-domain.md` (§ ProviderAccount / open questions); `xendit-platform-product-decisions.md` §5 (roles) |
| `provider-secrets` | `payment-provider-plugin-and-agent-skills.md` §9; `xendit-shared-contracts.md` §Authentication; `SPEC-provider-domain.md` (no-secret boundary); `xendit-remaining-sdk-and-http-gaps.md` §9 (HTTP client constitution) |
| `organization-access` | `xendit-platform-product-decisions.md` §§4–5; `SPEC-provider-domain.md` (Organization anchor); `payment-provider-plugin-and-agent-skills.md` §12 |
| `financial-step-up` | `xendit-platform-product-decisions.md` §§5–6, 12; `payment-provider-plugin-and-agent-skills.md` §12 |
| `durable-operations` | `SPEC-provider-domain.md` (Operation reference); `xendit-hosted-payment-links.md` §9; `xendit-payouts.md` §§8–10; `xendit-remaining-sdk-and-http-gaps.md` §4 |
| `audit-ledger` | `docs/adr/0026-audit-log-the-event-history-the-app-owns.md`; `xendit-shared-contracts.md` §Observability; `xendit-platform-product-decisions.md` §5 |
| `webhook-ingress` | `xendit-remaining-sdk-and-http-gaps.md` §6; `docs/adr/0014-webhooks-inbound-callback-log.md`; existing `app/api/webhooks/xendit/route.ts`; `SPEC-provider-domain.md` (no-raw-payload rule) |
| `event-projection` | `xendit-remaining-sdk-and-http-gaps.md` §6; `SPEC-provider-domain.md` (projection freshness/status); `docs/QUEUES.md` |
| `xendit-adapter` | `xendit-integration-portfolio.md`; `xendit-shared-contracts.md`; `xendit-mapping-audit.md`; `xendit-remaining-sdk-and-http-gaps.md` (§2 inventory, §9 HTTP client) |
| `stripe-adapter` | `payment-provider-plugin-and-agent-skills.md` §13; must create a Stripe capability map + ADR (see §6) |
| `connected-accounts` | `xendit-remaining-sdk-and-http-gaps.md` §8 H1; `xendit-platform-product-decisions.md` §7; `SPEC-provider-domain.md` (`ProviderAccount`) |
| `compliance-kyc` | `xendit-platform-product-decisions.md` §8; `xendit-remaining-sdk-and-http-gaps.md` §8 H2; existing `server/data/kyc.ts` (app-owned, must not be presented as provider verification) |
| `money-in` | `xendit-live-transactions.md` (C2a); `xendit-hosted-payment-links.md` (C3, Invoice); `xendit-live-balance.md` (C1 read) |
| `customer-vault` | `xendit-remaining-sdk-and-http-gaps.md` §3 (C7), §5 (C9); `SPEC-provider-domain.md` (customer/method mapping) |
| `recurring-billing` | `xendit-remaining-sdk-and-http-gaps.md` §8 H5; `xendit-platform-product-decisions.md` §9; `SPEC-provider-domain.md` (subscription/plan) |
| `refunds` | `xendit-remaining-sdk-and-http-gaps.md` §4 (C8); `SPEC-provider-domain.md` (refund origin routing) |
| `payouts` | `xendit-payouts.md` (C5/C6); `SPEC-provider-domain.md` (batch/recipient/attempt) |
| `platform-routing` | `xendit-remaining-sdk-and-http-gaps.md` §8 H3/H4; `xendit-platform-product-decisions.md` §§10–11; `SPEC-provider-domain.md` (transfer/split) |
| `balance-reporting` | `xendit-live-balance.md` (C1); `xendit-live-transactions.md` (C2b deferred aggregates) |
| `provider-dashboard` | `payment-provider-plugin-and-agent-skills.md` §8, §10; all provider-connection/secrets specs |
| `agent-skill-policy` | `payment-provider-plugin-and-agent-skills.md` §§2–3, 15–16 |
| `launch-operations` | all shipping module specs; `provider-domain-verification-matrix.md` |

## 4. Remaining module specification tranche (dependency order)

For each module: `input` = research docs to read; `must decide` = the open provider/security semantics the focused Phase 1 spec must resolve; `write-capable` = whether the module can reach a provider financial write (and therefore is gated on durable-operations + access + MFA + audit + webhook). Each stops at its **HUMAN REVIEW GATE** before a Plan is written.

### Wave 0 — sequential foundations

> Implementation note: the **domain/service contracts** for modules 4.1–4.8 are implemented (see §2.1). Each still needs its persistence schema/migration + repository/DB tests (blocked by the missing Prisma engine/Postgres in this sandbox) and, for `provider-connections`/`provider-secrets`, the provider-adapter wiring.

#### 4.1 `provider-connections`
- **Input:** `payment-provider-plugin-and-agent-skills.md` §§4–13; `xendit-shared-contracts.md`; `SPEC-provider-domain.md`; `xendit-platform-product-decisions.md` §5.
- **Must decide:**
  - Connection state machine exactly as spec'd: `DRAFT → CONNECTING → VERIFYING → ACTION_REQUIRED → ACTIVE → DEGRADED → ROTATION_REQUIRED → DISCONNECTING → DISCONNECTED / FAILED / REVOKED`, with validated allowed transitions and audit per transition.
  - Capability manifest schema (`balanceRead, transactionRead, hostedPaymentLinks, customers, savedPaymentMethods, recurringBilling, refunds, payouts, connectedAccounts, internalTransfers, splitRouting, webhookHealth`), each exposing `supported / configured / available / mode / reason / requirements / lastVerifiedAt`.
  - Server-side verification gate: provider identity + TEST/LIVE mode + account identity + required permissions + capability scan + webhook config/health. Credential presence alone ≠ ACTIVE.
  - One active/default connection per org/provider/mode vs. multiple named connections ("ask first" per `SPEC-provider-domain.md` open question 1 — recommend multiple records, one default per capability/account context).
  - Replace free-form `capabilitiesSummary` writes with a strict normalized schema (ADR-0027 handoff explicitly calls this out).
  - Safe `DISCONNECT`/`DISCONNECTED`/`REVOKED` semantics that never hard-delete referenced connections.
- **Write-capable:** No (lifecycle only; no SDK financial writes). It is a prerequisite for every adapter.
- **Gate:** spec approved → Plan approved → Tasks approved → implement registry + state machine with tests.

#### 4.2 `provider-secrets`
- **Input:** `payment-provider-plugin-and-agent-skills.md` §9; `xendit-shared-contracts.md` (auth, HTTP constitution); `SPEC-provider-domain.md` (no-secret boundary); `xendit-remaining-sdk-and-http-gaps.md` §9.
- **Must decide:**
  - Secret-store abstraction (production KMS/envelope vs. explicitly-marked local encrypted adapter); `secret_ref`, `credential_version`, created/rotated timestamps, verification metadata.
  - Paste-once handling, value redaction after submission, no secret in logs/errors/analytics/HTML/React props/audit/Sentry.
  - Separated TEST/LIVE credentials; rotation with versioning; disconnect/revocation workflow.
  - Local dev backend that never commits a secret and prevents LIVE activation without a production-grade secret backend.
- **Write-capable:** No (storage only). Needed by Xendit adapter, Stripe adapter, connected-accounts, OAuth handling.
- **Gate:** spec → Plan → Tasks → implement + redaction/encryption tests.

#### 4.3 `organization-access`
- **Input:** `xendit-platform-product-decisions.md` §§4–5; `SPEC-provider-domain.md`; `payment-provider-plugin-and-agent-skills.md` §12.
- **Must decide:**
  - Organization-scoped roles `OWNER / FINANCE_ADMIN / FINANCE_OPERATOR / DEVELOPER / ANALYST / COMPLIANCE_ANALYST / RISK_ANALYST / SUPPORT`, replacing `User.role` as the authorization source (ADR-0027 / `SPEC-provider-domain.md` explicitly forbid treating Better Auth `User.role` as org RBAC).
  - Membership model and trusted tenant context; every operation resolves organization from the authenticated session, never from browser input.
  - Permission matrix for prepare vs. approve/execute, including who may not self-approve under dual control.
- **Write-capable:** No (authorization). Prerequisite for every financial write module and `financial-step-up`.
- **Gate:** spec → Plan → Tasks → implement + RBAC tests.

#### 4.4 `financial-step-up`
- **Input:** `xendit-platform-product-decisions.md` §§12; `payment-provider-plugin-and-agent-skills.md` §12; `organization-access` spec.
- **Must decide:**
  - WebAuthn/passkey preferred, TOTP fallback; SMS alone insufficient; recovery codes handled separately.
  - Operation-bound challenge binding (digest of operation type, resource/version, amount/currency, destination/account count, organization, actor, expiry, nonce); short expiry; single-use; replay/nonce protection.
  - Dual-control thresholds (payout ≥ IDR 25M/recipient or ≥ IDR 100M/batch; refund ≥ IDR 10M or >50% of original; every live platform transfer; every live split-rule activation; recurring immediate payment ≥ IDR 10M); requester ≠ approver; role/version changes invalidate pending approval.
- **Write-capable:** No (assurance gate). Prerequisite for every financial write.
- **Gate:** spec → Plan → Tasks → implement + MFA/challenge/threshold tests.

#### 4.5 `durable-operations`
- **Input:** `SPEC-provider-domain.md` (Operation reference); `xendit-hosted-payment-links.md` §9; `xendit-payouts.md` §§8–10; `xendit-remaining-sdk-and-http-gaps.md` §4.
- **Must decide:**
  - Generic operation record (operation ID, org, actor, connection, resource/operation type, stable idempotency key, canonical request hash, amount/currency, trusted destinations, approval state, MFA proof ref, attempt count, provider ref, state, unknown-outcome marker, timestamps/version).
  - States `DRAFT / PENDING_APPROVAL / APPROVED / EXECUTING / UNKNOWN / SUCCEEDED / FAILED / CANCELLED`.
  - Rule: persist intent before provider call; stable idempotency; never retry ambiguous write with a fresh identifier; reconcile UNKNOWN first; optimistic concurrency/locking; webhook/read reconciliation completes state; audit all transitions.
- **Write-capable:** No, but it is the **sole** authorized go/no-go wrapper around provider writes.
- **Gate:** spec → Plan → Tasks → implement + idempotency/concurrency/unknown-recovery tests.

#### 4.6 `audit-ledger`
- **Input:** `docs/adr/0026-audit-log-the-event-history-the-app-owns.md`; `xendit-shared-contracts.md` §Observability; `xendit-platform-product-decisions.md` §5.
- **Must decide:**
  - Immutable security/financial audit events; redaction policy (no secrets, OTPs, PAN/CVV, full account identifiers, raw provider payloads, KYC document bytes).
  - Audit event vocabulary per operation; actor/org/provider/connection/mode/operation/canonical-resource/correlation fields; state-transition record.
  - Retention and export boundaries.
- **Write-capable:** No (observation layer), but required by every financial write.
- **Gate:** spec → Plan → Tasks → implement + redaction/fixture tests.

#### 4.7 `webhook-ingress`
- **Input:** `xendit-remaining-sdk-and-http-gaps.md` §6; `docs/adr/0014-webhooks-inbound-callback-log.md`; existing `app/api/webhooks/xendit/route.ts`; `SPEC-provider-domain.md` (no-raw-payload rule).
- **Must decide:**
  - Provider-specific verification: Xendit documented callback token contract; Stripe raw-body signature verification (never reuse one provider's verification for the other).
  - Durable receipt (persist delivery before 2xx), provider-scoped event dedupe (unique provider event ID), redacted/encrypted payload retention (short, configurable), retry/dead-letter/replay, fast response after durable acceptance.
  - Never trust event account/resource context without matching a persisted connection.
- **Write-capable:** No (side effects via projectors only).
- **Gate:** spec → Plan → Tasks → implement + signature/token verification + dedupe tests.

#### 4.8 `event-projection`
- **Input:** `xendit-remaining-sdk-and-http-gaps.md` §6; `SPEC-provider-domain.md` (projection/status); `docs/QUEUES.md`.
- **Must decide:**
  - Durable outbox/job model, bounded concurrency, retries, dead-letter, replay safety.
  - Idempotent canonical projectors with optimistic-version/transition guards; out-of-order event handling; unknown events stored safely without domain mutation.
  - Each supported event's strict versioned schema (invoice paid/settled/expired, payment result, payout transition, refund transition, payment-method, platform account lifecycle, Stripe relevant events).
- **Write-capable:** No (projection), but gated on webhook-ingress + durable-operations + audit.
- **Gate:** spec → Plan → Tasks → implement + projector idempotency/out-of-order tests.

### Wave 1 — provider adapters (sequential, after Wave 0)

#### 4.9 `xendit-adapter`
- **Input:** `xendit-integration-portfolio.md`; `xendit-shared-contracts.md`; `xendit-mapping-audit.md`; `xendit-remaining-sdk-and-http-gaps.md` (§2 inventory, §9 HTTP client).
- **Must decide:**
  - One normalized adapter boundary behind the server-only `lib/xendit.ts` single import; capability-specific subinterfaces (not one giant interface); no SDK model leaks to UI/application services.
  - Canonical error taxonomy (`UNAUTHORIZED / FORBIDDEN / RATE_LIMITED / INVALID_REQUEST / NOT_FOUND / CONFLICT / IDEMPOTENCY_CONFLICT / UNAVAILABLE / TIMEOUT / INVALID_RESPONSE / UNKNOWN`); retryable flag; safe messages; correlation ID.
  - Stable idempotency/reference identifiers; no blind retries of ambiguous writes; reconcile unknown outcomes first.
  - Cursor APIs remain cursors; do not emulate totals/search unsupported by the provider; do not mix Invoice and PaymentRequest IDs; no fake fallback from one product to another.
  - Direct HTTP transport (`https://api.xendit.co`, Basic auth server-side, timeout/abort, redaction, error normalization, idempotency, account headers, explicit API version) only for documented APIs absent from the SDK.
  - Re-verify all 36 Promise methods across the 8 clients against installed `7.0.0` declarations (the historical 5-pass audit is not implementation evidence).
- **Write-capable:** Yes (wraps writes) — but **cannot execute** until durable-operations + access + MFA + audit are in place; TEST mode only in this wave.
- **Gate:** spec → Plan → Tasks → implement + contract/unit tests + 5-iteration mapping re-audit.

#### 4.10 `stripe-adapter`
- **Input:** `payment-provider-plugin-and-agent-skills.md` §13; official `stripe-best-practices`/`upgrade-stripe` skills; **must write a Stripe ADR and capability map first**.
- **Must decide (required before any code — these are the "Stripe architecture decision"):**
  - Official Stripe Node SDK, pinned version + API version.
  - Connect Accounts v2 controller properties; platform vs connected-account ownership.
  - Destination charges as default where suitable; separate charges and transfers for multi-party/deferred routing; when direct charges are allowed.
  - Application-fee ownership; refund source; transfer reversal; dispute ownership; negative-balance liability.
  - Checkout Session vs PaymentIntent per flow; Billing Product/Price ownership.
  - Connect webhook scope; TEST/LIVE strategy; trusted `Stripe-Account` context; signature-verified raw-body webhook.
- **Write-capable:** Yes (wraps writes) — gated identically to Xendit; TEST mode only in this wave.
- **Gate:** ADR approved → capability map → spec → Plan → Tasks → implement + contract/unit tests.

### Wave 2 — account platform

#### 4.11 `connected-accounts`
- Input: `xendit-remaining-sdk-and-http-gaps.md` §8 H1; `xendit-platform-product-decisions.md` §7; `SPEC-provider-domain.md` (`ProviderAccount`).
- Must decide: xenPlatform `POST /v2/accounts` mapping, lifecycle/provisioning states, MANAGED vs OWNED, callback routing, activation gates (no `for-user-id` before authoritative active state); this is where Stripe Connect onboarding routes (provides the account context used by `stripe-adapter`).
- Write-capable: Yes (provisioning) — gated.

#### 4.12 `compliance-kyc`
- Input: `xendit-platform-product-decisions.md` §8; `xendit-remaining-sdk-and-http-gaps.md` §8 H2; existing `server/data/kyc.ts` (must be re-labeled as app-owned intake).
- Must decide: app-owned intake/consent/scanning/submission vs provider-owned verification status separation; encrypted/retention policy; direct-to-Xendit upload preferred; strict roles/audit; never present local submission as provider verification.
- Write-capable: Yes (sensitive submission) — gated + legal/product sign-off.

#### 4.13 `provider-dashboard`
- Input: `payment-provider-plugin-and-agent-skills.md` §8, §10; provider-connections/secrets/access/step-up specs.
- Must decide: provider catalog + connection wizard (Xendit paste-once secret; Stripe hosted Connect onboarding launcher/return), connection detail, capability/requirements, webhook health, credential rotation, disconnect/revoke confirm, TEST/LIVE separation, provider default per capability, audit history, degraded/action-required recovery; secrets never redisplayed; destructive/live actions require confirmation and strong visual distinction; locale-system-compliant text.
- Write-capable: No (UI over the connection/secrets services).
- Gate: spec → Plan → Tasks → implement + a11y/Playwright provider-simulator tests.

### Wave 3 — payment capabilities (specs may be parallel; implementation remains independently gated)

#### 4.14 `money-in`
- Input: `xendit-live-balance.md` (C1), `xendit-live-transactions.md` (C2a), `xendit-hosted-payment-links.md` (C3).
- Must decide: hosted payment (Invoice / Checkout Session), transaction list/detail reads, durable create mapping, provider-origin routing, mutable-guard for demo writes in live mode, honest cursor/no-total semantics, no Invoice+PaymentRequest double-create.
- Write-capable: Yes (hosted payment create).
- Gate: spec → Plan → Tasks → implement + contract tests.

#### 4.15 `customer-vault`
- Input: `xendit-remaining-sdk-and-http-gaps.md` §3 (C7), §5 (C9); `SPEC-provider-domain.md`.
- Must decide: customer/method mapping, ID namespace separation (app/merchant-ref/provider), idempotent create with stable reference, saved-method vault tokenization (never PAN/CVV/OTP), payment-method tab spec, no auto-subscription.
- Write-capable: Yes (customer/method create).

#### 4.16 `recurring-billing`
- Input: `xendit-platform-product-decisions.md` §9; `xendit-remaining-sdk-and-http-gaps.md` §8 H5; `SPEC-provider-domain.md`.
- Must decide: local commercial/entitlement state vs provider execution plan; versioned plan replacement; Xendit recurring (`POST /recurring/plans`, API version `2026-01-01` re-verified) and Stripe Billing; entitlement only via approved policy; cancel/replacement preserves history; immediate payment threshold.
- Write-capable: Yes.

#### 4.17 `refunds`
- Input: `xendit-remaining-sdk-and-http-gaps.md` §4 (C8); `SPEC-provider-domain.md` (refund origin routing).
- Must decide: provider-bound partial/full refund, cumulative-remaining check, stable idempotency, refund returns to original provider (never current default), cancellation only for verified cancellable state, terminal retry creates new operation.
- Write-capable: Yes — gated on financial-step-up + durable-operations.

#### 4.18 `payouts`
- Input: `xendit-payouts.md` (C5/C6); `SPEC-provider-domain.md`.
- Must decide: app-owned batches, per-recipient durable attempts, channel discovery, authorization/approval/MFA, per-recipient idempotency, asynchronous status (never immediate paid), cancellation per eligible ACCEPTED payout, terminal retry as a new attempt, account-number encryption/redaction, balance-withdrawal migration to the durable pipeline.
- Write-capable: Yes — gated.

#### 4.19 `platform-routing`
- Input: `xendit-remaining-sdk-and-http-gaps.md` §8 H3/H4; `xendit-platform-product-decisions.md` §§10–11; `SPEC-provider-domain.md`.
- Must decide: versioned split rules (immutable active version), route allocation (exactly one of flat/percent), trusted stored topology (never browser-supplied split IDs), server-derived `with-split-rule`, same-provider transfer topology, every live transfer/split change dual-controlled.
- Write-capable: Yes — gated.

#### 4.20 `balance-reporting`
- Input: `xendit-live-balance.md`; `xendit-live-transactions.md` (C2b deferred aggregates).
- Must decide: provider balances/transaction projections, source/staleness disclosure, never totals over one cursor page as complete history, balances vs app-derived ledger disclosure.
- Write-capable: No (read/report) — depends on money-in/payouts/routing/event-projection.

### Wave 4 — agent and launch controls

#### 4.21 `agent-skill-policy`
- Input: `payment-provider-plugin-and-agent-skills.md` §§2–3, 15–16.
- Must decide: repository-owned `payment-provider-integration` + `xendit-integration` skills generated only from approved specs; third-party skill pin/review/sandbox policy; deny credential collection, live money execution, `.env` reads.
- Gate: derived from all approved module specs.

#### 4.22 `launch-operations`
- Must decide: key permissions, migration/backfill/reconciliation procedure, sandbox/UAT, TEST→LIVE rollout behind feature flags, rollback/forward-fix, incident runbook, fail-closed production startup checks (secure secret backend, webhook verification, trusted public origin, MFA/policy, durable db, audit sink), drop of `provider-domain` Final Checkpoint (clean migration run + review).
- Gate: final operational gate.

## 5. Cross-cutting contracts that must be defined before adapters

These belong to the foundations above and are referenced by many modules. They should be defined **first** in their owning module and consumed everywhere:

1. **Provider registry** (server-only, `provider-connections`): explicit capability resolution, `ProviderKey = "xendit" | "stripe"`, `verifyConnection`, `getCapabilities`, capability-specific subinterfaces. No fake fallback implementations.
2. **Capability manifest** (server-only, `provider-connections`): the normalized `supported / configured / available / mode / reason / requirements / lastVerifiedAt` shape; dashboard renders from it.
3. **Connection state machine** (`provider-connections`): validated transitions, persisted and audited.
4. **Secret-store contract** (`provider-secrets`): `store / rotate / revoke / resolve`, `secret_ref` + version, paste-once, never serialized to client.
5. **Canonical error contract** (`xendit-adapter`/`stripe-adapter`): one shared safe error taxonomy with retryable flag and correlation ID.
6. **Durable operation contract** (`durable-operations`): idempotency key, request hash, unknown-outcome marker, optimistic version.
7. **RBAC + MFA + dual-control policy engine** (`organization-access` + `financial-step-up`): policy evaluation at execution time, not only at UI render.
8. **Webhook event schema registry** (`webhook-ingress`/`event-projection`): versioned per-event schemas, provider-specific verification, dedupe key.

## 6. Provider decisions that are still open and block spec authoring

These are the "ask first" items in the capability map and the unresolved provider semantics the workflow says to surface.

1. **Xendit connection is secret-key based, not OAuth.** Confirm the guided paste-once secret wizard (least-privilege permissions listed) instead of any fake OAuth claim; confirm `for-user-id` is always server-derived from trusted org/account mapping.
2. **Stripe charge/liability model.** Must be decided in the Stripe ADR before `stripe-adapter`: destination vs separate charges/transfers vs direct; application-fee ownership; refund source; transfer reversal; dispute ownership; negative-balance liability; Checkout vs PaymentIntent; Billing Product/Price ownership; Connect webhook scope.
3. **Secret backend in the dev/test sandbox.** No production KMS is available in this environment. The plan is to implement the secret-store abstraction + explicit local encrypted adapter, and **prevent LIVE activation** without a production-grade secret backend. Confirm that posture.
4. **Stripe Connect Accounts v2 onboarding** is the default; confirm Standard OAuth is not used unless a reviewed ADR selects it.
5. **`financial-step-up` scope.** Confirm dual-control is required for every live platform transfer and split-rule activation (capability-map question 3).
6. **`provider-dashboard` timing.** Confirm whether a read-only connection shell should be delivered earlier, before `connected-accounts`, or after (capability-map question 4).
7. **Money precision / supported launch currencies.** `SPEC-provider-domain.md` recommends designing Decimal for all Xendit/Stripe currencies now, with capability manifests restricting launch currencies via config. Confirm the launch set (IDR/USD?) and that capability manifests are the gate.
8. **Webhook evidence retention.** Confirm encrypted short-lived restricted payload + long-lived normalized audit (vs. storing only normalized payloads).
9. **Original `provider-domain` Final Checkpoint.** Confirm the maintainers will close the clean migration-chain run + human review before the `provider-connections` spec is considered unblocked.

## 7. Environment & secret policy to encode in specs

The current `apps/web/src/lib/env.ts` only declares `DATABASE_URL`, `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, Better Auth/Sentry/`APP_ENV`. The remaining specs must centralize and validate, per `payment-provider-plugin-and-agent-skills.md` §"Environment configuration":

- app config (already centralized via `@t3-oss/env-nextjs`);
- provider platform credentials (Xendit key, Stripe key, webhook secrets, OAuth tokens);
- secret-store configuration (KMS/encryption adapter selection);
- webhook public origin (`NEXT_PUBLIC_APP_URL` / a server-side `APP_URL`);
- TEST/LIVE enablement and feature flags;
- fail-closed production startup when LIVE operations are enabled without secure secret backend, webhook verification, trusted public origin, MFA/policy, durable DB, or audit sink.

No broad `process.env` reads; centralize in `env.ts` through typed validation.

## 8. Testing obligations carried into each module spec

Every module spec must prescribe its own tests so the assertions are traceable. Cross-module obligations:

- **Unit:** adapter normalization, canonical errors, capability resolution, state-machine transitions, provider-origin routing, policy/RBAC, MFA binding, idempotency, webhook event normalization, out-of-order transitions, redaction, split/transfer/refund thresholds.
- **Contract:** one provider-neutral contract suite run against Xendit test double, Stripe test double, and (only where explicitly allowed) a mock adapter.
- **HTTP integration:** recorded/sanitized fixtures or local mock servers; never commit secrets; synthetic test secrets for signature verification; test timeouts, malformed payloads, 429, 5xx, ambiguous disconnects; trusted account headers server-derived.
- **PostgreSQL integration:** disposable local/CI Postgres; migration chain; org isolation; provider-ID scope; connection lifecycle; webhook dedupe; operation idempotency; approval races; optimistic concurrency; unknown-outcome reconciliation; split-version immutability; refund/payout/transfer topology.
- **E2E (Playwright):** deterministic TEST-mode provider simulators covering connect success/invalid key/wrong mode/missing permission, Stripe cancel/refresh/requirements pending, unauthorized role, MFA required/expired/replayed, secret never in DOM/log/API, webhook valid/invalid/duplicate/out-of-order, default-provider switch affects only new resources, refund returns to original provider, degraded state, rotation, disconnect w/ referenced resources, test/live separation, hosted payment lifecycle, payout approval/recovery, subscription webhook cycle, transfer/split approval.
- **Never:** real cardholder data, live financial operations, provider credentials in fixtures.

## 9. Observability & security obligations carried into each spec

Each module spec must include the redacted structured fields (organization ID, provider, connection ID, mode, canonical resource ID, operation ID, provider request correlation ID, webhook event ID, state transition, latency/result) and the forbidden-log fields (API keys, OAuth tokens, webhook secrets, raw Authorization headers, PAN/CVV/OTP, unredacted KYC documents, full raw provider payloads). Metrics must cover connection verification failures, capability degradation, webhook verification failures, duplicate events, projector lag, UNKNOWN operations, refund/payout/transfer failures, approval latency, secret rotation age.

Threat-model obligations (per the brief): IDOR across orgs; forged provider account IDs; forged webhooks; OAuth state substitution; leaked keys/tokens/webhook secrets; replayed MFA proof; replayed operation; duplicate financial writes; cross-mode confusion; cross-provider refund routing; metadata/log injection; SSRF through provider URLs; open redirects; webhook payload exhaustion; privilege escalation; requester self-approval; stale approval after mutation.

## 10. Definition of done for this gate

This specification plan is "done" as a gate when the maintainers approve:

1. The dependency-complete module sequence and the precedence of Wave 0 foundations before any provider write capability.
2. The division: `provider-domain` is a completed prerequisite; the outstanding Final Checkpoint items (clean migration run + human review) are scheduled before `provider-connections` is called unblocked.
3. The "research docs are inputs, not code" rule and the requirement for each module to have its own focused spec/Plan/Tasks gate.
4. The Stripe ADR requirement before `stripe-adapter`.
5. The secret-store posture (abstraction + local adapter now; LIVE blocked without production KMS).
6. The provider decisions in §6 that the maintainers resolve now or explicitly defer to the owning module gate.

**Explicitly out of scope for this gate:** any implementation code, any provider SDK call, any secret handling, any webhook change, any page/action/route/UI, any migration beyond the already-merged `provider-domain` set, any Stripe dependency, and any live financial operation.

## 11. Required agent reporting (this gate)

- **Module & phase:** provider initiative — Phase 0 continuation → Phase 1 specification tranche planning. No implementation.
- **Files changed:** `docs/spec/remaining-capability-specification-plan.md` (new). No source, schema, migration, or configuration change.
- **Migrations added:** none (this gate).
- **Tests run & exact results:** none executed in this sandbox because `node_modules` is not installed (`corepack pnpm install --frozen-lockfile` would be required first). Reported baseline is from `docs/spec/provider-domain-verification-matrix.md`: focused domain/repository 51/51 (at split-rule point); full suite 329/331 with two pre-existing `getBalanceTrend` failures; one isolated flaky UI-dialog test. These must be re-run at the `provider-domain` Final Checkpoint.
- **Known baseline failures:** the two `getBalanceTrend` failures are pre-existing and unrelated to provider-domain. No new failures introduced (no code changed).
- **Security boundaries verified (by inspection only):** provider SDK imports confined to `apps/web/src/lib/xendit.ts`; domain/repositories are provider-neutral; no secret column in the canonical schema; organization-scoped repository contracts present; no-browser-trusted `for-user-id`/account-context handling is required by every adapter spec.
- **Unresolved questions:** see §6 (provider decisions) and each module's `must decide` list.
- **Explicitly out of scope / not claimed:** no provider connection, secret storage, RBAC/MFA, durable operation, webhook, adapter, dashboard UI, or payment flow is implemented or claimed as end-to-end. The `provider-domain` Final Checkpoint is not claimed complete because the clean migration run + human review are outstanding.

## 12. Next action

Proceed to write the **Phase 1 specification for `provider-connections`** (`docs/spec/SPEC-provider-connections.md`) only after this plan receives human approval. The next module's Plan, Tasks, and Implement gates follow in sequence. No code (domain, repository, adapter, action, page, or route) is written at any specification-plan or module-spec gate.
