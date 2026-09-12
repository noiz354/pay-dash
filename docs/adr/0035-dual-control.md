# ADR-0035: Dual control for threshold money movement (two phases, distinct actors)

**Status:** Accepted (Wave 0 server, Wave 4 journey)

## Context
A single actor could both request and approve a large refund (the "approver" was a text field in the same form). The AS-IS audit's headline P0 for money-out. The fix is not a bigger checkbox — it is a **journey change**: the second actor must be a different human, acting from their own session, at their own time.

## Decision
- **Policy** (`domain/security/step-up.ts`): refund ≥ IDR 10 M **or** ≥ 50 % of the original payment; payout ≥ IDR 25 M/recipient **or** IDR 100 M/batch. Thresholds are data (`DEFAULT_DUAL_CONTROL_POLICY`), not code.
- **Journey (two phases, three actions):** Role A (`refund.prepare`) *requests* — no money moves; the transaction becomes `AWAITING_APPROVAL`, a handoff opens to the approver roles with a deep link. Role B (`refund.execute`) *approves or rejects* from their own session. **The actor is always session-derived — never form-derived** (a client cannot name itself its own approver).
- **Distinctness:** `isApproverDistinct(requester, approver)` — same actor is refused server-side with an explicit message; both actors are recorded in the timeline ("requested by X … approved by Y · dual control satisfied").
- **UI:** state-aware (requester sees the queue), permission-aware (a viewer sees "Waiting on Finance Admin or Owner", not a dead button), and the dual-control queue is a shareable URL (`?refundState=AWAITING_APPROVAL`).

## Alternatives
- **Step-up MFA on the same actor (one person, stronger proof):** considered; rejected as the primary control — the business requirement is *two people*, and the step-up binding (`step-up.ts`) is kept as the challenge-binding layer for the future MFA transport.
- **Bigger confirmation dialog:** rejected — a dialog is not a control.

## Trade-offs
The journey is slower by design (a second human, possibly a different day). If the approver role is absent, work ages into SLA (runbook Case 10, `pending_approval` shape) — visibility replaces speed.

## Consequences
- `refund-lifecycle.test.ts` 17/17 (no money on request; same-actor refused; dual-actor audit trail), `refund-workflow.test.tsx` 10/10, PR #9 targeted tests (the suite caught a real bug: the request trigger was reachable for permissionless viewers — fixed in `0592154`).
- Browser gate 1 (refund-handoff) PENDING EXTERNAL VERIFICATION.
