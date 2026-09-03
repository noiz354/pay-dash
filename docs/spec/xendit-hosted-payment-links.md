# Specification: Xendit Hosted Payment Links — Capability 3

> Status: **PROPOSED FOR HUMAN APPROVAL**  
> Date: 2026-09-03 (+07:00)  
> Selected product: Xendit Invoice (`Invoice.*`)  
> PaymentRequest decision: formally deferred to a separate checkout capability  
> SDK verified locally: `xendit-node@7.0.0` from frozen lockfile  
> Portfolio: `docs/spec/xendit-integration-portfolio.md` §5 C3/C4

## 1. Product decision

The existing `/payments/links` journey will integrate with **Xendit hosted Invoice**, not PaymentRequest.

Reasons:

1. The existing product is explicitly a shareable hosted checkout URL.
2. `Invoice.createInvoice` returns `invoiceUrl`, matching the current “Checkout URL” UI directly.
3. Invoice supports payer email, expiry duration, description, line items, redirect URLs, notifications, and multiple available payment methods.
4. Invoice provides list, detail, and manual expiry methods matching the existing create/list/detail/close journey.
5. PaymentRequest requires choosing or constructing a payment method/channel and models authorization/capture actions. That is a different checkout/payment-orchestration product.

The application must not create both an Invoice and PaymentRequest for one payment-link action.

## 2. Formal deferral of PaymentRequest

`PaymentRequest.*` remains a future capability for channel-specific QRIS, e-wallet, virtual-account, direct-debit, or card flows.

Deferred methods:

- `createPaymentRequest`
- `getPaymentRequestByID`
- `getPaymentRequestCaptures`
- `getAllPaymentRequests`
- `capturePaymentRequest`
- `authorizePaymentRequest`
- `resendPaymentRequestAuth`
- `simulatePaymentRequestPayment`

PaymentRequest is not used as a hidden fallback if Invoice creation fails. It requires a separate spec covering payment-method selection, action URLs, capture semantics, customer mapping, callback lifecycle, and test-mode simulation.

## 3. SDK declaration evidence

Verified files:

- `apps/web/node_modules/xendit-node/invoice/apis/Invoice.d.ts`
- `.../invoice/models/CreateInvoiceRequest.d.ts`
- `.../invoice/models/Invoice.d.ts`
- `.../invoice/models/InvoiceStatus.d.ts`
- `.../invoice/models/InvoiceItem.d.ts`
- comparison: `.../payment_request/apis/PaymentRequest.d.ts`
- comparison: `.../payment_request/models/PaymentRequest.d.ts`

### Selected methods

```ts
Invoice.createInvoice({ data, forUserId? }): Promise<Invoice>
Invoice.getInvoices(filters?): Promise<Invoice[]>
Invoice.getInvoiceById({ invoiceId, forUserId? }): Promise<Invoice>
Invoice.expireInvoice({ invoiceId, forUserId? }): Promise<Invoice>
```

### Important API characteristics

- create has no explicit SDK `idempotencyKey` parameter;
- merchant-controlled `externalId` is required;
- list returns an array, not total/page metadata;
- list supports `limit` and `lastInvoice` cursor-like filtering;
- response `id` is optional in the TypeScript model and must be runtime-validated for usable records;
- hosted URL is `invoiceUrl`;
- statuses are `PENDING`, `PAID`, `SETTLED`, `EXPIRED`, and unknown fallback;
- `expiryDate`, `created`, and `updated` are Dates;
- response may contain payment-channel and customer details that must be normalized/redacted.

## 4. Repository code research

### Correct bounded context

Xendit Invoice integrates with payment links:

- `apps/web/src/server/data/links.ts`
- `apps/web/src/server/actions/links.ts`
- `apps/web/src/app/[locale]/payments/links/page.tsx`
- `apps/web/src/app/[locale]/payments/links/[id]/page.tsx`
- `apps/web/src/components/links/*`
- `apps/web/src/lib/link-status.ts`

### Explicitly incorrect target

It does **not** replace:

- `apps/web/src/server/data/invoices.ts`
- `apps/web/src/app/[locale]/billing/*`
- `apps/web/src/server/actions/invoices.ts`

Those files represent Kinetic's platform-fee billing statements derived from the application ledger, not hosted customer invoices.

### Current payment-link behavior

| Behavior | Current implementation | Live disposition |
|---|---|---|
| list/filter/page | `data/links.ts:199`, links page | replace facade read with Invoice list |
| detail | `data/links.ts:228`, detail page | Invoice detail |
| create | `data/links.ts:241`, action `links.ts:71` | Invoice create |
| close | `data/links.ts:258`, action `links.ts:125` | Invoice expire |
| simulate paid | `data/links.ts:276`, action `links.ts:139` | mock-only; unavailable in live Invoice mode |
| share URL | `lib/link-status.ts:29` | replace fake `pay.kinetic.test` with validated Xendit `invoiceUrl` |
| paid transaction link | detail page lookup by link ID | use C2 product/reference lookup when available; no fabricated row |

