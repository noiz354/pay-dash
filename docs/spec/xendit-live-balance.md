# Specification: Xendit Live Current Balance — Capability 1

> Status: **PROPOSED FOR HUMAN APPROVAL**  
> Date: 2026-09-03 (+07:00)  
> Capability: `Balance.getBalance`  
> SDK baseline: `xendit-node@7.0.0`  
> Source mapping: `docs/prompts/xendit-node-mapping.prompt.md` §1 row 1 and §2.C; `INTEGRATION.md` §5 Balance

## 1. Decision

The first live Xendit capability will be **read-only current CASH balance** for the balance page and dashboard balance strip.

When `XENDIT_SECRET_KEY` is configured, the application reads the current balance from Xendit's `Balance.getBalance`. When it is not configured, the existing deterministic in-memory balance remains available as the development/demo fallback.

This slice establishes the server-only SDK/DAL/fallback pattern before integrating transaction history or money-moving operations.

## 2. Problem

`apps/web/src/server/data/balance.ts` currently derives every balance figure from seeded transactions, payout batches, and top-ups. This is useful in demo mode but is not merchant account truth when a Xendit key is configured.

The repository already has:

- a server-only Xendit client at `apps/web/src/lib/xendit.ts`;
- a configuration gate, `isXenditConfigured()`;
- balance consumers at the balance page and dashboard balance strip;
- an existing mock balance and test suite.

It does not yet have:

- a Xendit DAL adapter;
- a normalized live-balance contract;
- explicit fallback/error semantics;
- source visibility distinguishing live data from demo data.

## 3. Goals

1. Display the merchant's current Xendit CASH balance when Xendit is configured.
2. Preserve the current deterministic demo experience when Xendit is not configured.
3. Keep all SDK access and credentials server-only.
4. Normalize SDK output before it reaches pages/components.
5. Make the displayed source explicit: `xendit-live` or `mock`.
6. Fail visibly and safely if a configured Xendit call fails; never replace an operational failure with plausible mock money.
7. Establish a testable adapter seam for later Transaction, Invoice, and Payout slices.

## 4. Non-goals

This capability does **not** include:

- Xendit transaction or movement history;
- a live historical chart (that requires point-in-time reads and/or Transaction integration);
- HOLDING or TAX account selection in the UI;
- multi-currency selection;
- `forUserId` / sub-merchant balance access;
- top-up integration;
- withdrawal or payout integration;
- caching, polling, queues, or database persistence;
- changing webhook processing;
- silently falling back to mock data after an SDK/network/auth/rate-limit error.

These are separate capabilities and must receive separate specs.

## 5. User-visible scope

### 5.1 Balance page

The primary available-balance figure uses the live Xendit value in configured mode. The page must indicate whether the figure is live or demo data without exposing credentials or internal error details.

### 5.2 Dashboard

The dashboard balance strip uses the same normalized current-balance read and therefore cannot disagree with the balance page during the same data-source mode.

### 5.3 Existing history and chart

Movement history and the trend chart remain app-owned demo/derived data in this first slice. They must be labeled as demo/derived when the primary current balance is live. The UI and documentation must not claim that those rows reconcile to Xendit's live balance.

### 5.4 Existing write simulations

Mock top-up and withdrawal actions must not report success as if they changed Xendit funds while live mode is active. In configured mode they are disabled or rejected with a clear message that live top-up/payout integration is not part of this capability. They remain functional in mock mode.

## 6. Functional contract

### 6.1 Input

The public application-level current-balance read accepts no browser-controlled SDK parameters in this slice.

The DAL calls Xendit with fixed, validated values:

```text
accountType = CASH
currency    = IDR
atTimestamp = omitted (current balance)
forUserId   = omitted
```

### 6.2 Normalized output

The application contract is independent of Xendit's raw model:

```ts
type CurrentBalance = {
  available: number;
  currency: "IDR";
  accountType: "CASH";
  source: "xendit-live" | "mock";
  asOf: string;
};
```

Contract rules:

- `available` is finite, non-negative, and represented in IDR minor-unit semantics used by the existing UI.
- `currency` is exactly `IDR` for this slice.
- `accountType` is exactly `CASH`.
- `source` is explicit and is not inferred by the browser.
- `asOf` is a valid ISO-8601 timestamp generated server-side after a successful read or mock derivation.
- Raw SDK objects are not returned to components.

If the SDK model permits values outside these rules, the DAL rejects them as an upstream-contract error rather than coercing silently.

### 6.3 Mode selection

| Condition | Required behavior |
|---|---|
| `XENDIT_SECRET_KEY` absent | Return existing derived balance with `source: "mock"` |
| Key present and SDK succeeds | Return normalized SDK balance with `source: "xendit-live"` |
| Key present and SDK fails | Return/throw a typed service failure; do **not** use mock balance |
| Key present but response is malformed | Return/throw a typed upstream-contract failure; do **not** use mock balance |

Mode is selected server-side only via the existing Xendit configuration boundary.

## 7. Error contract

Configured-mode errors are mapped to stable application categories:

- `XENDIT_UNAVAILABLE` — network, timeout, or upstream 5xx;
- `XENDIT_UNAUTHORIZED` — invalid/revoked credentials or forbidden access;
- `XENDIT_RATE_LIMITED` — upstream throttling;
- `XENDIT_INVALID_RESPONSE` — response violates the normalized schema;
- `XENDIT_UNKNOWN` — safe catch-all.

Requirements:

1. UI receives a safe, actionable message and retry affordance where appropriate.
2. Raw stack traces, secret keys, authorization headers, and full upstream payloads never reach the client.
3. Server logs include category and safe operational context, but no secret or sensitive financial identifiers.
4. Mock money must never be presented as a successful fallback for these errors.

## 8. Security and tenancy

1. `xendit-node` remains imported only by `apps/web/src/lib/xendit.ts`.
2. DAL modules import the wrapped client/sub-client, never `xendit-node` directly.
3. All Xendit/DAL modules include the server-only boundary.
4. No secret or raw SDK client is serialized to a Client Component.
5. `forUserId` is deliberately unsupported in this slice. Any future support requires authenticated organization-to-Xendit-account authorization and a separate acceptance spec.
6. Browser query parameters, form fields, headers, or cookies cannot override `accountType`, `currency`, or `forUserId` in this slice.

## 9. Architecture constraints

Expected flow:

```text
Balance page / dashboard Server Component
  -> balance data facade
     -> configured?
        -> yes: Xendit balance DAL -> normalized CurrentBalance
        -> no: existing mock derivation -> normalized CurrentBalance
```

Responsibilities:

- `lib/xendit.ts`: instantiate and expose the server-only SDK wrapper.
- Xendit DAL: call `Balance.getBalance`, validate response, normalize errors and DTO.
- Balance data facade: choose live versus mock based only on configuration.
- Page/components: render the normalized DTO and source/error state.
- Existing mock derivation: remain deterministic and independently tested.

The data facade must support dependency substitution in tests; tests must not make network calls.

## 10. Acceptance criteria

### AC-01 — Capability fixed

**Given** this specification is approved  
**Then** the first implementation capability is current Xendit CASH/IDR balance only  
**And** transaction history and money movement are not pulled into the slice.

### AC-02 — Live read

**Given** Xendit is configured  
**And** the SDK returns a valid CASH/IDR balance  
**When** the balance page or dashboard requests current balance  
**Then** `Balance.getBalance` is called with `accountType: "CASH"` and `currency: "IDR"`  
**And** the normalized result has `source: "xendit-live"`  
**And** both consumers display that value.

### AC-03 — Mock mode

**Given** Xendit is not configured  
**When** current balance is requested  
**Then** no Xendit SDK method is called  
**And** the existing derived balance is returned with `source: "mock"`  
**And** current demo tests continue to pass.

### AC-04 — No false fallback

**Given** Xendit is configured  
**And** the SDK request fails or returns an invalid response  
**When** current balance is requested  
**Then** the request produces a safe typed failure state  
**And** no mock balance is substituted  
**And** the UI does not display a plausible stale/demo amount as live.

