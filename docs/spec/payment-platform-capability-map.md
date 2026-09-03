# Capability Map: Multi-Provider Payment Platform

> Workflow: Addy Osmani `spec-driven-development` — Phase 0 Scope Check  
> Status: **PROPOSED — HUMAN REVIEW GATE**  
> Date: 2026-09-03 (+07:00)  
> Rule: module IDs below are stable kebab-case identifiers and must not be renamed after approval.

## Assumptions surfaced before specification

1. The product is a multi-tenant web dashboard built with the existing Next.js application.
2. PostgreSQL/Prisma remains the durable relational store.
3. Better Auth remains the application identity/session provider unless a separate ADR changes it.
4. Xendit and Stripe can both be connected to one organization, in test and live mode separately.
5. “Easy as clicking Connect” means a common provider-catalog entry point with provider-appropriate secure setup; it does not imply fake OAuth support for Xendit.
6. Stripe uses hosted Connect onboarding by default; Xendit uses a guided paste-once secret flow until an approved Xendit OAuth/partner flow exists.
7. Canonical resources retain their originating provider permanently; changing defaults affects only new resources.
8. Xendit remains required, including xenPlatform, KYC synchronization, recurring plans, transfers, and split rules.
9. Local KYC workflow and local subscription/entitlement records coexist with provider-owned verification/payment execution.
10. Financial writes require least privilege, durable audit, step-up MFA, and dual control at the approved thresholds.
11. Existing mock mode remains available for development and demos, but configured provider failures never fall back to mock success.
12. No implementation code begins until this map, then each module's Specify → Plan → Tasks gates, are approved.

## Module map

| Module ID | Responsibility | Depends on |
|---|---|---|
| `provider-domain` | Canonical provider-neutral ERD, resource identity, ownership, source/mode, provider extensions | — |
| `provider-connections` | Connection state machine, provider registry, capability manifest, test/live separation, verification and disconnect lifecycle | `provider-domain` |
| `provider-secrets` | KMS/secret-reference contract, paste-once credentials, OAuth token handling, rotation and redaction | `provider-domain`, `provider-connections` |
| `organization-access` | Organizations, memberships, finance/compliance roles, permission checks, tenant context | `provider-domain` |
| `financial-step-up` | WebAuthn/TOTP step-up, operation-bound challenges, dual approval, configurable thresholds | `organization-access` |
| `durable-operations` | Generic operation/idempotency records, request hashes, unknown-outcome recovery, optimistic concurrency | `provider-domain`, `organization-access` |
| `audit-ledger` | Immutable security/financial audit events and redaction policy | `provider-domain`, `organization-access` |
| `webhook-ingress` | Provider-specific verification, durable receipt, dedupe and redacted payload persistence | `provider-domain`, `provider-connections`, `provider-secrets` |
| `event-projection` | Durable outbox/jobs, retries, idempotent canonical projectors, transition guards | `webhook-ingress`, `durable-operations`, `audit-ledger` |
| `xendit-adapter` | Existing 36 SDK methods, normalized errors/contracts, direct HTTP transport for missing APIs | `provider-connections`, `provider-secrets`, `durable-operations` |
| `stripe-adapter` | Stripe SDK/API version policy, normalized errors/contracts, Connect account context | `provider-connections`, `provider-secrets`, `durable-operations` |
| `connected-accounts` | xenPlatform/Stripe Connect account mapping, onboarding lifecycle, activation gates | `organization-access`, `financial-step-up`, `xendit-adapter`, `stripe-adapter`, `event-projection` |
| `compliance-kyc` | Local intake, consent, scanning, document retention, Xendit verification and Stripe hosted requirements | `connected-accounts`, `organization-access`, `financial-step-up`, `audit-ledger`, `event-projection` |
| `money-in` | Hosted links, checkout/payment requests, canonical payments and transaction reads | `xendit-adapter`, `stripe-adapter`, `durable-operations`, `event-projection` |
| `customer-vault` | Canonical customers, provider customer mappings, saved payment methods and linking/auth flows | `xendit-adapter`, `stripe-adapter`, `durable-operations`, `event-projection` |
| `recurring-billing` | Local subscriptions/entitlements plus Xendit recurring and Stripe Billing execution/cycles | `customer-vault`, `money-in`, `durable-operations`, `event-projection` |
| `refunds` | Provider-bound partial/full refunds, cancellation, recovery and reconciliation | `money-in`, `financial-step-up`, `durable-operations`, `event-projection` |
| `payouts` | App-owned batches, recipient attempts, channel discovery, Xendit/Stripe execution and cancellation | `connected-accounts`, `financial-step-up`, `durable-operations`, `event-projection` |
| `platform-routing` | Xendit split rules/transfers and Stripe application fees/transfers with versioned assignments | `connected-accounts`, `money-in`, `financial-step-up`, `durable-operations`, `event-projection` |
| `balance-reporting` | Provider balances, transaction projections, exports, analytics and source/staleness disclosure | `money-in`, `payouts`, `platform-routing`, `event-projection` |
| `provider-dashboard` | Connect/manage/rotate/disconnect UX, capability health, requirements, provider defaults | `provider-connections`, `provider-secrets`, `organization-access`, `financial-step-up` |
| `agent-skill-policy` | Repository-owned payment-provider and Xendit skills; third-party skill pin/review/sandbox policy | approved specs for all modules it encodes |
| `launch-operations` | Key permissions, migrations, backfill, reconciliation, sandbox/UAT, rollout/rollback and incident runbooks | all shipping modules |

