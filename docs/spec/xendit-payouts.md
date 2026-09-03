# Specification: Xendit Payout Channels and Payout Execution — Capabilities 5–6

> Status: **PROPOSED FOR HUMAN APPROVAL**  
> Date: 2026-09-03 (+07:00)  
> SDK: `Payout.getPayoutChannels`, `createPayout`, `getPayoutById`, `getPayouts`, `cancelPayout`  
> SDK verified locally: `xendit-node@7.0.0` from frozen lockfile  
> Portfolio: `docs/spec/xendit-integration-portfolio.md` §5 C5–C6

## 1. Decision

Payout integration is divided into two delivery stages:

1. **C5 — read-only channel discovery:** fetch and validate supported bank/e-wallet channels and their amount limits.
2. **C6 — durable payout execution:** retain the app's batch UX, but model each recipient as one independently persisted Xendit payout operation.

C5 may be implemented after shared adapter/error contracts. C6 is blocked until authentication/authorization, Prisma persistence, idempotency, audit, and reconciliation foundations are approved and implemented.

The current deterministic “approve batch = recipients immediately PAID/FAILED” behavior remains mock-only and must never run in Xendit live mode.

## 2. SDK evidence

Verified declarations:

- `apps/web/node_modules/xendit-node/payout/apis/Payout.d.ts`
- `.../payout/models/Channel.d.ts`
- `.../payout/models/ChannelAmountLimits.d.ts`
- `.../payout/models/ChannelCategory.d.ts`
- `.../payout/models/CreatePayoutRequest.d.ts`
- `.../payout/models/DigitalPayoutChannelProperties.d.ts`
- `.../payout/models/GetPayouts200ResponseDataInner.d.ts`
- `.../payout/models/GetPayouts200Response.d.ts`

### Exact methods

```ts
getPayoutChannels({ currency?, channelCategory?, channelCode?, forUserId? }?)
  -> Promise<Channel[]>

createPayout({ idempotencyKey, data?, forUserId? })
  -> Promise<Payout>

getPayoutById({ id, forUserId? })
  -> Promise<Payout>

getPayouts({ referenceId, limit?, afterId?, beforeId?, forUserId? })
  -> Promise<{ data?, hasMore?, links? }>

cancelPayout({ id, forUserId? })
  -> Promise<Payout>
```

`getPayouts` requires a reference ID; it is not a global “list all batches” API.

## 3. Repository research

### Current payout domain

- `apps/web/src/server/data/payouts.ts`
  - list batches around line 456;
  - batch detail around line 503;
  - overview around line 530;
  - create local batch around line 578;
  - approve/release around line 621;
  - cancel around line 672;
  - retry batch/recipient after cancellation section;
  - settings/accounts around line 689 onward.
- `apps/web/src/server/actions/payouts.ts`
  - create batch: line 57;
  - approve: 116;
  - cancel: 140;
  - retry batch: 158;
  - retry recipient: 179;
  - app schedule: 220;
  - destination account: 255;
  - auto-withdrawal: 275;
  - add bank account: 303.
- list/detail/bulk/settings pages under `app/[locale]/payouts`.
- balance withdrawal calls payout batch logic from `server/data/balance.ts:401`.
- CSV parsing is in `apps/web/src/lib/payout-csv.ts`.
- status UI rules are in `apps/web/src/lib/payout-status.ts`.

### Persistence reality

`apps/web/prisma/schema.prisma` contains Better Auth models and `LedgerEntry`; it has no organization, payout batch, payout recipient, payout attempt, idempotency, destination, or audit-operation tables.

### Authorization reality

Better Auth is configured, but existing payout actions do not establish actor authorization before money movement. C6 cannot ship on this boundary unchanged.

## 4. Domain mismatch

The app models:

```text
PayoutBatch
  -> Recipient[]
```

Xendit models one payout per destination:

