# ADR-0037: Background polling (20 s) as the freshness mechanism

**Status:** Accepted (Wave 3, rewritten Wave 4)

## Context
"Is this data live?" was unanswerable (AS-IS problem 9). For an operations console with dual-control queues and SLA clocks, a silently stale dashboard is a decision-quality risk. Push (SSE/websockets) was considered; the deployment target and the in-memory store made a simple, testable pull model the safer bet.

## Decision
`usePolling` (rewritten in Wave 4):
- **20 s** interval (spec §7) while the tab is **visible** (pauses on `document.hidden`, resumes promptly on `visibilitychange`);
- **one** timer chain, `inFlightRef` guard — polls never overlap or accumulate;
- the displayed age **ticks every 1 s without a fetch** — staleness detection is independent of network success;
- the dashboard endpoint (`/api/dashboard/command-center`) is `no-store`, `guardApiRead`, and **re-checks the session on every poll** — a logged-out/downgraded user 401s on the next tick instead of holding a stale card.
The Wave 4 rewrite fixed three defects: polling was gated on `prefers-reduced-motion` (a motion preference is not a data-currency decision — serving stale financial data to users with vestibular disorders was the real risk); age never re-rendered; two effects raced `start()`.

## Alternatives
- **SSE/WebSocket push:** rejected for now — more failure modes, same store constraints; the seam (one endpoint + one hook) makes a swap possible later.
- **Reduced-motion gating (the old behavior):** rejected — see above; motion lives in CSS, polling is unconditional.

## Trade-offs
20 s is a latency floor for the dashboard (acceptable for exception triage; list screens are request-driven, not polled). Battery/network cost is bounded by the visible-tab rule.

## Consequences
- `use-polling.test.tsx` 24/24 (tick-without-fetch, threshold trip, hidden-tab pause, failure surfacing); browser gate 4 PENDING EXTERNAL VERIFICATION.
- A failed refresh **surfaces** (error state, age keeps growing, `lastUpdated` not advanced) — the honesty contract is tested.
