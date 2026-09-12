# ADR-0039: 409 conflict recovery — never auto-apply, always show the latest state

**Status:** Accepted (Wave 3 BE-007 + dialog, Wave 4 mount + versioned retry)

## Context
Two operators on one row (or an operator and a provider callback) can race. The options were: last-write-wins (data corruption by design), silent auto-refresh-and-retry (the user's intent is applied to a state they never saw), or refusal. A money console cannot ship the first two.

## Decision
- **Version check:** mutations that can lose a race carry the version the client rendered (`expectedUpdatedAt`). Mismatch → the server returns `{ code: "CONFLICT", latest }` in the `ActionState` — **no write**.
- **Review:** `ConflictDialog` shows the **latest server state as data** (e.g. status now PROCESSING, not the FAILED the tab rendered) — real information, not a generic "data changed".
- **Recovery is explicit:** *Retry with Latest* re-sends against the reviewed version (and emits `conflict_recovered` with `version_delta`), or dismiss syncs the view. **Nothing is ever auto-applied.**
- The idempotency layer (ADR-0036) remains the complement: same-key-different-payload is also a 409, by construction.

## Alternatives
- **Optimistic UI with silent rollback:** rejected for money paths (allowed only for low-risk display state, e.g. balance top-up preview, per Wave 2 §25).
- **Locking (pessimistic):** rejected — the two-actor reality of the product *is* concurrent access; locking serializes people, not just requests.

## Trade-offs
Every conflict costs the operator one explicit review step. That cost is the point: the step is where a human notices "wait, this already moved".

## Consequences
- `conflict-resolution.test.ts` 6/6, `retry-button.test.tsx` 5/5; real two-tab-race gate 5 PENDING EXTERNAL VERIFICATION.
- Runbook Case 5 treats a normal conflict as *the system working*; clustering/conflict-loops are the incident.
