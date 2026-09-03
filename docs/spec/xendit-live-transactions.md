# Specification: Xendit Live Transaction Reads — Capability 2

> Status: **PROPOSED FOR HUMAN APPROVAL**  
> Date: 2026-09-03 (+07:00)  
> Capability: `Transaction.getAllTransactions` + `Transaction.getTransactionByID`  
> SDK verified locally: `xendit-node@7.0.0` declarations installed from frozen lockfile  
> Portfolio: `docs/spec/xendit-integration-portfolio.md` §5 C2

## 1. Decision

Capability 2 will integrate **read-only Xendit transaction list and transaction detail**.

It will not attempt to make every ledger-derived aggregate live in the same slice. Dashboard analytics, report-builder full datasets, customer lifetime value, billing statements, risk derivation, balance history, and audit projections require either exhaustive cursor traversal or a durable local projection. Those uses are split into a later C2b specification after C10 webhook/persistence foundations are designed.

This bounded slice prevents a superficially “live” implementation that quietly calculates totals from only the first Xendit page.

## 2. SDK declaration evidence

Verified after `corepack pnpm install --frozen-lockfile`:

- API: `apps/web/node_modules/xendit-node/balance_and_transaction/apis/Transaction.d.ts`
- List response: `.../models/TransactionsResponse.d.ts`
- Item response: `.../models/TransactionResponse.d.ts`
- statuses: `.../models/TransactionStatuses.d.ts`
- types: `.../models/TransactionTypes.d.ts`
- channels: `.../models/ChannelsCategories.d.ts`
- ranges: `.../models/DateRangeFilter.d.ts`

### Methods

```ts
getAllTransactions(request?: {
  types?: TransactionTypes[];
  statuses?: TransactionStatuses[];
  channelCategories?: ChannelsCategories[];
  referenceId?: string;
  productId?: string;
  accountIdentifier?: string;
  amount?: number;
  currency?: Currency;
  created?: { gte?: Date; lte?: Date };
  updated?: { gte?: Date; lte?: Date };
  limit?: number;
  afterId?: string;
  beforeId?: string;
  forUserId?: string;
}): Promise<TransactionsResponse>

getTransactionByID({ id, forUserId? }): Promise<TransactionResponse>
```

`TransactionsResponse` contains `data`, `hasMore`, and optional navigation `links`; it does **not** provide total row count or page count.

## 3. Repository call-graph research

### Direct transaction screens

| Use | Current code |
|---|---|
| list and filtering | `apps/web/src/server/data/transactions.ts:222` |
| detail | `apps/web/src/server/data/transactions.ts:252` |
| list page | `apps/web/src/app/[locale]/transactions/page.tsx:72` |
| detail page | `apps/web/src/app/[locale]/transactions/[id]/page.tsx:58` |
| CSV export | `apps/web/src/app/api/exports/transactions/route.ts` |
| table UI | `apps/web/src/components/transactions/transactions-table.tsx` |
| URL filters | `apps/web/src/components/transactions/transaction-filters.tsx` |
| pagination | `apps/web/src/components/transactions/table-pagination.tsx` |

### Current demo mutations that touch this domain

| Mutation | Current code | Live-mode disposition |
|---|---|---|
| create payment | `server/actions/transactions.ts:39` -> `data/transactions.ts:364` | disable; creation belongs to PaymentRequest/Invoice spec |
| refund | `server/actions/transactions.ts:84` -> `data/transactions.ts:412` | disable; C8 Refund spec |
| retry failed payment | `server/actions/transactions.ts:123` -> `data/transactions.ts:436` | disable; no generic Transaction retry SDK method |
| simulate link payment | `data/links.ts:276` | disable/redirect to C3/C4 test-mode behavior |

### Derived consumers that must not be switched in C2a

- dashboard metrics/recent/analytics: `app/[locale]/dashboard/page.tsx`
- reports: `app/[locale]/reports/builder/page.tsx`, `lib/report-options.ts`
- audit: `server/data/audit.ts`
- balance history: `server/data/balance.ts`
- customer LTV/payment history: `server/data/customers.ts`
- platform billing: `server/data/invoices.ts`
- payment-link status: `server/data/links.ts`
- onboarding: `server/data/onboarding.ts`
- risk: `server/data/risk.ts`
- webhook sample derivation: `server/data/webhooks.ts`

These currently call `getLedgerRows`, `listTransactions`, or metrics helpers assuming a complete in-memory dataset. They remain app/mock-derived and must be source-labeled until C2b.

## 4. Critical model mismatches

The existing app `Transaction` cannot truthfully represent raw `TransactionResponse` without changes.

