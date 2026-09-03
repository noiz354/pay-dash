# Xendit Integration Specification Portfolio

> Status: **RESEARCH BASELINE — NO IMPLEMENTATION APPROVED YET**  
> Date: 2026-09-03 (+07:00)  
> SDK target: `xendit-node@7.0.0`  
> Governing prompt: `docs/prompts/xendit-node-mapping.prompt.md`  
> Prior audit: `docs/audit/xendit-mapping-audit.md`

## 1. Purpose

This document gathers the complete Xendit integration scope before application code is changed. It maps SDK capabilities to existing repository seams, identifies semantic mismatches, defines capability boundaries and acceptance baselines, and records the exact code areas expected to change.

This is the portfolio-level specification. Detailed implementation specs are required for each capability before that capability enters implementation. Capability 1 already has a detailed spec at `docs/spec/xendit-live-balance.md`.

## 2. Repository research summary

### Existing integration foundation

| Concern | Existing code | Finding |
|---|---|---|
| SDK dependency | `apps/web/package.json` | Pinned to `xendit-node@7.0.0` |
| SDK wrapper | `apps/web/src/lib/xendit.ts` | Server-only, null when key is absent, exports 7 of 8 clients |
| Environment | `apps/web/src/lib/env.ts:7-8` | Optional secret key and webhook token |
| Auth | `apps/web/src/lib/auth.ts` | Better Auth is implemented despite ADR text describing Clerk default |
| DAL | `apps/web/src/server/dal/*` | User and ledger only; no Xendit DAL |
| Data facades | `apps/web/src/server/data/*.ts` | Fifteen app-owned/mock modules and fifteen tests |
| Server actions | `apps/web/src/server/actions/*.ts` | Existing mutation boundaries, mostly Zod validated |
| Webhook | `apps/web/src/app/api/webhooks/xendit/route.ts` | Verify, parse, persist, dedupe, fast 200; processing is TODO |
| Persistence | Prisma schema/DAL | App persistence exists, but current feature stores largely use `globalThis` |

### Confirmed gaps and corrections

1. `apps/web/src/lib/xendit.ts` does not export `PaymentMethod`, although the SDK inventory has eight clients.
2. There is no `apps/web/src/server/dal/xendit.ts` or equivalent adapter directory.
3. The current checkout does not contain a materialized `node_modules/xendit-node` tree, so SDK declaration details recorded by commit `06fb742` cannot presently be re-read locally. Dependency installation/lock verification is a pre-implementation gate.
4. The prompt says “12 stores” in places, while the repository has fifteen functional data modules.
5. Authentication exists, but an organization-to-Xendit-account mapping for safe `forUserId` does not.
6. Xendit Invoice and the app's billing invoice are not the same domain object. `server/data/invoices.ts` represents platform fee statements derived from the app ledger; it must not be replaced blindly by Xendit hosted invoices.
7. Existing top-up, transaction retry, invoice payment, payout settlement, and payment-link simulation are demo mutations. Each must be explicitly guarded or replaced in live mode so the app never claims mock money moved at Xendit.

## 3. Integration principles (portfolio constitution)

Every capability must satisfy these rules:

1. **Server-only SDK:** direct `xendit-node` import remains confined to `lib/xendit.ts`.
2. **Normalized contracts:** UI and feature stores consume app DTOs, never raw SDK models.
3. **Explicit source:** externally sourced DTOs identify `xendit-live`, `app`, or `mock` where mixed modes can occur.
4. **No false fallback:** missing configuration may select mock mode; configured SDK failure may not silently select mock data.
5. **Auth before tenancy:** `forUserId` is forbidden until authenticated organization mapping and authorization exist.
6. **Stable idempotency:** write operations use a persistent logical-operation key, not a fresh random key on each retry.
7. **Webhook convergence:** asynchronous status changes converge through persisted, deduplicated callbacks.
8. **No invented APIs:** Dashboard-only areas stay app-owned/read-only or link to Xendit Dashboard.
9. **Mode-safe writes:** demo mutations cannot report success in live mode unless backed by a real integration.
10. **Spec then tests then code:** each capability gets acceptance scenarios and contract tests before implementation.

## 4. Proposed shared architecture

```text
Server Component / Server Action / Route Handler
  -> feature data facade (application contract)
     -> Xendit adapter/DAL (normalized SDK contract)
        -> lib/xendit.ts (only direct SDK import)
     -> app repository / mock store (offline/demo contract)
  -> audit event + safe error mapping
```

Recommended code shape, subject to per-capability approval:

