# Specification: Remaining Xendit SDK Functions and Manual HTTP Gaps

> Status: **RESEARCH COMPLETE / PROPOSED FOR HUMAN APPROVAL**  
> Date: 2026-09-03 (+07:00)  
> SDK: `xendit-node@7.0.0`  
> Scope: Customer, Refund, PaymentMethod, deferred PaymentRequest, webhooks, tenancy, subscriptions, and capabilities absent from the SDK

## 1. Purpose

This document completes the pre-code specification inventory for every remaining SDK method and explicitly separates:

1. functionality available in `xendit-node@7.0.0`;
2. functionality requiring direct authenticated HTTP requests because it is not exposed by this SDK version;
3. functionality with no approved public API and therefore requiring Xendit Dashboard/manual operation;
4. app-owned functionality that must not be sent to Xendit.

No direct HTTP integration may be implemented until its current Xendit API reference, permissions, headers, version, regional availability, and webhook contract are re-verified.

## 2. Remaining SDK function coverage

### Customer — 4 methods

| Method | App target | Decision |
|---|---|---|
| `createCustomer` | customer create flow | Live integration after durable ID mapping |
| `getCustomer` | customer detail | Fetch by stored Xendit customer ID |
| `getCustomerByReferenceID` | recovery/lookup | Fetch by stable app reference; response is a collection wrapper |
| `updateCustomer` | customer edit | Patch supported Xendit fields only |

### Refund — 4 methods

| Method | App target | Decision |
|---|---|---|
| `createRefund` | transaction detail refund dialog | Durable idempotent operation required |
| `getRefund` | refund detail/recovery | Reconcile known refund ID |
| `getAllRefunds` | transaction/invoice refund history | Cursor-aware filtered list |
| `cancelRefund` | pending refund action | Only when current status is cancellable |

### PaymentMethod — 8 methods

| Method | App target | Decision |
|---|---|---|
| `createPaymentMethod` | new customer Payment Methods tab | Requires channel-specific UX and safe data handling |
| `getPaymentMethodByID` | method detail | Normalized/redacted read |
| `getPaymentsByPaymentMethodId` | method payment history | SDK returns `object`; runtime schema/API docs required |
| `patchPaymentMethod` | activate/inactivate/update supported types | Type/status-specific patch only |
| `getAllPaymentMethods` | customer method list | Cursor-aware list |
| `expirePaymentMethod` | unlink/expire action | Confirmation and irreversible-state handling |
| `authPaymentMethod` | linking OTP | Short-lived auth flow with attempt controls |
| `simulatePayment` | test-mode only | Never available with live credentials |

### PaymentRequest — 8 methods, formally deferred from hosted links

| Method | Future target |
|---|---|
| `createPaymentRequest` | channel-specific checkout |
| `getPaymentRequestByID` | request detail/recovery |
| `getPaymentRequestCaptures` | capture history |
| `getAllPaymentRequests` | cursor list |
| `capturePaymentRequest` | manual-capture card flow |
| `authorizePaymentRequest` | payment authentication |
| `resendPaymentRequestAuth` | OTP/auth resend with throttling |
| `simulatePaymentRequestPayment` | test mode only |

All previously specified SDK methods are covered by:

- Balance: `docs/spec/xendit-live-balance.md`
- Transaction: `docs/spec/xendit-live-transactions.md`
- Invoice: `docs/spec/xendit-hosted-payment-links.md`
- Payout: `docs/spec/xendit-payouts.md`
- Customer/Refund/PaymentMethod/PaymentRequest: this document

## 3. Customer detailed specification (C7)

### Existing code map

- `apps/web/src/server/data/customers.ts`
- `apps/web/src/server/actions/customers.ts`
- customer list/detail pages and components
- customer CSV export
- transaction-derived customer metrics
- subscriptions reference app customer IDs

### Domain decision

A customer has distinct identifiers:

```text
app_customer_id
merchant_reference_id (stable, unique)
xendit_customer_id (nullable until linked, unique)
```

Email is contact data, not the primary reconciliation key. Current `customerIdFromEmail` remains mock-only and is not sufficient for live identity.

### Required persistence

Persist customer mapping, sync state, source, request hash, Xendit ID, and timestamps. `createCustomer` retries reuse a stable idempotency key. Ambiguous outcomes recover via `getCustomerByReferenceID` before another create.

### Behavior

- Xendit has no mapped general list-all-customer method; live directory comes from durable app customer records.
- `getCustomer` refreshes a known mapping.
- reference lookup is recovery, not global search.
- app status `ACTIVE/REVIEW/BLOCKED/NEW` is app-owned risk/CRM state unless an exact Xendit field is verified.
- archive remains app-owned; there is no mapped delete/archive SDK method.
- LTV, payment count, methods, and channels derive from transaction/payment data, not Customer API.
- raw address/phone/identity details are minimized and redacted.