## 5. Goals

1. Create a real Xendit hosted invoice from the existing single/multiple-item form.
2. List and filter hosted invoices without invented totals.
3. Render invoice detail and real Xendit checkout URL.
4. Manually expire eligible invoices.
5. Preserve deterministic mock mode when Xendit is unconfigured.
6. Prevent fake payment simulation in live mode.
7. Keep app billing invoices completely separate.
8. Establish durable external-reference and retry semantics before enabling live creation.

## 6. Non-goals

- PaymentRequest or PaymentMethod integration;
- authorization/capture/resend-auth flows;
- recurring subscriptions;
- app platform billing;
- live transaction reconciliation beyond an optional C2 lookup;
- webhook projector implementation (C10), though this spec defines expected convergence;
- `forUserId`;
- custom payer-facing checkout hosted by this app;
- creating arbitrary payment methods from the browser;
- simulating live invoice payment.

## 7. Domain contracts

### 7.1 Normalized hosted link

```ts
type HostedPaymentLink = {
  id: string;                    // Xendit invoice ID
  externalId: string;            // merchant-owned stable reference
  status: "OPEN" | "PAID" | "EXPIRED" | "UNKNOWN";
  amount: number;
  currency: string;
  payerEmail: string | null;
  description: string | null;
  items: Array<{
    referenceId: string | null;
    name: string;
    price: number;
    quantity: number;
  }>;
  checkoutUrl: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  paidAt: string | null;
  paymentMethod: string | null;
  source: "xendit-live" | "mock";
};
```

Rules:

- raw Invoice model never reaches UI;
- `id`, `externalId`, amount, dates, status, and URL are runtime-validated;
- checkout URL must be HTTPS and match an approved Xendit hostname policy;
- currency and amount must agree with request/local operation record;
- item totals must reconcile to invoice amount according to approved fee rules;
- payer email is treated as personal data;
- channel details are reduced to safe display labels.

### 7.2 Create command

```ts
type CreateHostedPaymentLink = {
  kind: "single" | "multiple";
  items: Array<{ referenceId: string; name: string; price: number; quantity: number }>;
  payerEmail: string | null;
  expiresInDays: 7 | 30 | null;
  currency: "IDR";
  locale: "id" | "en";
};
```

The server generates and persists `externalId`; it is not accepted as an arbitrary browser value.

## 8. Create mapping

| App input | CreateInvoiceRequest |
|---|---|
| stable operation reference | `externalId` |
| sum(price × quantity) | `amount` |
| payer email | `payerEmail` |
| item summary | `description` |
| selected expiry | `invoiceDuration` in seconds |
| currency | `currency: "IDR"` |
| locale | allowlisted `locale` |
| line items | `items[{name, price, quantity, referenceId}]` |
| email notification | explicit product setting, not implicitly true |
| success/failure redirects | server-generated allowlisted absolute URLs |
| product metadata | minimal safe metadata; no secrets/PII duplication |

### Amount rules

1. Every price and quantity is a positive safe number within product/API limits.
2. `amount` equals the exact sum of line items unless approved Xendit fees are deliberately added.
3. Current “multiple” form models each item as quantity 1.
4. Single link becomes one item named from a deliberate form/default label, not an unexplained generic value if product copy can supply one.
5. IDR decimal/minor-unit assumptions are verified against Xendit API behavior; no floating-point rounding is hidden.

## 9. Idempotency and persistence

Because Invoice create has no explicit idempotency-key argument, live creation is blocked until a durable operation record exists.

Minimum operation fields:

```text
operation_id
actor_id
external_id (unique)
request_hash
status: PENDING | SUCCEEDED | FAILED | UNKNOWN
xendit_invoice_id (nullable, unique when present)
created_at / updated_at
last_error_category (nullable)
```

Retry algorithm:

1. validate and authorize command;
2. create/find durable operation using stable external ID and request hash;
3. if operation succeeded, return stored invoice mapping;
4. if outcome is unknown after timeout, query `getInvoices({ externalId })` before creating again;
5. reuse the same external ID for the same logical operation;
6. reject reuse with a different request hash;
7. only issue another create when duplicate safety is proven from documented API behavior.

A fresh timestamp/random external ID on every retry is forbidden because it can create duplicate payable invoices.

## 10. Status mapping