```text
apps/web/src/
  lib/xendit.ts
  server/dal/xendit/
    errors.ts
    context.ts
    balance.ts
    transactions.ts
    payment-links.ts
    payouts.ts
    customers.ts
    refunds.ts
    payment-methods.ts
  server/data/*.ts
  server/actions/*.ts
```

A directory is preferable to one large `server/dal/xendit.ts`; it preserves one adapter per bounded capability while retaining a single SDK import boundary.

## 5. Capability inventory and exact code map

### C1 — Current balance (`Balance.getBalance`)

**Detailed spec:** `docs/spec/xendit-live-balance.md`  
**Priority:** 1; read-only architecture proving slice.

**Existing consumers and seams**

- `apps/web/src/server/data/balance.ts:258` — `getBalanceOverview`
- `apps/web/src/app/[locale]/balance/page.tsx:14,40`
- `apps/web/src/components/dashboard/balance-strip.tsx:4,11`
- `apps/web/src/server/actions/balance.ts` — top-up/withdraw live-mode guards
- `apps/web/src/server/data/balance.test.ts` — mock regression baseline

**Expected additions/changes**

- Xendit balance DAL + contract tests
- balance facade mode selection and source DTO
- page/dashboard source and error state
- live-mode guards for simulated top-up/withdraw

**Excluded:** movement history and trend remain derived until C2.

---

### C2 — Transaction ledger and reporting

**SDK methods**

- `Transaction.getAllTransactions`
- `Transaction.getTransactionByID`

**Existing seams**

- `apps/web/src/server/data/transactions.ts:222` — list
- `apps/web/src/server/data/transactions.ts:252` — detail
- `apps/web/src/server/data/transactions.ts:275` — metrics
- `apps/web/src/server/data/transactions.ts:320` — analytics
- `apps/web/src/app/[locale]/transactions/page.tsx`
- `apps/web/src/app/[locale]/transactions/[id]/page.tsx`
- `apps/web/src/app/[locale]/reports/builder/page.tsx`
- `apps/web/src/server/dal/ledger.ts`
- exports for transactions, audit, dashboard metrics, customer derivation, billing derivation, and balance derivation

**Required mapping research during detailed spec**

- app statuses vs Xendit transaction statuses;
- `channelCategories` vs app `CARD/ACH/VA/QRIS/EWALLET` vocabulary;
- cursor pagination vs app page-number pagination;
- amount/fee/net field availability;
- customer identity availability;
- date filter conversion and maximum limits;
- report export pagination beyond one SDK page.

**Acceptance baseline**

- exact filter translation is tested;
- cursor pagination is not faked as complete page counts;
- list and detail normalize to one app transaction DTO;
- unsupported UI fields are absent/labeled, not fabricated;
- configured failures do not show seeded transactions;
- create/retry demo actions are unavailable in live mode unless separately integrated;
- dependent derived screens declare whether they use live ledger or app-owned ledger.

**Important dependency:** C2 should precede live balance history, live analytics, and reliable customer LTV.

---

### C3 — Hosted payment links / invoices

**SDK methods**

- `Invoice.createInvoice`
- `Invoice.getInvoices`
- `Invoice.getInvoiceById`
- `Invoice.expireInvoice`

**Correct target domain**

- `apps/web/src/server/data/links.ts`, not app billing statements.
- `apps/web/src/app/[locale]/payments/links/page.tsx`
- `apps/web/src/app/[locale]/payments/links/[id]/page.tsx`
- `apps/web/src/server/actions/links.ts:71,125`

**Semantic warning**

`apps/web/src/server/data/invoices.ts` is the merchant's platform-fee billing domain. Xendit `Invoice.*` creates/reads hosted customer payment invoices. They must remain separate bounded contexts unless product requirements explicitly redefine billing.

**Required translation**

- `PaymentLink.items` -> amount + description/external reference;
- payer email and expiry -> supported invoice fields;
- Xendit invoice ID and external ID -> stable local references;
- SDK statuses -> `OPEN/PAID/EXPIRED/CANCELLED`;
- invoice URL -> link detail/share affordance.

**Acceptance baseline**

- create uses a stable unique external reference;
- list/detail/expire use Xendit in live mode;
- paid/expired states come from Xendit/webhook truth, not local clock alone;
- TEST MODE simulate button cannot create a fake successful ledger row in live mode;
- paid invoices cannot be expired;
- app billing pages are unchanged by this capability.

---

### C4 — Payment requests

**SDK methods**

- create, get-by-ID, list, captures;
- capture, authorize, resend auth;
- test-only simulate payment.