### Acceptance baseline

1. create is authorized, persisted, and idempotent;
2. duplicate/timeout recovery uses stable reference;
3. ID namespaces never collapse into one field;
4. detail refresh uses stored Xendit ID;
5. patch sends only supported changed fields;
6. no global customer list is fabricated from reference lookup;
7. archive never claims deletion at Xendit;
8. configured failure never substitutes seeded customer as live;
9. PII is absent from logs and unnecessary client payloads;
10. `forUserId` is omitted until C11.

### Expected integration files

- Prisma customer mapping schema/migration;
- Xendit customer adapter/tests;
- customer facade/actions/tests;
- customer list/detail/create/edit UI;
- exports and dependent subscription customer picker.

## 4. Refund detailed specification (C8)

### Existing code map

- `apps/web/src/server/data/transactions.ts` mock refund mutation;
- `apps/web/src/server/actions/transactions.ts:84`;
- `apps/web/src/components/transactions/refund-dialog.tsx`;
- transaction detail, balance movements, audit, reports.

### Required durable operation

```text
refund_operation_id
actor_id
transaction/product/payment_request/invoice linkage
reference_id UNIQUE
idempotency_key UNIQUE
request_hash
xendit_refund_id UNIQUE nullable
amount, currency, reason
status, failure_code
created_at, updated_at
```

### Behavior

- eligibility is based on the underlying refundable Xendit product/payment, not only universal Transaction status;
- cumulative confirmed plus in-flight refunds cannot exceed refundable amount;
- same-attempt retry reuses idempotency key/payload;
- terminal retry creates a new operation only when product rules allow it;
- `getRefund` recovers known operations;
- `getAllRefunds` is filtered by payment request/invoice and cursor-aware;
- `cancelRefund` renders only for a verified cancellable state;
- local transaction refunded amount changes only after validated Xendit state/projector, never immediately as a mock mutation;
- refund status converges through reads/webhooks.

### Acceptance baseline

1. unauthorized requests make zero SDK calls;
2. amount/currency/remaining refundable checks are transactional;
3. duplicate submissions cannot duplicate refunds;
4. configured errors do not alter transaction/balance;
5. status and cancellation eligibility come from verified Refund models/docs;
6. list pagination does not invent totals;
7. refund and original payment remain linked;
8. reason and PII are redacted in logs;
9. mock refund remains available only in explicit mock mode;
10. `forUserId` is server-derived only after C11.

## 5. Payment Method detailed specification (C9)

### Existing gap

- no payment-method page/data module exists;
- customer detail is the intended host;
- subscriptions exist but are not equivalent to payment methods;
- `apps/web/src/lib/xendit.ts` currently fails to expose `PaymentMethod` despite SDK support.

### Product boundary

Create a separately approved customer Payment Methods tab. Do not add vaulting invisibly to subscription creation. A vaulted method authorizes future charging; it does not itself schedule a subscription.

### Security rules

1. App never stores PAN, CVV, OTP, full bank credentials, or reusable secrets.
2. Sensitive collection must use Xendit-supported tokenization/redirect/action flows; server forms may not become a raw card vault.
3. Method DTO exposes masked display fields, type, reusability, status, channel, customer/reference IDs, actions, and timestamps only.
4. OTP/auth payloads are short-lived, rate-limited, never logged, and never persisted in plaintext.
5. Simulations require explicit test-mode credentials/environment.

### Method behavior

- create request varies by payment-method type and gets a per-type spec before UI enablement;
- list is scoped to a persisted Xendit customer ID;
- patch only exposes transitions/fields documented for that type;
- expire is confirmed and irreversible in UI;
- auth handles expiry, resend limits, and safe generic errors;
- payments history cannot be implemented from the SDK's generic `object` return until runtime/API response schema is verified;
- unknown types/statuses render read-only.

### Acceptance baseline

1. wrapper exposes PaymentMethod without adding another direct SDK import;
2. customer mapping is required;
3. no raw card/bank secret enters app persistence/logs;
4. list/detail normalize and redact;
5. create/patch/expire/auth are type/status constrained;
6. OTP attempts are rate-limited and safe;
7. simulation is impossible in live mode;
8. unknown response cannot be treated as successful;
9. subscriptions are not auto-created;
10. payment-history feature remains disabled until response schema is verified.

## 6. Webhook processing detailed specification (C10)

### Existing code map

- `apps/web/src/app/api/webhooks/xendit/route.ts`
- `apps/web/src/server/data/webhooks.ts`
- current route auth and behavior tests
- TODO `processWebhookAsync` in route
- `apps/web/src/server/dal/ledger.ts`