| Xendit Invoice status | Hosted link status |
|---|---|
| `PENDING` | `OPEN` |
| `PAID` | `PAID` |
| `SETTLED` | `PAID` |
| `EXPIRED` | `EXPIRED` |
| unknown/future | `UNKNOWN` |

The current app `CANCELLED` status has no separate Xendit Invoice status. Manual close calls `expireInvoice`, producing `EXPIRED`.

If product must distinguish natural expiry from merchant closure, that distinction is app-owned metadata (`closedByMerchantAt`) in the durable operation record. It must not be inferred from Xendit status alone.

## 11. List and filter semantics

SDK-supported filters include external ID, statuses, date ranges, payment channels, limit, and `lastInvoice`.

Required behavior:

1. live list uses cursor/load-more semantics based on verified `lastInvoice` behavior;
2. no total or page count is fabricated because the response is only an array;
3. `kind=single|multiple` cannot be reliably inferred unless app metadata/reference mapping is persisted;
4. broad substring search over email/item labels is not performed over one page and presented as global search;
5. filters offered in live UI are restricted to supported fields or durable local metadata;
6. filter changes reset cursor state;
7. unknown statuses remain visible.

## 12. Checkout URL and redirect security

1. Display/copy `invoiceUrl` from the validated live response.
2. Never construct `https://pay.kinetic.test/<id>` in live mode.
3. `invoiceUrl` must use HTTPS and an approved Xendit domain; malformed/unapproved URL is an invalid upstream response.
4. Success/failure redirect URLs are generated server-side from approved application base URL.
5. Browser input cannot provide arbitrary redirect origins.
6. UI links use safe external-link behavior and do not expose secret query data.

## 13. Detail and paid-transaction behavior

The detail page renders normalized invoice fields and real checkout URL.

For a paid link:

- if C2 can locate a transaction using Xendit product/reference data, “View payment” links to that live transaction;
- otherwise the button is omitted and the page states payment reconciliation is pending/unavailable;
- it must not look up a mock transaction whose ID happens to equal the invoice external ID;
- `paidAt` is nullable unless supplied by a verified field/webhook/local projection.

Available payment channels may be summarized safely but full raw arrays are not sent to client by default.

## 14. Manual expiry

1. Only `OPEN` invoices can be expired.
2. Server re-fetches/validates current status before or as part of expiry handling.
3. Paid/settled/expired/unknown invoices cannot be expired from UI.
4. Concurrent state conflict produces a safe, refreshable error.
5. Successful response is validated before UI reports closure.
6. App operation/audit record captures actor, invoice ID, external ID, before/after status, and outcome.

## 15. Simulation behavior

Current mock mode may continue `recordLinkPayment` for deterministic demos.

In configured live Invoice mode:

- `payPaymentLinkAction` cannot mutate the mock transaction store;
- no generic “mark paid” operation exists in Invoice SDK;
- the simulate button is hidden/disabled unless a separately verified Xendit test-invoice simulation mechanism is specified;
- PaymentRequest simulation must not be called for an Invoice resource.

## 16. Mode and failure behavior

| Condition | Required behavior |
|---|---|
| Xendit unconfigured | existing mock links/actions, marked mock |
| configured list/detail/create/expire success | normalized live result |
| configured SDK failure | typed safe failure; no mock fallback/mutation |
| invalid response | invalid-upstream failure |
| unknown live invoice | live not-found; do not query mock store |
| ambiguous create timeout | recover by durable external-ID lookup; never blindly duplicate |

## 17. Authorization, tenancy, and privacy

1. Live create and expire require an authenticated, authorized actor.
2. Read authorization policy must be explicit before implementation.
3. `forUserId` is omitted in this capability.
4. Payer email is PII and is not written to logs/audit details unnecessarily.
5. Metadata excludes secrets, full customer profiles, and redundant PII.
6. Raw customer/channel objects are not serialized to the browser.
7. SDK access remains server-only.

## 18. Acceptance criteria

### AC-01 — Product selection

**Given** the payment-link journey  
**Then** it uses Invoice methods only  
**And** does not also create a PaymentRequest.

### AC-02 — Exact create mapping

**Given** a valid authorized create command  
**When** live creation occurs  
**Then** amount, items, payer email, expiry, currency, locale, redirects, and stable external ID map according to §8  
**And** the validated `invoiceUrl` becomes the checkout URL.

### AC-03 — Durable duplicate safety

**Given** a retry or ambiguous timeout  
**Then** the same logical operation reuses its external ID  
**And** lookup/recovery occurs before another create  
**And** duplicate payable invoices are not knowingly created.

### AC-04 — Honest list pagination

**Given** live invoice list results  
**Then** the UI uses verified cursor/load-more semantics  
**And** no total/page count or global substring result is invented.