**Potential targets**

- payment-link creation where QRIS/e-wallet/VA/card flows need modern payment methods;
- transaction detail for authorization/capture lifecycle;
- future checkout/payment-request route (none currently exists as a distinct bounded UI).

**Current code requiring research**

- `apps/web/src/server/data/links.ts`
- `apps/web/src/server/actions/links.ts`
- `apps/web/src/server/data/transactions.ts`
- payment link pages/components

**Acceptance baseline**

- product chooses Invoice or PaymentRequest per creation flow; the app must not create both;
- simulate endpoint is available only with development/test credentials and explicit test mode;
- authorize/capture/resend controls render only for compatible statuses/methods;
- return URLs are allowlisted and derived server-side;
- idempotency key is persistent across retries.

**Open product decision:** whether C3 uses legacy hosted Invoice first or whether PaymentRequest replaces it. Do not implement both before this decision.

---

### C5 — Payout channels and settings

**SDK method**

- `Payout.getPayoutChannels`

**Existing seams**

- `apps/web/src/server/data/payouts.ts:689` — payout settings
- `apps/web/src/server/data/payouts.ts:716` — bank accounts
- `apps/web/src/app/[locale]/payouts/settings/page.tsx`
- `apps/web/src/server/actions/payouts.ts:220-303`

**Acceptance baseline**

- available destination channels come from Xendit in live mode;
- currency and channel-category filters are validated;
- account numbers remain app-owned sensitive input and are masked on display;
- app schedule/preferences are not mistaken for Xendit-managed settings;
- configured failure does not silently offer seeded banks as live channels.

This read-only discovery capability should precede payout creation.

---

### C6 — Payout creation, retrieval, cancellation

**SDK methods**

- `Payout.createPayout`
- `Payout.getPayoutById`
- `Payout.getPayouts`
- `Payout.cancelPayout`

**Existing seams**

- `apps/web/src/server/data/payouts.ts:456` list batches
- `apps/web/src/server/data/payouts.ts:503` batch detail
- `apps/web/src/server/data/payouts.ts:578` create batch
- `apps/web/src/server/data/payouts.ts:621` approve/release
- `apps/web/src/server/data/payouts.ts:672` cancel
- `apps/web/src/server/actions/payouts.ts:57,116,140,158,179`
- payout list/detail/bulk/settings pages
- `apps/web/src/server/data/balance.ts:401` withdrawal currently routes into mock payout batch

**Domain mismatch to resolve**

The app models one batch containing many recipients; Xendit `createPayout` creates individual payout resources. A production design needs a durable local batch and one Xendit payout ID/idempotency key per recipient. In-memory `globalThis` is not sufficient for retry safety.

**Acceptance baseline**

- batch and recipient operation records are persisted before network calls;
- each recipient has a stable reference and idempotency key;
- retries reuse the same key;
- partial success is represented per recipient;
- cancellation calls Xendit only for eligible statuses;
- raw bank numbers are never logged;
- callback/reconciliation updates local status idempotently;
- balance withdrawal is not enabled live until this capability is complete;
- process crash/retry cannot duplicate transfers.

**Hard prerequisite:** durable database schema and authenticated authorization. This is not safe as an early mock-store-only change.

---

### C7 — Customers

**SDK methods**

- create, get-by-ID, get-by-reference-ID, update.

**Existing seams**

- `apps/web/src/server/data/customers.ts:233,267,307,335`
- `apps/web/src/server/actions/customers.ts:34,76,110`
- customer list/detail pages and dialogs

**Domain mismatch to resolve**

Current customers are derived from transaction emails plus manual records. Xendit customers are explicit resources with Xendit IDs and merchant references. Archive is an app-owned state; no mapped SDK delete/archive exists.

**Acceptance baseline**

- local customer ID, merchant reference, and Xendit customer ID are distinct fields;
- create is idempotent and persists mapping;
- lookup uses known ID/reference, not exhaustive SDK listing (no general list method in mapped v7 surface);
- update sends only supported fields;
- archive remains app-owned and is labeled as such;
- LTV/payment counts continue to derive from C2 transactions, not Customer API;
- duplicate email alone is not assumed to be Xendit's identity key.

**Prerequisite:** persistence model for ID mapping; C2 for live transaction-derived metrics.

---

### C8 — Refunds

**SDK methods**

- create, get one, list, cancel.

**Existing seams**

- `apps/web/src/server/data/transactions.ts:412` — mock refund mutation
- `apps/web/src/server/actions/transactions.ts:84`
- `apps/web/src/components/transactions/refund-dialog.tsx`
- transaction detail timeline