```text
Xendit Payout #1 -> recipient #1
Xendit Payout #2 -> recipient #2
...
```

Therefore:

- a batch remains an app-owned aggregate;
- each recipient has one or more persisted attempts;
- each attempt has its own reference ID, idempotency key, Xendit payout ID, request hash, and status;
- batch status/amounts are derived from persisted recipient states;
- a Xendit response never means the whole batch succeeded.

## 5. Goals

### C5

1. Provide live supported bank/e-wallet channels for IDR.
2. Validate channel category, code, currency, and amount limits.
3. Prevent users from selecting unsupported free-text bank names in live mode.
4. Keep app payout schedules/preferences explicitly app-owned.

### C6

1. Persist draft batches and recipients before release.
2. Release each recipient safely with stable idempotency.
3. Represent partial success and asynchronous states truthfully.
4. Retrieve/reconcile payout status by Xendit ID/reference.
5. Cancel eligible Xendit payouts only while status is `ACCEPTED`.
6. Protect every financial mutation with authentication, authorization, confirmation, audit, and redaction.
7. Make retries safe under timeout, process crash, duplicate submission, and terminal failure.

## 6. Non-goals

- using Xendit to store app schedules, notification preferences, or default withdrawal accounts;
- full Platform/sub-merchant provisioning;
- browser-controlled `forUserId`;
- treating channel discovery as beneficiary account verification;
- immediate synchronous “paid” status after create;
- generic retry of a terminal payout using the same logical attempt;
- automatic payout scheduling/job execution in the first C6 slice;
- changing platform billing invoices;
- storing full account numbers in logs or UI payloads.

## 7. C5 normalized channel contract

```ts
type PayoutChannel = {
  code: string;
  category: string;
  currency: string;
  name: string;
  minAmount: number;
  maxAmount: number;
  increment: number | null;
  source: "xendit-live" | "mock";
};
```

The exact `ChannelAmountLimits` property names and semantics must be validated by adapter tests against installed declarations before implementation. Values must be finite, non-negative, and internally consistent (`min <= max`). Unknown categories remain visible as unknown/unsupported rather than being converted to a known bank.

### C5 request rules

- first slice fixes currency to `IDR`;
- allowed categories are explicit bank/e-wallet categories supported by the SDK model;
- channel code is allowlisted/validated;
- `forUserId` is omitted;
- configured SDK failure does not fall back to seeded banks;
- optional short server cache may be specified later, but stale/error behavior must be explicit.

## 8. C6 persistence contract

Minimum conceptual schema:

### PayoutBatch

```text
id, actor_id, organization_id(nullable until tenancy), name, source,
currency, scheduled_for, note, status, created_at, updated_at, released_at
```

### PayoutRecipient

```text
id, batch_id, name, channel_code, account_number_encrypted,
account_number_last4, account_holder_name, amount, reference,
status, created_at, updated_at
```

### PayoutAttempt

```text
id, recipient_id, attempt_number,
reference_id UNIQUE, idempotency_key UNIQUE, request_hash,
xendit_payout_id UNIQUE nullable,
status, failure_code nullable, estimated_arrival_at nullable,
last_error_category nullable, created_at, updated_at
```

### Audit record

```text
actor_id, action, batch_id, recipient_id, attempt_id,
safe reference/idempotency metadata, amount, currency,
status_before, status_after, outcome, timestamp
```

Requirements:

1. Database constraints, not in-memory checks, enforce uniqueness.
2. Account number is encrypted at rest if retained; only last four digits are used for routine display/logging.
3. A database transaction establishes attempt/idempotency state before SDK call.
4. No secret, full account number, or receipt email is copied into general metadata/audit logs.
5. Migration and rollback behavior must preserve existing demo mode.

## 9. Create-payout mapping

One recipient maps to one request:

| Persisted recipient/attempt | Xendit request |
|---|---|
| attempt idempotency key | `idempotencyKey` |
| unique attempt reference | `data.referenceId` |
| selected channel | `data.channelCode` |
| decrypted account number at call boundary | `data.channelProperties.accountNumber` |
| account holder if collected/supported | `accountHolderName` |
| amount | `data.amount` |
| batch currency | `data.currency` |
| safe batch description | `data.description` |
| optional recipient notification | `receiptNotification`, only with consent/product requirement |
| safe IDs only | minimal `metadata` |

### Validation before release

- actor and role authorization;
- batch is releasable and confirmation binds to current batch total/count/version;
- all recipients use channels returned by approved C5 discovery;
- amount satisfies channel min/max/increment;
- currency matches channel and batch;
- account number passes channel-specific validation where available;
- duplicate recipient/reference policy is explicit;
- available-balance precheck may inform UX but cannot guarantee payout success;
- optimistic concurrency prevents two release requests.

## 10. Idempotency and crash recovery

### Same attempt

Retries caused by network timeout, process crash, or unknown response reuse the exact same:

- attempt row;
- reference ID;
- idempotency key;
- request payload hash.

A payload change with the same key is rejected internally.

### Recovery order

1. If Xendit payout ID exists, call `getPayoutById`.
2. Otherwise query `getPayouts({ referenceId })`.
3. If a matching payout exists, attach its ID and normalize status.
4. Only retry `createPayout` with the same key/payload when outcome remains unresolved and SDK/API retry semantics permit it.
5. Never generate a new key merely because the browser resubmitted.

### Terminal retry

A terminal failed/reversed/cancelled payout is not retried by mutating the old attempt. A user-approved retry creates a **new attempt number, new reference ID, and new idempotency key**, linked to the same recipient. The UI must disclose that it is a new transfer attempt.

## 11. Payout status mapping

SDK statuses:

- `REQUESTED`
- `ACCEPTED`
- `LOCKED`
- `SUCCEEDED`
- `FAILED`
- `CANCELLED`
- `REVERSED`

Normalized recipient status:

| Xendit | App recipient status |
|---|---|
| `REQUESTED` | `PENDING` |
| `ACCEPTED` | `PENDING` (cancellable) |
| `LOCKED` | `PENDING` (not cancellable) |
| `SUCCEEDED` | `PAID` |
| `FAILED` | `FAILED` |
| `CANCELLED` | `CANCELLED` (new; do not call it returned) |
| `REVERSED` | `RETURNED` |
| unknown/future | `UNKNOWN` (new) |

Batch status is derived from all latest recipient attempts. The detailed derivation table must distinguish draft/scheduled/not-released, processing, paid, partial, failed, cancelled, returned, and unknown. Unknown recipient status prevents a misleading terminal-success batch.

Failure-code mapping preserves the safe code:

- insufficient balance;
- rejected by channel;
- temporary transfer error;
- invalid destination;
- transfer error;
- unknown.

User copy may be friendly but must not invent a different cause.

## 12. Release semantics

1. Creating a draft batch does not call Xendit.
2. Scheduling remains app-owned; release occurs only via an authorized action/job.
3. Releasing transitions the batch atomically into a release-in-progress state before fan-out.
4. Recipients are processed with bounded concurrency, not unbounded `Promise.all`.
5. Each result is persisted independently.
6. Initial `REQUESTED/ACCEPTED/LOCKED` is not reported as paid.
7. The action response reports accepted/submitted/failed-to-submit counts, not final paid counts unless Xendit actually returns terminal states.
8. Final state converges via reads and webhook/projector when available.
9. Partial submission is resumable without duplicating successful/unknown attempts.

## 13. Retrieval and list semantics

- app batch list comes from the durable local batch repository;
- Xendit `getPayouts` is used to recover/reconcile by recipient attempt reference, not to list all app batches;
- `getPayoutById` refreshes a known attempt;
- Xendit cursor fields are handled as opaque during reference reconciliation;
- local pagination can retain totals because local durable records own the batch list;
- local state displays `lastSyncedAt`/staleness where appropriate.

