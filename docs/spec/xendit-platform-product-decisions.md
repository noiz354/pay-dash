# Xendit Platform Product Decisions and Full-Scope Specification

> Status: **PRODUCT DIRECTION CONFIRMED; IMPLEMENTATION NOT YET APPROVED**  
> Date: 2026-09-03 (+07:00)  
> Inputs confirmed by product owner: xenPlatform required; KYC both in-app and Xendit; local and Xendit subscriptions coexist; transfers required; split rules required; financial RBAC to be designed; MFA required.

## 1. Confirmed product decisions

| Area | Decision |
|---|---|
| xenPlatform sub-accounts | Required |
| KYC | Both: app intake/workflow plus submission/status synchronization with Xendit |
| Subscriptions | Both: app-owned commercial subscription record plus Xendit recurring execution plan |
| Platform balance transfers | Required |
| Split rules/platform fee routing | Required |
| Financial write roles | Use purpose-built least-privilege finance roles described below |
| Step-up/MFA | Required for sensitive financial and platform operations |
| Current phase | Specifications and research only; no integration code |

## 2. Bounded-context decisions

“Both” does not mean duplicating ownership. Each system has a distinct responsibility.

### KYC

**Application owns:**

- merchant onboarding case;
- consent and disclosure records;
- upload intake and malware-scan state;
- checklist/workflow state;
- operator review notes;
- encrypted temporary document references;
- submission attempts and audit trail.

**Xendit owns:**

- account-holder verification resource;
- required verification documents submitted to Xendit;
- verification request/status;
- account activation eligibility;
- authoritative Xendit compliance outcome.

The application may display synchronized Xendit status but may not invent approval.

### Subscriptions

**Application owns:**

- product/plan catalog and price policy;
- entitlement/access state;
- internal subscription/customer relationship;
- commercial amendments and cancellation intent;
- local reporting and support history.

**Xendit owns:**

- recurring payment execution plan;
- schedule/cycles;
- ranked payment methods;
- payment attempts and retries;
- payment actions;
- payment status/failure outcomes.

A local subscription and Xendit recurring plan are linked one-to-one or versioned one-to-many by explicit IDs; neither is inferred from email/name.

## 3. Target platform topology

```text
Platform Organization (master)
  -> OrganizationMembership / RBAC
  -> SubMerchant
       -> Xendit Account Mapping
       -> KYC Case -> Xendit Account Holder / Verification
       -> Customer mappings
       -> Payment Methods
       -> Local Subscription -> Xendit Recurring Plan
       -> Split Rule assignments
       -> Transactions / Balance / Payouts / Refunds
  -> Platform Transfers between authorized Xendit accounts
```

## 4. Recommended financial RBAC

The current `ADMIN | DEVELOPER | ANALYST | RISK_ANALYST` catalog is insufficient for production money movement. Replace the single broad ADMIN assumption with these roles:

### OWNER

- organization governance and emergency authority;
- manage finance approvers and security policy;
- approve high-value transfers/payouts/refunds;
- manage split-rule activation;
- cannot bypass MFA, audit, or dual-control policy.

### FINANCE_ADMIN

- create/review/release payouts;
- create platform transfers;
- issue refunds within configured limits;
- manage beneficiaries and payout schedules;
- approve finance operations created by another actor;
- cannot manage organization owner or authentication policy.

### FINANCE_OPERATOR

- create drafts, import payout recipients, prepare transfers/refunds;
- inspect financial records;
- cannot release/approve own sensitive operation;
- cannot activate split rules or change finance limits.

### DEVELOPER

- integration configuration, test credentials, webhook diagnostics;
- test-mode simulations;
- no live payout, transfer, refund, beneficiary, or split-rule approval.

### ANALYST

- read/export authorized financial data;
- no mutations.

### COMPLIANCE_ANALYST

- KYC case review and submission preparation;
- block/return incomplete cases;
- cannot self-approve Xendit verification outcome;
- cannot move funds.

### RISK_ANALYST

- review risk signals and recommend holds;
- no direct payout/transfer/refund release unless separately assigned Finance Admin through explicit multi-role policy.

### SUPPORT

- limited customer/payment inspection and support notes;
- may prepare refund request but cannot approve it.

## 5. Authorization matrix