## Dependency direction

```text
provider-domain
├── provider-connections ── provider-secrets ── webhook-ingress
├── organization-access ── financial-step-up
├── durable-operations
└── audit-ledger

(provider foundations)
  ├── xendit-adapter
  ├── stripe-adapter
  └── event-projection

(adapters + projection + access)
  └── connected-accounts
      ├── compliance-kyc
      ├── payouts
      └── platform-routing

money-in ── customer-vault ── recurring-billing
money-in ── refunds
money-in + payouts + platform-routing ── balance-reporting

provider foundations ── provider-dashboard
approved specifications ── agent-skill-policy
all shipping modules ── launch-operations
```

There are no intended dependency cycles. Provider adapters translate external APIs; canonical modules do not import provider SDKs. Event projectors depend on canonical contracts and invoke domain transition interfaces rather than creating reverse dependencies from the domain into webhook routes.

## Recommended build/specification order

### Wave 0 — foundations, sequential

1. `provider-domain`
2. `provider-connections`
3. `provider-secrets`
4. `organization-access`
5. `financial-step-up`
6. `durable-operations`
7. `audit-ledger`
8. `webhook-ingress`
9. `event-projection`

### Wave 1 — provider adapters, parallel after foundations

10. `xendit-adapter`
11. `stripe-adapter`

### Wave 2 — account platform

12. `connected-accounts`
13. `compliance-kyc`
14. `provider-dashboard`

### Wave 3 — payment capabilities

15. `money-in`
16. `customer-vault`
17. `recurring-billing`
18. `refunds`
19. `payouts`
20. `platform-routing`
21. `balance-reporting`

`refunds`, `payouts`, and `platform-routing` may be specified in parallel once their dependencies are approved, but financial implementation remains independently gated.

### Wave 4 — agent and launch controls

22. `agent-skill-policy`
23. `launch-operations`

## Existing specifications mapped to modules

| Existing document | Module coverage |
|---|---|
| `xendit-shared-contracts.md` | partial `xendit-adapter`, `provider-connections` |
| `xendit-live-balance.md` | partial `balance-reporting` |
| `xendit-live-transactions.md` | partial `money-in`, `balance-reporting` |
| `xendit-hosted-payment-links.md` | partial `money-in` |
| `xendit-payouts.md` | partial `payouts` |
| `xendit-remaining-sdk-and-http-gaps.md` | partial adapter/account/KYC/recurring/refund/vault modules |
| `xendit-platform-product-decisions.md` | product decisions across account, KYC, recurring, routing and access modules |
| `payment-provider-plugin-and-agent-skills.md` | partial connections/adapters/dashboard/skill policy |

These documents are research inputs. After this map is approved, each stable module receives a focused module specification. Existing documents should be referenced rather than copied wholesale.

## Scope boundaries

### Always

- Preserve provider/resource identity.
- Validate external responses at runtime.
- Keep SDK and direct HTTP access server-only.
- Persist financial writes and unknown outcomes durably.
- Require authorization, audit and approved MFA/dual-control policy.
- Keep provider-specific verification and canonical projection separate.
- Preserve explicit mock/test/live distinctions.

### Ask first

- Change module boundaries or dependency direction.
- Add provider or payment dependency.
- Change database schema.
- Change financial threshold, approval or retention policy.
- Choose Stripe charge/liability model.
- Enable new live Xendit/Stripe capability.

### Never

- Commit or expose secrets.
- Store raw card credentials, CVV or OTP.
- Trust browser-provided account context, provider IDs, split-rule IDs or privileged headers.
- Fall back from configured provider failure to mock success.
- Execute live money movement from an agent or test.
- Reverse-engineer provider Dashboard endpoints.
- Claim feature parity where a provider lacks the capability.

## Map acceptance criteria

1. Every independently testable capability has one stable module owner.
2. Every module has one-way dependencies and no cycle.
3. Xendit and Stripe adapters depend on canonical foundations, not vice versa.
4. Financial writes cannot precede access, MFA, durable operations, audit and event projection.
5. KYC and recurring billing preserve dual local/provider ownership.
6. Provider dashboard cannot access raw secrets.
7. Existing Xendit research maps into the new modules without becoming implementation code.
8. Agent skills are generated only from approved specifications.
9. Launch operations are a first-class gate rather than an afterthought.
10. Human approves this map before the `provider-domain` Phase 1 specification is written.

## Human review questions

1. Approve these stable module IDs and boundaries?
2. Approve the dependency order, especially foundations before provider/payment work?
3. Should `financial-step-up` require dual control for every live platform transfer and split-rule activation as currently specified?
4. Should `provider-dashboard` arrive after connected accounts, or should a read-only connection shell be specified earlier?
5. Is any provider besides Xendit and Stripe required in the first release?

## Gate

Per Addy Osmani's spec-driven-development workflow, this Phase 0 capability map must be reviewed before proceeding to Phase 1 `provider-domain` specification. No Plan, Tasks, or Implement phase has started.