## 14. Cancellation semantics

1. Cancellation is per Xendit payout, not intrinsically per batch.
2. `cancelPayout` is allowed only when latest verified Xendit status is `ACCEPTED`.
3. UI must not promise whole-batch cancellation when some recipients are REQUESTED, LOCKED, SUCCEEDED, FAILED, or unknown.
4. Batch cancel operation enumerates eligible recipients and reports each outcome.
5. Ineligible recipients remain unchanged and are clearly reported.
6. Concurrent transition conflict triggers refresh/reconciliation.
7. A cancelled payout maps to `CANCELLED`, not `RETURNED`.
8. “No funds were released” copy is shown only when every recipient is proven never released.

## 15. Existing settings and accounts

These remain app-owned:

- automated flag;
- cadence/day/minimum;
- notification preferences;
- default destination account;
- saved beneficiary records.

C5 enriches account/channel selection but does not claim Xendit stores these settings. “Verification takes up to two business days” must not be shown merely because a record was saved locally; account verification needs a real supported verification capability or neutral copy.

## 16. Balance withdrawal interaction

`withdrawBalance` currently creates and immediately approves one mock payout recipient.

In live mode it remains disabled until C6 is complete. After C6, withdrawal becomes a one-recipient persisted payout batch/attempt and follows identical authorization, idempotency, asynchronous status, and audit rules. It cannot subtract funds based on a fabricated immediate settlement.

## 17. Authentication and authorization

C6 requires:

1. valid Better Auth session;
2. explicit payout permission/role policy;
3. actor recorded on batch, release, retry, and cancellation;
4. server-derived tenant context;
5. re-authorization at release/cancel time, not only draft creation;
6. protection against cross-batch/cross-tenant IDs;
7. optional step-up/MFA policy as a product/security decision for high-value payout release.

`forUserId` remains omitted until C11. Browser input can never directly set it.

## 18. Mode and failure behavior

| Condition | Required behavior |
|---|---|
| Xendit unconfigured | existing deterministic mock journey, visibly mock |
| configured C5 success | validated live channels |
| configured C5 failure | safe error; no seeded channels represented as live |
| configured C6 before prerequisites complete | release/withdraw disabled |
| configured C6 SDK failure | persist typed attempt failure/unknown; no mock settlement |
| ambiguous timeout | recovery workflow; no new random key |
| malformed response | invalid-response state; do not mark paid |

## 19. Acceptance criteria

### C5 channel discovery

**AC-01:** Valid IDR channel request calls `getPayoutChannels` with allowlisted filters and no `forUserId`.

**AC-02:** Every channel and amount-limit response is validated and normalized; invalid ranges fail safely.

**AC-03:** Live recipient/destination selection uses supported channel codes, not arbitrary bank labels.

**AC-04:** Configured channel failure never silently substitutes seeded channels as live.

**AC-05:** App schedule/default-account settings remain explicitly app-owned.

### C6 durable execution

**AC-06:** Draft creation persists batch/recipients but makes zero Xendit payout calls.

**AC-07:** Authorized release creates exactly one persisted attempt and stable key per recipient before SDK calls.

**AC-08:** Duplicate browser submissions and process retries reuse the same attempt/key/payload.

**AC-09:** One recipient maps to one Xendit create request with exact channel/account/amount/reference/currency mapping.

**AC-10:** REQUESTED/ACCEPTED/LOCKED never render as paid.

**AC-11:** Partial submission persists and displays each recipient outcome independently.

**AC-12:** Batch list/detail derives from durable local records; `getPayouts` is not misused as global batch listing.

**AC-13:** Ambiguous outcomes reconcile by known ID or reference before another create.

**AC-14:** A terminal retry creates a new linked attempt and cannot overwrite the prior attempt.

**AC-15:** Cancellation calls Xendit only for currently eligible ACCEPTED payouts and reports partial batch cancellation honestly.