| Operation | Prepare | Approve/execute | Dual control | MFA |
|---|---|---|---|---|
| Create sub-account | Compliance/Finance Operator | Owner or Finance Admin | Recommended for live | Required |
| Submit KYC to Xendit | Compliance Analyst | Compliance lead/Owner policy | Required for live legal submission | Required |
| Create payout batch | Finance Operator/Admin | — | No for draft | Session required |
| Release payout | Finance Operator/Admin | Finance Admin or Owner | Required above threshold; creator cannot approve | Required |
| Retry terminal payout | Finance Operator prepares | Finance Admin/Owner | Same as new payout | Required |
| Cancel eligible payout | Finance Operator/Admin | Finance Admin/Owner | Based on threshold/risk | Required |
| Prepare refund | Support/Finance Operator/Admin | — | No | Session required |
| Execute refund | Finance Admin/Owner | Finance Admin/Owner | Required above threshold or if preparer same actor | Required |
| Create platform transfer | Finance Operator/Admin | Finance Admin/Owner | Always for live transfer | Required |
| Create split-rule draft | Finance Admin | — | No for draft | Session required |
| Activate/change split rule | Finance Admin/Owner | different Finance Admin or Owner | Always | Required |
| Create recurring plan | Finance Operator/Admin | policy-dependent | Required if immediate payment/high amount | Required when charging immediately |
| Deactivate recurring plan | Finance Operator/Admin | Finance Admin or authorized support policy | Optional by threshold | Required for bulk/high impact |
| Test simulation | Developer | Developer | No | Session required; development key only |

## 6. Default thresholds and policy configuration

Thresholds are configuration, not hardcoded UI constants. Initial recommended IDR policy:

- payout/terminal retry: dual approval at **IDR 25,000,000 per recipient** or **IDR 100,000,000 per batch**;
- refund: dual approval at **IDR 10,000,000** or more than **50% of original payment**, whichever triggers first;
- platform transfer: dual approval for **every live transfer**;
- split-rule activation/change: dual approval for every live change;
- KYC legal submission: dual review for every live submission;
- recurring immediate payment: dual approval at **IDR 10,000,000** or above;
- bulk recurring changes: dual approval when impacting more than 10 active plans.

Before production, risk/compliance/product must approve these defaults. Currency conversion requires per-currency configured limits; no implicit IDR conversion.

## 7. xenPlatform account specification

### Manual HTTP capability

Current official API family: `POST /v2/accounts`, with account update/retrieval and lifecycle callbacks to be enumerated from current API reference before implementation.

### Local records

```text
SubMerchant
XenditAccountMapping
AccountProvisioningOperation
AccountLifecycleEvent
```

Store app organization/sub-merchant ID separately from Xendit account/business ID.

### Provisioning lifecycle

```text
DRAFT -> APPROVAL_REQUIRED -> SUBMITTING -> SUBMITTED
-> CREATED/INVITED -> VERIFICATION_REQUIRED/IN_REVIEW
-> ACTIVE or REJECTED/SUSPENDED/FAILED
```

Exact Xendit statuses/events replace placeholders after contract verification.

### Acceptance baseline

- authenticated approved operation;
- unique email/reference policy;
- MANAGED versus OWNED chosen explicitly and validated for Indonesia/account availability;
- durable request hash and recovery;
- API permission check;
- Xendit ID persisted;
- no downstream `for-user-id` use before authoritative active state;
- lifecycle callbacks are durable/idempotent;
- cross-tenant mapping is impossible;
- no mock activation in live mode.

## 8. Dual-path KYC specification

### Intake

- country/entity-specific forms;
- explicit consent and privacy notice version;
- file allowlist, size limits, malware scan, content-type verification;
- direct-to-Xendit upload preferred when supported; otherwise encrypted temporary object storage;
- never store document bytes in database rows or logs.

### Xendit synchronization

Manual HTTP families to verify:

- account holder create/update/get;
- file upload;
- link account holder to `/v2/accounts/{id}`;
- verification request/status;
- required callbacks.

### State separation

```text
app_intake_status
xendit_submission_status
xendit_verification_status
xendit_account_status
```

“Submitted locally” never renders as “verified by Xendit.” Xendit rejection reasons are normalized and access-controlled.

### Retention

- retain only what is legally/product required;
- purge temporary uploads after confirmed Xendit receipt plus approved grace period;
- legal hold overrides are audited;
- document access is short-lived signed URL only;
- every view/download/submission is audited.

## 9. Dual subscription specification

### Manual HTTP API family

Current official reference includes:

- `POST /recurring/plans`;
- get plan;
- `PATCH /recurring/plans/{id}`;
- `POST /recurring/plans/{id}/deactivate`;
- list/get/update cycles;
- test-only cycle simulation;
- API version currently documented as `2026-01-01`.

Exact complete endpoint/method matrix must be captured from current OpenAPI/reference before implementation.

