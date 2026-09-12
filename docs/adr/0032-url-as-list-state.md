# ADR-0032: The URL is the source of truth for list state

**Status:** Accepted (Wave 2)

## Context
Ledger screens kept search/filter/sort/page in React state: refresh lost the view, back-button lost the view, and an operator's triage slice (`FAILED + amount desc + page 2`) could not be shared. For an exception-first operations console, a shareable triage view is a core requirement, not a nicety.

## Decision
Every list param (`page`, `pageSize` 10/25/50, `q`, `sort`, `direction`, screen filters, Wave 4's `sla` and `refundState`) round-trips through `lib/table-url-state.ts`:
- **Parser:** tolerant — legacy aliases normalized (`search→q` …), duplicates last-wins, malformed values fall back deterministically, **never throws**.
- **Serializer:** emits only non-defaults (short, shareable URLs).
- **Behavioral rules:** filter/search change resets `page`; in-place updates use `router.replace` (`scroll:false`); list→detail→back restores exactly.
- **Server mirror:** every param is normalized server-side (`normalizeSlaFilter`, `normalizeRefundStateFilter`, …) because a URL is also an *input* (shared/hand-typed links).

## Alternatives
- **History state only:** rejected — not shareable, not reload-safe.
- **Global store (jotai) for list state:** rejected — state that isn't in the URL is state that can be lost; the store is for genuinely client-local things (palette recents).
- **Per-screen hand-rolled parsing:** rejected — Wave 2's divergence (4 tables, 90.1 %) is exactly what this prevents.

## Trade-offs
Any new param must touch five places (parse, serialize, server normalization, chip/FilterSheet, export mirror) — a deliberate friction cost that keeps the contract single. URLs get longer when filtered (that is the feature).

## Consequences
- `table-url-state.test.ts` (11 + PR #9 extension) is the contract test; the Wave 4 gates 2/6 (back/restore, mobile) verify it in a real browser — PENDING EXTERNAL VERIFICATION.
- "What you see is what you export" (filtered export carries the URL params) follows for free.