| Existing app field | Xendit source | Decision |
|---|---|---|
| `id` | `id` | direct |
| `referenceId` | `referenceId` | direct |
| `createdAt` / `updatedAt` | `created` / `updated` | ISO normalize |
| `amount`, `currency` | direct | validate |
| `status` | Xendit status | explicit mapping below |
| `channel` | `channelCategory` | broaden vocabulary; do not force current five-value enum |
| `methodLabel` | `channelCode` | display channel code; nullable fallback “Unknown channel” |
| `fee` | `fee` object | derive only after exact fee model validation; otherwise nullable |
| `net` | amount/fee/cashflow | nullable unless semantics are proven |
| customer name/email | unavailable in transaction response | nullable/absent; never fabricate |
| description | unavailable | nullable/absent |
| risk score | unavailable | nullable/absent |
| refunded amount | not an item field; refund is separate transaction type | nullable/derived only with reconciliation |
| event timeline | unavailable from this method | omit or use app-owned webhook history with source label |
| product ID | `productId` | add to normalized DTO |
| account identifier | `accountIdentifier` | sensitive; masked before UI/logging |
| cashflow | `cashflow` | add |
| settlement status/time | direct | add |
| business ID | `businessId` | server-side operational field; avoid unnecessary UI exposure |

The implementation must introduce a normalized Xendit transaction read DTO or make optionality/source explicit. It must not fill unavailable values with seeded customer data or calculated risk values.

## 5. Status mapping

SDK statuses are:

- `SUCCESS`
- `PENDING`
- `FAILED`
- `REVERSED`
- `VOIDED`
- `UNKNOWN_ENUM_VALUE`

Existing app statuses are `SUCCEEDED`, `PROCESSING`, `PENDING`, `FAILED`, `REFUNDED`.

Required normalized status vocabulary for live reads:

| Xendit | App live status |
|---|---|
| `SUCCESS` | `SUCCEEDED` |
| `PENDING` | `PENDING` |
| `FAILED` | `FAILED` |
| `REVERSED` | `REVERSED` (new) |
| `VOIDED` | `VOIDED` (new) |
| `UNKNOWN_ENUM_VALUE` or future value | `UNKNOWN` (new, neutral) |

Rules:

- Do not map `REVERSED` or `VOIDED` to `REFUNDED`.
- `REFUNDED` is not a Xendit transaction status in this API; refunds are represented by transaction type/refund resources.
- `PROCESSING` remains a mock/application status unless another product API provides it.
- Unknown enum values render safely and remain filterable as unknown.

## 6. Channel mapping

SDK channel categories include BANK, CARDS, DIRECT_DEBIT, EWALLET, QR_CODE, VIRTUAL_ACCOUNT, RETAIL_OUTLET, and others.

Required mapping:

- preserve the complete Xendit category in the normalized DTO;
- display a localized friendly label at the presentation layer;
- use `channelCode` as the method/channel detail when present;
- never collapse BANK, DIRECT_BANK_TRANSFER, and VIRTUAL_ACCOUNT into the current `ACH` value;
- unknown/future channel categories map to `OTHER/UNKNOWN`, not to a fabricated known channel.

The existing `CHANNELS` filter contract must therefore be generalized for live mode.

## 7. Scope

### Included (C2a)

1. Transaction list with supported server-side filters.
2. Cursor-based forward/back navigation.
3. Transaction detail by Xendit transaction ID.
4. Safe normalized DTO and source marker.
5. Live-mode source/error/empty states.
6. Live-mode guards for generic create, refund, retry, and simulation actions.
7. Current-page CSV export with explicit scope in filename/UI, or export disabled until full export exists.
8. Contract/unit tests without external network calls.

### Excluded (C2b or other capabilities)

- total count/page count;
- exhaustive analytics and dashboard metrics;
- full-history CSV/report exports;
- customer LTV and customer identity enrichment;
- platform fee billing derivation;
- risk score derivation;
- full event timeline;
- live refunds;
- payment creation/retry;
- webhook-to-ledger projection;
- `forUserId`;
- database synchronization/caching.

## 8. Normalized contracts

### 8.1 Live transaction

```ts
type LiveTransaction = {
  id: string;
  productId: string;
  referenceId: string;
  type: string;
  status: "SUCCEEDED" | "PENDING" | "FAILED" | "REVERSED" | "VOIDED" | "UNKNOWN";
  channelCategory: string;
  channelCode: string | null;
  accountIdentifierMasked: string | null;
  amount: number;
  currency: string;
  cashflow: "MONEY_IN" | "MONEY_OUT";
  settlementStatus: "PENDING" | "SETTLED" | null;
  estimatedSettlementAt: string | null;
  feeAmount: number | null;
  netAmount: number | null;
  createdAt: string;
  updatedAt: string;
  source: "xendit-live";
};
```

No customer, description, risk, refund total, or fabricated timeline field is included.