**Acceptance baseline**

- only eligible, succeeded payments may be refunded;
- cumulative partial refund cannot exceed refundable amount;
- stable idempotency key is persisted per refund operation;
- transaction mutation occurs from confirmed SDK result/webhook, not optimistic mock status;
- cancellation is offered only for cancellable refund status;
- refund list/detail reconcile with transaction detail;
- configured errors never mutate local refunded amount;
- audit records include safe reference/idempotency metadata.

**Prerequisites:** C2 transaction mapping, durable operation records, webhook processing.

---

### C9 — Payment methods / vaulting

**SDK methods**

- create, get, list, patch, expire, auth, list payments, simulate.

**Existing seams**

- no dedicated data module or route;
- customer detail is the intended host;
- subscriptions currently use `apps/web/src/server/data/subscriptions.ts` and `server/actions/subscriptions.ts:18`;
- `lib/xendit.ts` currently omits the PaymentMethod sub-client export.

**Acceptance baseline**

- new customer-detail Payment Methods tab has its own spec/design;
- raw card/bank credentials are never stored or logged by the app;
- linking/auth states and OTP flow follow SDK status, not fabricated success;
- expire is irreversible and requires confirmation;
- simulation is restricted to test mode;
- customer-to-Xendit ID mapping exists before method creation/listing;
- subscription recurring semantics are specified separately; a payment method alone is not a subscription scheduler.

**Prerequisites:** C7 and explicit UX/product design. This is not a drop-in modification to subscriptions.

---

### C10 — Webhook processing and reconciliation

**Inbound callback models**

- Invoice, Payment, Refund callback shapes; payout event shapes must be verified against actual Xendit webhook documentation/installed SDK before coding.

**Existing seams**

- `apps/web/src/app/api/webhooks/xendit/route.ts`
- `apps/web/src/server/data/webhooks.ts`
- `apps/web/src/server/dal/ledger.ts`
- `apps/web/src/server/data/transactions.ts`
- webhook tests and UI

**Current complete behavior**

- callback token verification;
- JSON/Zod envelope parse;
- event-ID dedupe record;
- persistence to current webhook log seam;
- fast 200 response.

**Current missing behavior**

- event-specific schema validation;
- durable queue/outbox;
- idempotent domain projection;
- status transition guards;
- processing success/failure/retry state.

**Acceptance baseline**

- raw body/token contract is verified against Xendit's current callback contract;
- each supported event has a strict versioned schema;
- duplicate events cannot repeat financial mutations;
- receipt and processing status are separate;
- response remains fast after durable receipt;
- processing retries are durable;
- unknown events are retained without mutating domains;
- status transitions cannot regress terminal states;
- logs redact sensitive payload fields.

**Prerequisite:** durable persistence and at least one integrated domain projector.

---

### C11 — Multi-tenant `forUserId`

**SDK surface:** optional on most mapped methods.

**Missing foundation**

- authenticated organization membership;
- organization -> Xendit sub-account mapping;
- cross-tenant authorization policy;
- audit fields and tests.

**Acceptance baseline**

- `forUserId` is never accepted directly from untrusted input;
- DAL derives it from authenticated tenant context;
- cross-tenant tests prove denial;
- platform/root account access is explicit and privileged;
- every operation audits actor, organization, and target Xendit user.

Until this capability is approved, every earlier capability omits `forUserId`.

## 6. App-owned and Dashboard-only areas

The following must not receive fabricated Xendit SDK integrations:

- API key management;
- team/RBAC management;
- fraud blocklist/risk rules;
- merchant profile and notification settings;
- KYC in this SDK version;
- support content;
- full sub-merchant provisioning;
- app platform-fee billing statements;
- app payout schedules/preferences;
- app audit log.

They may remain app-owned, become read-only reflections, or link to Xendit Dashboard as specified by product requirements.

## 7. Cross-capability prerequisites

### P1 — Dependency/API verification

Before tests or implementation, install dependencies from the lockfile and re-verify all eight clients, 36 methods, request types, response models, errors, and webhook payloads against the actual installed `7.0.0` declarations. Documentation snapshots are evidence, not a replacement for local compiler truth.

### P2 — Error taxonomy

Create one shared safe error contract covering unauthorized, forbidden, rate limit, validation, unavailable, timeout, conflict/idempotency, invalid response, and unknown errors. Per-capability specs decide which are user-retryable.

### P3 — Runtime mode contract