### Local mapping

```text
LocalSubscription
XenditRecurringPlanMapping
RecurringPlanOperation
RecurringCycleProjection
EntitlementEvent
```

### Rules

- local subscription can exist before payment execution setup;
- Xendit plan ID is persisted, never derived;
- local ACTIVE entitlement requires explicit product policy: payment-plan active, latest cycle status, grace period, and manual override;
- local cancellation intent and Xendit deactivation are separate durable steps;
- PaymentMethod mapping is prerequisite;
- immediate payment requires MFA and threshold approval;
- `with-split-rule` is server-derived from active assignment;
- test simulation is impossible with live credentials;
- recurring callbacks update cycle projection idempotently.

## 10. Platform transfer specification

### Manual HTTP capability

Current documented create endpoint: `POST /transfers`. Retrieval/status endpoints and idempotency/reference behavior must be verified from current API reference.

### Local operation

```text
PlatformTransfer
source_account_mapping_id
destination_account_mapping_id
reference UNIQUE
amount/currency
request_hash
status
xendit_transfer_id
prepared_by / approved_by
```

### Rules

- source and destination are distinct active authorized Xendit accounts;
- organization relationship permits the route;
- Indonesia/same-region and same-currency constraints are validated from current rules;
- transfer always requires a second approver and MFA;
- approver differs from preparer;
- stable unique reference and ambiguous-result recovery;
- balance precheck is advisory, not a concurrency guarantee;
- no use for external bank/e-wallet payout;
- no arbitrary account ID from browser;
- webhook/read reconciliation drives terminal state.

## 11. Split-rule/platform-fee specification

### Manual HTTP capability

Current documented create endpoint: `POST /split_rules`. Current PaymentRequest API supports `with-split-rule`; full split-rule retrieval/update/deactivation lifecycle must be verified.

### Local model

```text
SplitRuleDefinition (immutable version)
SplitRoute
XenditSplitRuleMapping
SplitRuleAssignment
SplitRuleApproval
```

### Rules

- draft versions are app-owned;
- each route uses either flat amount or percent, never ambiguous both;
- percentage range/precision and currency follow current API constraints;
- route reference is unique within rule;
- destination resolves from authorized active account mapping;
- total percentage/flat feasibility is validated;
- activating/changing a live rule requires different approver plus MFA;
- prior versions remain auditable;
- `with-split-rule` comes only from active server-side assignment;
- browser cannot supply split-rule ID;
- payment/refund accounting specifies fee reversal behavior before launch.

## 12. MFA/step-up specification

Detailed implementation is deferred, but the contract is mandatory:

### Required assurance

- recent primary authentication;
- enrolled phishing-resistant method preferred (WebAuthn/passkey), TOTP acceptable fallback;
- recovery codes handled separately;
- SMS alone is not sufficient for financial approval;
- step-up proof is operation-bound, actor-bound, organization-bound, short-lived, and single-use for high-risk writes.

### Challenge binding

Challenge includes a digest of:

```text
operation type
resource/version
amount/currency where relevant
destination/account count
organization
actor
expiry
nonce
```

Changing amount, destination, recipient set, split routes, or operation version invalidates prior approval and MFA proof.

### Dual control

- preparer cannot be sole approver where dual control is required;
- two sessions for one user do not count as two approvers;
- role changes after approval invalidate pending authorization;
- deactivated users cannot approve;
- approval expires;
- execution verifies policy again transactionally.

## 13. Exact spec documents still required before implementation tranches

These are implementation-level follow-ups, not unresolved product direction:

1. xenPlatform Account HTTP endpoint/OpenAPI contract and callback names;
2. Account Holder/File/Verification endpoint schemas by Indonesian entity type;
3. Recurring full endpoint and webhook matrix;
4. Transfer create/get/recovery contract;
5. Split Rule create/get/update/versioning contract;
6. Better Auth MFA/WebAuthn implementation ADR and threat model;
7. Prisma ERD/migration/retention/encryption specification;
8. financial authorization policy engine and tests;
9. webhook event schema registry/outbox worker plan;
10. key-permission and environment rollout runbook.

## 14. Approval result

The product scope is now fixed as follows:

- build xenPlatform support;
- support both local and Xendit KYC responsibilities without conflating status;
- support both local subscriptions and Xendit recurring execution;
- support platform transfers;
- support split rules/platform fees;
- adopt purpose-built finance/compliance roles;
- require MFA and dual control for defined sensitive operations;
- complete endpoint-level specs before any corresponding code tranche.