### 8.2 List query

```ts
type LiveTransactionQuery = {
  statuses?: LiveTransaction["status"][];
  types?: string[];
  channelCategories?: string[];
  referenceId?: string;
  productId?: string;
  amount?: number;
  currency?: string;
  createdFrom?: string;
  createdTo?: string;
  limit: number;
  afterId?: string;
  beforeId?: string;
};
```

Validation rules:

- limit has an approved min/max based on installed SDK/API behavior;
- dates are valid ISO values and from <= to;
- afterId and beforeId are mutually exclusive;
- enum filters are allowlisted;
- no browser-provided `forUserId`;
- no arbitrary free-text query is translated into an unsupported SDK search.

### 8.3 List result

```ts
type LiveTransactionPage = {
  rows: LiveTransaction[];
  hasMore: boolean;
  nextCursor: string | null;
  previousCursor: string | null;
  source: "xendit-live";
};
```

No `total`, `pageCount`, or synthetic page number is claimed in live mode.

## 9. Filter behavior

| Existing filter | Live translation |
|---|---|
| status | map app-live status to SDK status array |
| channel | replace with SDK channel-category filter |
| 7d/30d/90d | `created.gte = now - range`, deterministic clock in tests |
| exact transaction ID | detail method |
| exact reference | `referenceId` |
| broad `q` customer/method/description search | unsupported in C2a; UI must not pretend otherwise |
| page number | replaced by opaque cursor URLs |

Filter state remains URL-addressable, but cursors are opaque strings and must be validated/encoded safely.

## 10. Detail-page behavior

The current detail page assumes customer identity, fee/net, risk score, timeline, raw payload, refund, and retry controls.

In live mode:

1. required Xendit fields render from the normalized DTO;
2. unavailable fields are omitted or display “Not provided by transaction API”;
3. customer card is omitted unless a separately persisted mapping exists;
4. risk score is omitted;
5. timeline shows only fields actually supplied or app-owned persisted events with source disclosure;
6. raw payload panel renders the normalized/redacted DTO, never the full raw SDK payload;
7. account identifier is masked;
8. refund control is unavailable until C8;
9. retry control is unavailable because Transaction API has no generic retry method.

## 11. Mode and failure behavior

| Condition | Behavior |
|---|---|
| Xendit unconfigured | existing mock list/detail and demo mutations remain available, marked mock |
| configured, list/detail succeeds | live normalized rows/detail |
| configured, SDK fails | typed safe failure; no seeded transaction fallback |
| configured, malformed response | `XENDIT_INVALID_RESPONSE`; no mock fallback |
| configured, unknown transaction | live not-found result, not mock lookup |

Use the shared error categories established in the portfolio/C1 spec. Raw upstream payloads and stacks never reach the browser.

## 12. Pagination correctness

1. Live UI uses cursor navigation, not “Page X of Y”.
2. `hasMore` controls forward navigation.
3. Cursor extraction must be based on verified response link semantics or last-row ID per Xendit documentation; it cannot be guessed silently.
4. Filter changes clear existing cursors.
5. Cursors are treated as opaque and never exposed to logs beyond safe diagnostic truncation.
6. An empty data array with `hasMore=true` is treated as an invalid response.

## 13. Export and reporting

The current export route assumes it can request up to 100 local rows and the report builder assumes a complete in-memory dataset.

C2a decision:

- either export only the currently visible live page and label it “current page”; or
- disable live export with a clear “full export pending” message.

It must not call one Xendit page and label that output as a complete export. Full export, reports, aggregates, and derived domains belong to C2b with bounded cursor traversal/job persistence.

## 14. Security and privacy

1. SDK calls remain server-only.
2. `accountIdentifier` is masked before leaving DAL.
3. `businessId` is not rendered unless a justified operational use is approved.
4. Raw SDK response is not copied to the client.
5. No customer identity is inferred from account identifiers.
6. `forUserId` is omitted.
7. URL filters are Zod-validated; invalid enums/cursors do not reach SDK.
8. Errors and logs exclude secret keys, authorization headers, full account identifiers, and raw payloads.

## 15. Acceptance criteria

### AC-01 — Exact live list call

**Given** Xendit is configured and valid filters are supplied  
**When** the list is requested  
**Then** only supported filters are translated to `getAllTransactions`  
**And** `forUserId` is absent  
**And** every returned row is validated and normalized.

### AC-02 — Exact detail call

**Given** Xendit is configured  
**When** a valid transaction ID is opened  
**Then** `getTransactionByID({ id })` is called  
**And** an upstream not-found produces the live not-found state.

### AC-03 — Honest field mapping

**Given** a valid Xendit response without customer/risk/description data  
**When** it is rendered  
**Then** those fields are omitted or explicitly unavailable  
**And** no mock-derived value is merged into the live record.

