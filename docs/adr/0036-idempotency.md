# ADR-0036: Idempotency keys for money-adjacent mutations

**Status:** Accepted (Wave 3, BE-005/BE-008)

## Context
Double-clicks, retried requests, and webhooks (which are retried by design) can deliver the same logical mutation twice. For money movement, a silent second application is a financial incident.

## Decision
`server/data/idempotency.ts`: key = **hash(orgId + type + entityId + payloadHash)**;
- same key + same payload → **replay the original result** (no second mutation);
- same key + different payload → **409 Conflict** (never a second mutation, never a silent overwrite).
Applied to the three money-adjacent mutations: payout batch create, refund request, payment retry. The client side contributes (`bulkPending` disables the bar while in flight; CSV `seen`-set dedupes duplicate accounts within a file).

## Alternatives
- **Client-side debounce only:** rejected — the network and webhooks are outside the client's control.
- **Provider-side idempotency only:** rejected — the in-memory fallback path (TEST mode) has no provider; the app's own contract must hold.

## Trade-offs
Key stability is a contract: changing the payload fields in the hash changes key behavior (a review red flag in `PR_REVIEW_GUIDE.md` §2). The 409 on key-mismatch surfaces as an error the operator must understand (runbook Case 6) — clarity is documented, not hidden.

## Consequences
- `idempotency.test.ts` 7/7; provider writes additionally carry the durable op + audit (`payment-flows/*`).
- Distinct from versioning (ADR-0039): idempotency answers "did I already do this?", versioning answers "did the row change under me?" — both are required and both are tested.
