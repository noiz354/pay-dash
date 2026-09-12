# ADR-0040: Role-aware, safe-only command palette (⌘K)

**Status:** Accepted (Wave 3 v1, rewritten on cmdk in Wave 4)

## Context
Power users (15–40 ops/day personas) needed fast navigation and entity lookup without leaving the keyboard. Two constraints were non-negotiable: the palette must never list what the role cannot open, and it must never be a fast path to a destructive or money-moving action (speed into `refund.execute` is a risk, not a feature).

## Decision
- **cmdk-based** palette (rewritten in Wave 4 — the Wave 3 registry's `command-palette.test.tsx 6/6` file never existed; the rebuild replaced the hand-rolled version, and its component test now exists and is green in the 1075 run).
- **Role-aware:** results filtered by `hasPermission` — a route the persona cannot access is not listed (and the server would refuse it anyway: ADR-0034).
- **Safe-only:** navigation + entity search (customers/transactions/payouts by id/name) + recent 5; **no destructive actions, no money movement** from the palette.
- **Performance:** mounted via `next/dynamic` with `ssr:false` — the palette (and cmdk) are out of the SSR chunk; ⌘K pays its cost only when opened.
- **A11y:** `role=dialog aria-modal`, focus trap, Esc returns focus to the trigger.

## Alternatives
- **Global fuzzy search including actions:** rejected — the safe-only rule is the security posture.
- **Keeping the hand-rolled v1:** rejected — the Wave 4 audit found its claimed test file absent; cmdk gives maintained fuzzy matching + keyboard model for less code.

## Trade-offs
The palette is an *index*, not a *surface*: anything it does must also be reachable from its destination screen (the deep link is the contract).

## Consequences
- `command-palette.test.tsx` (component) green in the 1075 run; `palette_opened`/`palette_invoked` analytics emit `query_length` + `result_count` — **never the raw query** (documented deviation from spec ANA-010's raw `query` prop; a free-text query prop is a PII leak).
- E2E-023 (palette role-awareness) sits in the e2e inventory (NOT_RUN in this session).
