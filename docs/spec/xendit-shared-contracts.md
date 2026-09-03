# Xendit Shared Integration Contracts

> Status: **PROPOSED FOR HUMAN APPROVAL**  
> Applies to all SDK and direct-HTTP capabilities.

## Runtime mode

```ts
type XenditMode = "mock" | "xendit-live";
```

- Secret absent: mock mode.
- Secret present: live mode.
- A live call failure never changes mode and never falls back to mock.
- Mode is selected server-side and exposed only as safe source metadata.
- Test mode versus live Xendit credentials must be represented separately from mock versus configured mode; key text must never be parsed in browser code.

## Adapter boundary

- Only `apps/web/src/lib/xendit.ts` imports `xendit-node`.
- SDK adapters and manual HTTP clients are server-only.
- Feature code depends on injected narrow interfaces for tests.
- Raw SDK/HTTP responses are runtime-validated and normalized.
- No unit test performs a real external request.

## Error contract

```ts
type XenditErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "UNKNOWN";
```

Normalized errors contain code, retryable flag, safe message, operation name, HTTP status when safe, and correlation ID when supplied. They never contain credentials, authorization headers, full account/card numbers, OTPs, raw PII payloads, or stack traces in client output.

Retry policy:

- reads: bounded retry only for timeout/unavailable/rate-limit according to server policy;
- writes: retry only with proven stable idempotency/recovery contract;
- validation/auth/forbidden/not-found are not blindly retried;
- `Retry-After` is honored where applicable.

## Authentication and tenant context

- Reads/writes declare their authorization requirement explicitly.
- Financial writes always require authenticated actor and permission.
- `forUserId` and `with-split-rule` are derived from authorized server context, never trusted from browser input.
- Cross-tenant resource ownership is checked before external call.

## Observability and audit

Safe operational context may include actor ID, organization ID, operation type, safe resource/reference IDs, amount/currency, status transition, idempotency-key fingerprint, correlation ID, and outcome.

Secrets, OTPs, full financial identifiers, and unnecessary PII are prohibited. Financial mutations produce durable audit events; logs are not a replacement for audit records.

## Direct HTTP transport

- fixed `https://api.xendit.co` base URL;
- server-generated Basic auth;
- timeout/abort;
- JSON validation;
- explicit API version when required;
- redirects disabled or restricted;
- bounded response size;
- normalized error mapping;
- injectable transport;
- SDK remains preferred when it supports the operation.

## Acceptance criteria

1. Missing configuration selects mock without external call.
2. Configured failure never returns mock success.
3. Only one direct SDK import exists.
4. Raw upstream values cannot bypass runtime schemas.
5. Client errors are safe and stable.
6. Read retries are bounded; write retries require stable idempotency.
7. Browser input cannot set privileged Xendit headers.
8. Logs/audits pass redaction tests.
9. Unit tests use injected adapters/transports.
10. Unknown enum/status values degrade safely and are not mapped to success.