### Existing strengths

Token verification, envelope parsing, receive logging, dedupe intent, and fast response exist.

### Blocking problems

- current persistence is `globalThis`, not durable;
- raw/rejected payloads can be stored without comprehensive redaction;
- fallback dedupe ID uses payload truncation rather than a durable provider key policy;
- receipt and processing state are conflated;
- async work is launched in-process after response and can be lost;
- event-specific payload schemas/status transitions are absent.

### Required durable model

```text
webhook_delivery: provider_event_id UNIQUE, type, received_at,
verification_status, redacted_payload/encrypted_payload, processing_status,
attempt_count, next_attempt_at, processed_at, last_error
```

### Processing rules

1. verify before trust;
2. persist durably before 2xx;
3. unique provider event ID enforces dedupe;
4. enqueue through durable outbox/job mechanism;
5. event-specific schema validates before projection;
6. projector uses DB transaction and idempotent resource transition;
7. unknown events are retained and acknowledged without domain mutation;
8. terminal statuses cannot regress;
9. replay creates a processing attempt, not a duplicate financial mutation;
10. receipt status and processing status are separate.

### Event families required by implemented capabilities

- Invoice paid/settled/expired;
- PaymentRequest/payment success/failure/auth/capture;
- Payout status transitions;
- Refund status transitions;
- PaymentMethod linking/status events;
- xenPlatform account lifecycle if manual HTTP onboarding is implemented.

Exact names and payloads must be verified against current Xendit docs; guessed event names are forbidden.

## 7. Multi-tenant specification (C11)

### Required model

```text
Organization
OrganizationMembership(role/status)
XenditAccountMapping(organization_id, xendit_user_id, account_type, status)
```

### Rules

- browser never supplies trusted `forUserId`;
- DAL derives it from authenticated organization context;
- mapping must be active and authorized;
- platform/root-account operation is a separate privileged path;
- cross-tenant IDs are denied before SDK/HTTP calls;
- every operation audits actor, organization, Xendit target, and safe resource IDs;
- callback routing resolves business/account IDs to organization safely;
- account activation callback gates transactions on newly created sub-accounts.

## 8. Functions missing from xendit-node that need manual HTTP

These are not present among the 8 clients/36 methods verified in `xendit-node@7.0.0`.

### H1 — xenPlatform account creation and management

**Current documented endpoint family:** `/v2/accounts`.

Needed for:

- creating MANAGED/OWNED sub-accounts;
- retrieving/storing the returned Xendit account ID;
- linking account-holder/verification resources where supported;
- onboarding status lifecycle.

Repository target:

- onboarding screen/data;
- new organization/account mapping tables;
- dedicated server-only HTTP client;
- account lifecycle webhook projector.

Constraints:

- API permission must be explicit;
- account creation is asynchronous in current documentation;
- transaction capability waits for account-created/activated callback as documented;
- Indonesia account-type/verification availability must be checked at implementation time;
- never use user-supplied `for-user-id` directly.

### H2 — Account Holder, file upload, and verification requests

Needed only if the product elects to verify sub-accounts through this app rather than inviting representatives/Xendit Dashboard.

Potential direct HTTP families documented by Xendit include account holders, file upload, and account update/linking. This is highly sensitive KYC processing and requires:

- legal/privacy approval;
- document malware scanning;
- encrypted storage or direct-to-Xendit upload;
- retention/deletion policy;
- country/entity-specific schemas;
- consent and service-agreement handling;
- strict role/audit controls.

Current `server/data/kyc.ts` is an app-owned demo upload and must not be presented as Xendit verification.

### H3 — Platform balance transfers

**Current documented endpoint:** `POST /transfers`.

Needed only if the platform product transfers funds between master/sub-account balances. It requires master-account credentials, stable unique reference, source/destination account authorization, same-country/currency constraints, idempotent recovery, and durable audit.

It is not the same as Payout and must not be wired to payout recipient flows.

### H4 — Split rules

**Current documented endpoint family:** `/split_rules` and `with-split-rule` header use.

Needed for automated platform fee/revenue routing between platform/sub-accounts. The SDK exposes `withSplitRule` on PaymentRequest but does not expose split-rule CRUD among the 8 clients.

Direct HTTP spec must cover:

- rule creation/update lifecycle;
- destination authorization;
- flat/percentage validation;
- immutable versioning or safe updates;
- storage of Xendit split-rule ID;
- application via server-derived header;
- reconciliation and regional/currency support.

### H5 — Recurring subscription plans

Current Xendit docs describe a newer recurring endpoint family including `POST /recurring/plans` with an API-version header, but `xendit-node@7.0.0` has no recurring/subscription client.

