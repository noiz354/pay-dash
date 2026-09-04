# Spec: Xendit Adapter

> Module ID: `xendit-adapter`
> Initiative map: `docs/spec/payment-platform-capability-map.md`
> Status: **IMPLEMENTED (adapter boundary + read-only verification + capability scan + balance read) — VERIFY GATE**
> Date: 2026-09-03 (+07:00)
> Inputs: `xendit-integration-portfolio.md`; `xendit-shared-contracts.md`; `xendit-mapping-audit.md`; `xendit-remaining-sdk-and-http-gaps.md`.

## Boundary

- Server-only. The single `xendit-node` import stays in `apps/web/src/lib/xendit.ts`; `src/server/providers/xendit.ts` consumes an injected `createClient(secretKey)` surface and never imports the SDK package.
- No SDK model leaks to UI/application services; the adapter returns normalized DTOs.
- Capability-specific subinterfaces (`BalanceProvider`, `TransactionProvider`, …) are optional, so unsupported features are structurally explicit rather than faked by a mock.
- Direct HTTP is deferred to a later approved tranche; this slice implements the verified SDK surface (Balance + capability scan).

## Contracts

### Canonical error

```ts
type XenditErrorCode = UNAUTHORIZED | FORBIDDEN | RATE_LIMITED | INVALID_REQUEST | NOT_FOUND |
  CONFLICT | IDEMPOTENCY_CONFLICT | UNAVAILABLE | TIMEOUT | INVALID_RESPONSE | UNKNOWN;
class CanonicalProviderError extends Error {
  readonly provider: "xendit"; readonly code; readonly retryable; readonly category;
  readonly message;    // safe, redacted
  readonly status;     // null-safe
  readonly operation;
}
```

- `normalizeXenditError(err, operation)` maps HTTP status to code/category, sets `retryable` for upstream/rate-limit, and redacts secret-shaped substrings (`sk_*`, `rk_*`, `whsec_*`, Xendit key patterns).
- Errors are an `Error` subclass so `rejects.toThrow`/catch blocks behave like a normal failure.

### Capability manifest (server-derived)

`getCapabilities` returns the normalized `CapabilityManifest` from `provider-connections`. Truthful for Xendit `xendit-node@7.0.0`:

- Supported (SDK): `balanceRead`, `transactionRead`, `hostedPaymentLinks` (Invoice), `customers`, `savedPaymentMethods`, `refunds`, `payouts`.
- Not supported by the SDK (needs approved direct HTTP): `recurringBilling`, `connectedAccounts`, `internalTransfers`, `splitRouting`.
- Read capabilities show `configured/available` only for a verified connection; write capabilities are reported `supported` but `available: false` until `durable-operation` + `organization-access` + `financial-step-up` + `audit` wiring exists. `webhookHealth` is `UNCONFIGURED` until callback verification.

### Verification (`verifyConnection`)

- Read-only CASH/IDR balance probe; certifies read permission.
- Success → `verified: true`, `state: ACTIVE`, `requirements: ["Configure Xendit webhook callback"]`, `permissionsVerified: true`.
- Auth/upstream error → `verified: false`, `state: FAILED`.
- Invalid response → `verified: false`, `state: ACTION_REQUIRED`.
- `accountIdentity`/`forUserId` are deliberately `null` here (must be server-derived from trusted persistence, not exposed).

## File structure

```text
apps/web/src/lib/xendit.ts                      # single SDK import + createXenditClient(secret)
apps/web/src/server/providers/xendit.ts         # XenditAdapter + normalizeXenditError
apps/web/src/server/providers/xendit.test.ts
```

## Tests

- capabilities: read supported/configured; write supported-not-available; manual-HTTP capabilities unsupported; webhookHealth unconfigured.
- verifyConnection: valid probe ACTIVE; auth error FAILED; invalid response ACTION_REQUIRED.
- getBalance: normalized live balance; no-secret-connection throws safe error.
- normalizeXenditError: auth non-retryable; rate-limit/5xx retryable; 404/unknown; secret never in message.