### AC-05 — Exact detail

**Given** a Xendit invoice ID  
**When** detail is requested  
**Then** `getInvoiceById` is called  
**And** valid fields are normalized  
**And** unknown/not-found never falls through to mock data.

### AC-06 — Status fidelity

**Given** PENDING, PAID, SETTLED, EXPIRED, or unknown status  
**Then** mapping follows §10  
**And** merchant closure is not inferred without app metadata.

### AC-07 — Safe expiry

**Given** an open live invoice  
**When** an authorized actor confirms close  
**Then** `expireInvoice` is called once for the correct ID  
**And** UI reports success only after validated response.

### AC-08 — No fake live payment

**Given** live Invoice mode  
**When** a user views an open invoice  
**Then** mock simulation cannot create a local succeeded transaction  
**And** PaymentRequest simulation is not used on the Invoice.

### AC-09 — Domain separation

**Then** `server/data/invoices.ts`, billing pages, and billing payment actions remain the app platform-billing domain  
**And** hosted invoices are integrated through the links domain.

### AC-10 — URL safety

**Given** any create/detail response  
**Then** checkout URL is validated HTTPS/approved-host data  
**And** redirect origins cannot be supplied by the browser.

### AC-11 — No false fallback

**Given** configured SDK error or malformed response  
**Then** a typed safe failure is shown  
**And** no seeded link is substituted or mutated.

### AC-12 — Mock regression

**Given** Xendit is unconfigured  
**Then** existing deterministic create/list/detail/expire/simulate flow remains operational  
**And** it is visibly marked mock/test mode.

### AC-13 — Auth and audit

**Given** create or expire  
**Then** actor authorization occurs before SDK call  
**And** a redacted operation/audit record is retained.

### AC-14 — Paid transaction honesty

**Given** a paid invoice with no reconciled C2 transaction  
**Then** no fake “View payment” destination is created.

## 19. Required automated tests

1. exact single-item create mapping;
2. exact multiple-item mapping and total reconciliation;
3. expiry-day to duration conversion with deterministic clock;
4. stable external ID/request hash behavior;
5. duplicate retry and ambiguous-timeout recovery;
6. response validation including missing optional SDK `id`;
7. HTTPS/approved-host invoice URL validation;
8. each status mapping, including unknown;
9. list filter translation and cursor reset;
10. no fabricated total/page count;
11. unsupported broad search/kind behavior;
12. exact detail and not-found behavior;
13. eligible and ineligible expiry;
14. concurrent status/error handling;
15. configured error with no mock fallback;
16. unconfigured mock regression;
17. live-mode simulation guard before mock mutation;
18. redirect allowlist behavior;
19. payer-email/log redaction;
20. authorization before create/expire;
21. no PaymentRequest call in this journey;
22. billing-domain isolation;
23. paid link without C2 mapping omits transaction link;
24. direct SDK import boundary.

## 20. Expected code integration map

### Shared adapter/persistence

- `apps/web/src/lib/xendit.ts` (Invoice wrapper already exposed)
- new hosted-invoice DAL/adapter and tests
- Prisma schema/migration for create-operation and invoice mapping
- shared errors/mode/auth context

### Links facade and actions

- `apps/web/src/server/data/links.ts`
- `apps/web/src/server/data/links.test.ts`
- `apps/web/src/server/actions/links.ts`
- action tests where introduced

### UI

- links list/detail pages
- create dialog
- filters/table/pagination
- expire button
- simulate button
- `apps/web/src/lib/link-status.ts` for status/URL contract

### Explicit non-targets

- app billing data/actions/pages are not migrated to Invoice SDK.

## 21. Delivery slices after approval

1. persistence/idempotency recovery contract and tests;
2. normalized Invoice contracts/status/URL validation;
3. DAL list/detail/create/expire tests and adapter;
4. links facade mode selection;
5. create action with auth and durable operation;
6. honest list/detail/cursor UI;
7. expiry and simulation guard;
8. transaction-link reconciliation behavior;
9. regressions, typecheck, lint, import check, and five audit iterations.

## 22. Verification gates

```bash
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web lint
grep -R 'from "xendit-node"' apps/web/src --include="*.ts" --include="*.tsx"
```

Expected direct SDK import remains only `apps/web/src/lib/xendit.ts`.

## 23. Approval checkpoint

Coding must not begin until a human approves:

- Invoice is the sole backend for the current hosted-link journey;
- PaymentRequest is deferred;
- live writes require durable operation persistence first;
- live list has no invented total/page count;
- merchant close maps to Xendit expiry;
- mock simulation is unavailable in live mode;
- billing invoices remain a separate app-owned domain;
- unauthenticated create/expire is forbidden.