### AC-05 — Source disclosure

**Given** a balance is rendered  
**Then** the UI exposes an understandable live/demo source indicator  
**And** configured mode labels existing chart/history as derived/demo until Transaction integration is implemented.

### AC-06 — Write safety

**Given** live mode is active  
**When** a user attempts the existing mock top-up or withdrawal flow  
**Then** the operation is disabled or rejected before mutating mock stores  
**And** the user is told that the corresponding live integration is not yet available.

**Given** mock mode is active  
**Then** existing top-up and withdrawal behavior remains unchanged.

### AC-07 — Data validation

**Given** any SDK response  
**When** it crosses the DAL boundary  
**Then** it is validated and converted to `CurrentBalance`  
**And** non-finite, negative, missing, or incompatible values fail as `XENDIT_INVALID_RESPONSE`.

### AC-08 — Server-only boundary

**Given** the completed implementation  
**Then** source search finds exactly one direct `xendit-node` import, in `apps/web/src/lib/xendit.ts`  
**And** no Client Component imports Xendit or its DAL.

### AC-09 — No tenant spoofing

**Given** any browser request  
**When** it includes a proposed `forUserId`, account type, or currency override  
**Then** that input cannot alter the fixed DAL request for this slice.

### AC-10 — Regression and consistency

**Given** either supported mode  
**Then** the balance page and dashboard consume the same application-level current-balance contract  
**And** mock-mode movement reconciliation tests remain valid  
**And** live-mode tests do not assert reconciliation against mock history.

## 11. Required tests

Implementation is not complete without automated tests covering:

1. configured success and exact SDK arguments;
2. unconfigured mock fallback and zero SDK calls;
3. configured network/upstream failure with no fallback;
4. malformed, non-finite, and negative upstream balances;
5. safe error mapping for auth, rate-limit, unavailable, and unknown failures;
6. normalized DTO and source metadata;
7. dashboard and balance page using the same facade contract;
8. mock write actions still working in mock mode;
9. live mode rejecting top-up/withdraw before mock mutation;
10. no direct network access in unit tests.

Existing `apps/web/src/server/data/balance.test.ts` behavior remains the mock-mode regression baseline.

## 12. Verification gates

Before implementation is declared complete:

```bash
pnpm --dir apps/web test
pnpm --dir apps/web typecheck
pnpm --dir apps/web lint
grep -R 'from "xendit-node"' apps/web/src --include="*.ts" --include="*.tsx"
```

Expected import result: only `apps/web/src/lib/xendit.ts`.

Also rerun the identical Xendit mapping audit suite for at least five iterations and record new implementation evidence in `docs/audit/xendit-mapping-audit.md`. A historical five-pass audit does not certify the new code.

## 13. Delivery slices after approval

1. **Contract tests:** normalized DTO, mode selection, exact SDK arguments, and error semantics.
2. **DAL adapter:** server-only call, validation, and typed error mapping.
3. **Data facade:** live/mock selection without catch-and-fallback.
4. **Consumers:** balance page and dashboard source/error presentation.
5. **Write guard:** prevent mock top-up/withdraw mutation in live mode.
6. **Regression and audit:** tests, typecheck, lint, import check, then five identical audit iterations.

No later slice starts until the preceding slice's acceptance tests pass.

## 14. Deferred capability queue

Recommended order after this slice:

1. Transaction ledger and live history (`Transaction.getAllTransactions`);
2. payout channel discovery (read-only);
3. idempotent payout creation and withdrawal;
4. invoices/payment links;
5. customers and refunds;
6. payment methods/subscriptions;
7. webhook-to-ledger processing;
8. authenticated `forUserId` tenancy.

## 15. Approval checkpoint

Coding must not begin until a human approves this specification, especially these product decisions:

- first capability is read-only CASH/IDR current balance;
- SDK failures never fall back to mock;
- live current balance may coexist temporarily with clearly labeled demo history;
- mock top-up/withdraw are unavailable in live mode;
- `forUserId` is deferred.