Define server-side `mock` versus `xendit-live` mode once. Configuration absence selects mock; configured failures do not. Mixed-source screens disclose source explicitly.

### P4 — Authenticated tenant context

Read-only root-account capabilities may begin without `forUserId`, but all write capabilities require authenticated actor authorization. Multi-tenant operations additionally require organization mapping.

### P5 — Durable operation persistence

Payouts, refunds, customer ID mapping, webhook projection, and stable idempotency cannot rely on `globalThis`. Prisma schema/transaction design must be specified first.

### P6 — Audit and redaction

Financial writes record actor, operation, safe resource IDs, idempotency key, before/after status, amount/currency, and outcome. Never record secrets, full account numbers, card details, or unredacted callback payloads.

## 8. Recommended specification and delivery order

1. Shared contracts: dependency verification, mode, errors, test adapter.
2. C1 current balance.
3. C2 transaction reads and reports.
4. C5 payout channel discovery.
5. C3/C4 payment-link product decision, then chosen implementation.
6. C7 customers with durable ID mapping.
7. Durable operation schema + C10 webhook processing foundation.
8. C6 payouts.
9. C8 refunds.
10. C9 payment methods.
11. C11 multi-tenancy, or earlier only if platform use is an immediate product requirement.

Money-moving capabilities remain blocked until persistence, authorization, idempotency, audit, and webhook reconciliation specs are approved.

## 9. Required detailed spec template

Every capability document must include:

1. decision and user outcome;
2. goals/non-goals;
3. exact SDK methods and declaration evidence;
4. current code call graph and files;
5. normalized input/output DTOs;
6. state/status mapping table;
7. configured/unconfigured/failure mode behavior;
8. authorization and tenancy;
9. idempotency and persistence, where applicable;
10. webhook/reconciliation behavior;
11. sensitive-data classification/redaction;
12. Given/When/Then acceptance scenarios;
13. automated test matrix;
14. exact expected files changed;
15. migration/rollback strategy;
16. verification commands and five-iteration mapping audit evidence;
17. explicit human approval checkpoint.

## 10. Portfolio completion criteria before coding

“Specs collected” means all of the following are complete:

- [x] Portfolio capability inventory exists.
- [x] Current repository seams are mapped.
- [x] Domain mismatches and prerequisites are recorded.
- [x] C1 detailed acceptance spec exists.
- [x] Shared mode/error/adapter contract exists at `docs/spec/xendit-shared-contracts.md`.
- [x] C2a transaction list/detail detailed spec exists at `docs/spec/xendit-live-transactions.md`; C2b aggregate/projection spec remains deferred.
- [x] C3/C4 product decision completed: current hosted-link journey uses Invoice; PaymentRequest is formally deferred. Detailed spec: `docs/spec/xendit-hosted-payment-links.md`.
- [x] C5 payout-channel discovery and C6 durable payout execution detailed spec exists at `docs/spec/xendit-payouts.md`.
- [x] C7 Customer detailed baseline exists in `docs/spec/xendit-remaining-sdk-and-http-gaps.md` §3.
- [x] C8 Refund detailed baseline exists in `docs/spec/xendit-remaining-sdk-and-http-gaps.md` §4.
- [x] C9 PaymentMethod detailed baseline exists in `docs/spec/xendit-remaining-sdk-and-http-gaps.md` §5; per-method-type UX remains an implementation-tranche approval gate.
- [x] C10 durable webhook processing baseline exists in `docs/spec/xendit-remaining-sdk-and-http-gaps.md` §6.
- [x] C11 tenancy baseline exists in `docs/spec/xendit-remaining-sdk-and-http-gaps.md` §7; use remains blocked until organization mapping is implemented.
- [x] Functions absent from SDK are classified into manual HTTP, Dashboard-only, and app-owned groups in `docs/spec/xendit-remaining-sdk-and-http-gaps.md` §§8-12.
- [x] SDK declarations re-verified after frozen-lockfile installation: 8 clients in `index.d.ts`, 36 Promise methods across API declarations; capability-specific request/response semantics still require verification in each detailed spec.
- [ ] Product owner approves the portfolio and each implementation tranche.

Product direction for xenPlatform, dual-path KYC, dual-layer subscriptions, transfers, split rules, financial RBAC, dual control, and MFA is recorded in `docs/spec/xendit-platform-product-decisions.md`.

No application integration code should be written merely because this portfolio exists. Endpoint/OpenAPI, persistence, authorization-engine, MFA, webhook, encryption, and rollout tranche specifications must be approved before their corresponding code is implemented.
