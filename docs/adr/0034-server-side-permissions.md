# ADR-0034: Server-side permission enforcement (UI is secondary)

**Status:** Accepted (Wave 0, reinforced Wave 4)

## Context
Money actions and exports had no server-side permission checks; the UI hiding a button was the only control. The audits scored this P0. Additionally, "is the button hidden?" is untestable as security — a hidden button proves nothing about the endpoint.

## Decision
Authorization resolves **only** from the authenticated org membership, in this order for every mutation:
1. `requireStrictOrgContext(permission)` (session → org → role → least-privilege matrix in `domain/organization/roles.ts` — 8 roles × 25 permissions).
2. Dual-control/step-up where the policy requires (ADR-0035).
3. Idempotency + version checks (ADR-0036/0039).
4. Mutate → audit/timeline → revalidate.
The UI layer (`hasPermission`, disabled-with-reason controls, server-computed `canAct` on Command Center cards) is ergonomics: it explains *why* and *who can help*, never *whether*. Denials are observable (`permission_denied` event; runbook Case 2).

## Alternatives
- **Role-name checks in the UI:** rejected — role vocabulary is an implementation detail; permissions are the contract.
- **Per-endpoint middleware only:** rejected — server actions are the mutation surface; the edge gate covers reads, actions cover writes.

## Trade-offs
Every new mutation must carry its permission up front (friction = good). Least-privilege means some roles see locked controls with reasons (intentional UX, P9 of the AS-IS problems).

## Consequences
- org-context 7/7, roles 7/7, export-guard 5/5 (per-resource least privilege — documented SPEC_CONFLICT vs uniform `audit.read`), payment-flow suites.
- Wave 4 e2e gate 3 drives a *visible* retry control through the server and expects the denial — the test design encodes this ADR.