### AC-04 — Status fidelity

**Given** SUCCESS, PENDING, FAILED, REVERSED, VOIDED, or unknown status  
**Then** mapping follows §5 exactly  
**And** REVERSED/VOIDED are not reported as REFUNDED.

### AC-05 — Cursor fidelity

**Given** a paginated live result  
**Then** UI shows cursor next/back controls  
**And** does not display an invented total or page count  
**And** filter changes clear stale cursors.

### AC-06 — Search honesty

**Given** the current broad free-text search  
**When** live mode is active  
**Then** unsupported customer/description substring search is not sent or emulated over one page  
**And** the UI offers only exact supported lookup/filter behavior.

### AC-07 — No false fallback

**Given** configured SDK error or invalid response  
**Then** a safe failure is shown  
**And** seeded rows are not substituted.

### AC-08 — Mock regression

**Given** Xendit is unconfigured  
**Then** existing deterministic list/detail/filter/actions continue to work  
**And** data is marked mock.

### AC-09 — Mutation guard

**Given** live mode  
**When** create, retry, refund, or simulated link payment is attempted  
**Then** it is rejected before mock-store mutation  
**And** the message identifies the required future capability.

### AC-10 — Export honesty

**Given** live mode  
**When** export is requested  
**Then** it is explicitly current-page-only or unavailable  
**And** one page is never labeled as complete history.

### AC-11 — Derived consumer isolation

**Given** C2a is complete  
**Then** dashboard aggregates, report builder, billing, customer LTV, risk, audit, balance history, onboarding, and webhook samples have not silently switched to a partial live page  
**And** their source is disclosed as app/mock derived.

### AC-12 — Server/privacy boundary

**Then** direct `xendit-node` imports remain confined to `lib/xendit.ts`  
**And** raw account identifiers and payloads are absent from client DTOs/logs.

## 16. Required automated tests

1. exact list request translation for each supported filter;
2. mutually exclusive cursor validation;
3. date-range validation and deterministic range conversion;
4. exact detail request;
5. normalization of every status and representative channel;
6. unknown enum handling;
7. Date -> ISO conversion;
8. malformed required fields, NaN/negative amount, invalid dates;
9. account identifier masking;
10. configured error categories with no mock fallback;
11. unconfigured mock behavior;
12. cursor result behavior without total/page count;
13. broad search rejection in live mode;
14. all four live-mode mutation guards before store mutation;
15. export current-page/disabled semantics;
16. no SDK/network calls in unit tests;
17. UI omission of unavailable customer/risk/timeline data;
18. direct import boundary check.

## 17. Expected code integration map

Expected files; final plan should keep changes vertically sliced:

### Shared/adapter

- `apps/web/src/lib/xendit.ts` — continue exposing wrapped Transaction client
- new Xendit transaction DAL/adapter and tests
- shared mode/error contracts if not already delivered by C1

### Feature facade

- `apps/web/src/server/data/transactions.ts` or a split mock/live facade
- transaction data tests

### List/detail UI

- `apps/web/src/app/[locale]/transactions/page.tsx`
- `apps/web/src/app/[locale]/transactions/[id]/page.tsx`
- transaction filters, pagination, table, status pill

### Safety

- `apps/web/src/server/actions/transactions.ts`
- `apps/web/src/server/actions/links.ts` or its underlying live-mode simulation guard

### Export/source disclosure

- `apps/web/src/app/api/exports/transactions/route.ts`
- source labels for dependent derived screens if mixed mode is visible

No implementation change is approved merely by listing these files.

## 18. Delivery slices after approval

1. normalized contracts, status/channel maps, and adapter contract tests;
2. DAL list/detail with validation and safe errors;
3. facade mode selection;
4. cursor list UI and supported filters;
5. truthful detail UI;
6. mutation guards and export behavior;
7. source disclosure for derived consumers;
8. regression, typecheck, lint, and five identical mapping-audit iterations.

## 19. Verification gates

```bash
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web lint
grep -R 'from "xendit-node"' apps/web/src --include="*.ts" --include="*.tsx"
```

Expected direct SDK import: only `apps/web/src/lib/xendit.ts`.

The five-iteration mapping audit must be rerun after implementation; the historical audit is not implementation evidence.

## 20. Approval checkpoint

Coding must not begin until a human approves:

- C2a is list/detail only;
- aggregate/report synchronization is deferred to C2b;
- broad free-text search is reduced to SDK-supported exact filters in live mode;
- live pagination is cursor-based with no invented total;
- unavailable customer/risk/timeline fields are not fabricated;
- create/retry/refund/simulation are disabled in live mode until their capabilities exist;
- full-history live export is deferred.