Repository target:

- `apps/web/src/server/data/subscriptions.ts`;
- subscription actions/page;
- customer and payment-method mappings.

Before implementation, verify all current methods needed for create/get/list/update/deactivate/cancel, status model, attempts/cycles, callbacks, API version (`2026-01-01` in current reference), and Indonesian availability.

The existing app store comment claiming no recurring dimension is accurate for SDK v7 but does not mean no direct HTTP API exists.

### H6 — Other Platform APIs

Potential platform fee, account retrieval/update, transfer retrieval, split-rule retrieval, and callback configuration endpoints must be discovered from current official API reference when their product capability is approved. They must not be inferred from old recipes.

## 9. Direct HTTP client constitution

Any manual Xendit HTTP call must use a dedicated server-only client, not ad-hoc `fetch` scattered through actions.

Required contract:

```text
base URL allowlisted to https://api.xendit.co
Basic authorization generated server-side from secret key
request timeout + abort
JSON content negotiation
explicit API-version header where required
for-user-id / with-split-rule only from authorized server context
stable idempotency/reference where endpoint supports/requires it
safe normalized errors
runtime response validation
redacted structured logging
no automatic redirect to arbitrary hosts
bounded retries only for safe/idempotent cases
```

SDK-backed calls remain preferred where a verified SDK method exists. Manual HTTP is not used merely to bypass SDK typing.

## 10. Dashboard/manual-only gaps

No SDK or approved public API mapping is established for:

- Xendit Dashboard API-key management;
- Xendit Dashboard team/RBAC management;
- Xendit fraud rules/blocklist configuration;
- Xendit risk/velocity configuration;
- Xendit merchant profile settings;
- Xendit notification preferences;
- support documentation;
- fetching Xendit Dashboard webhook delivery logs.

Handling:

- keep app-owned behavior clearly app-owned;
- or provide “Configure in Xendit Dashboard” links;
- never create undocumented HTTP calls by reverse-engineering Dashboard traffic.

## 11. App-owned domains that should remain local

- Kinetic platform-fee billing statements;
- app users/team roles;
- app audit log;
- local fraud blocklist/rules;
- report definitions;
- payout batches/schedules/preferences;
- beneficiary aliases (with secure storage);
- UI notification preferences;
- support content;
- local webhook receipt/processing logs;
- setup checklist composition.

Xendit resources may supply facts to these domains, but do not replace their ownership automatically.

## 12. Manual HTTP acceptance baseline

For every H-series capability:

1. endpoint/method/version is cited from current official docs;
2. request and response receive runtime schemas;
3. required API-key permissions are documented and least-privileged;
4. region/account-type availability is verified;
5. authentication headers are server-only;
6. tenant and resource authorization precede the call;
7. write retry/idempotency/recovery semantics are explicit;
8. callbacks and asynchronous states are specified;
9. sensitive fields are classified, encrypted/redacted, and retained deliberately;
10. configured errors never trigger mock success;
11. tests use an injected HTTP transport, never real external calls;
12. contract fixtures exclude real credentials/PII;
13. SDK is used instead if it gains the needed supported method before implementation.

## 13. Completion matrix

| Capability | Detailed specification status |
|---|---|
| Balance | Complete — separate document |
| Transactions list/detail | Complete — separate document |
| Hosted Invoice links | Complete — separate document |
| PaymentRequest | Function inventory complete; deferred product spec |
| Payout channels/execution | Complete — separate document |
| Customer | Complete baseline in this document |
| Refund | Complete baseline in this document |
| PaymentMethod | Complete baseline in this document |
| Webhook processing | Complete baseline in this document |
| Multi-tenancy | Complete baseline in this document |
| xenPlatform accounts | Manual HTTP baseline complete; endpoint contract verification pending implementation tranche |
| Account Holder/KYC | Manual HTTP baseline; legal/product decision required |
| Platform transfers | Manual HTTP baseline; formally deferred unless platform funds movement is required |
| Split rules | Manual HTTP baseline; deferred until multi-tenancy |
| Recurring plans | Manual HTTP baseline; current API version/full lifecycle verification required |
| Dashboard-only areas | Explicitly classified; no code integration |

## 14. Approval checkpoint

Before coding begins, a human must approve:

- which manual HTTP capabilities are actual product requirements;
- whether sub-account KYC is handled in-app or delegated to Xendit;
- whether recurring plans replace the local subscription store;
- whether platform transfers/splits are required;
- Customer/Refund/PaymentMethod persistence and UX boundaries;
- durable webhook/outbox design;
- organization/role model and `forUserId` policy;
- prohibition on reverse-engineered Dashboard endpoints.