**AC-16:** Full account numbers are encrypted at rest and redacted outside the narrow SDK call boundary.

**AC-17:** Every release/retry/cancel is authenticated, authorized, audited, and tenant-safe.

**AC-18:** SDK/error/malformed-response paths cannot mutate the mock store or claim money moved.

**AC-19:** Existing live-mode withdrawal is blocked until it uses the same durable payout pipeline.

**AC-20:** Mock mode retains deterministic behavior and is visibly marked mock.

**AC-21:** Direct `xendit-node` imports remain confined to `lib/xendit.ts`.

## 20. Required automated tests

### C5

1. exact channel filter translation;
2. normalization for bank/e-wallet categories;
3. min/max/increment validation;
4. unknown category handling;
5. configured errors with no false fallback;
6. mock mode and source metadata;
7. unsupported channel rejection before payout creation.

### C6

8. unauthorized and forbidden release before any SDK call;
9. draft creation makes no SDK call;
10. confirmation bound to current amount/count/version;
11. one attempt per recipient with unique constraints;
12. exact create request and redacted metadata;
13. duplicate submission concurrency;
14. timeout/crash recovery by ID/reference;
15. payload hash mismatch rejection;
16. status/failure-code mapping;
17. bounded partial fan-out and resumability;
18. terminal retry creates new attempt;
19. get-by-ID reconciliation;
20. reference pagination/recovery;
21. eligible and ineligible cancellation;
22. partial batch cancellation copy;
23. malformed response never marks paid;
24. account-number encryption/redaction/log tests;
25. audit event content and redaction;
26. mock/live mode isolation;
27. withdrawal guard;
28. database rollback/transaction failure;
29. no direct network calls in unit tests;
30. SDK import boundary.

## 21. Expected code integration map

### C5

- new Xendit payout-channel DAL/adapter and tests;
- payout data facade channel method;
- payout settings/destination components;
- server-side channel/input validation.

### C6 persistence and domain

- `apps/web/prisma/schema.prisma` and migration;
- new payout repository/service/DAL and tests;
- `apps/web/src/server/data/payouts.ts` split into mock facade and durable live domain;
- `apps/web/src/server/actions/payouts.ts` auth, confirmation, release, retry, cancel;
- payout list/detail/bulk/settings pages/components;
- audit integration;
- later webhook projector integration.

### Balance interaction

- `apps/web/src/server/data/balance.ts`
- `apps/web/src/server/actions/balance.ts`
- withdrawal UI and tests.

No implementation is approved merely by this file list.

## 22. Delivery plan after approval

1. C5 contracts/tests/adapter/UI.
2. C6 schema, migration, repository, encryption and concurrency tests.
3. authenticated draft creation.
4. authorized idempotent recipient release with bounded concurrency.
5. list/detail and reconciliation reads.
6. cancellation.
7. terminal retry.
8. balance withdrawal migration.
9. webhook convergence after C10 projector foundation.
10. complete verification and five identical mapping-audit iterations.

C5 and C6 must not be merged into one unreviewable implementation change.

## 23. Verification gates

```bash
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web lint
grep -R 'from "xendit-node"' apps/web/src --include="*.ts" --include="*.tsx"
```

C6 additionally requires migration tests, database constraint/concurrency tests, and a failure-injection procedure for timeout/crash recovery.

## 24. Approval checkpoint

Coding must not begin until a human approves:

- C5 ships separately before C6;
- a batch is app-owned and one recipient equals one Xendit payout;
- C6 requires durable Prisma records and account-number encryption;
- release is asynchronous and does not claim immediate payment;
- terminal retry creates a new attempt;
- cancellation is per eligible ACCEPTED payout;
- payout settings remain app-owned;
- live balance withdrawal stays disabled until C6;
- release/cancel requires authenticated authorization, with a decision on step-up/MFA thresholds.
