# ADR-0038: Stale UX — age is always shown; >60 s is always labeled

**Status:** Accepted (Wave 3 CMP-019, real polling Wave 4)

## Context
AS-IS: no freshness signal anywhere. Operators had to guess whether a number was live; when it wasn't, the failure was a wrong decision, not a visible one.

## Decision
- Every polled surface shows its age ("Updated Ns ago") — the cue is **always on**, not just when stale.
- **> 60 s** (spec §7): `StaleBanner` with the age + a **Refresh** action; the banner's refresh is the recovery path.
- Failed refresh: error state visible, age keeps growing (honest), data not blanked.
- The stale threshold and interval are the hook's defaults (20 s / 60 s) — one place, spec-cited.

## Alternatives
- **Hide the cue until stale:** rejected — "no cue" is indistinguishable from "live"; the AS-IS distrust came from exactly that.
- **Auto-refresh on staleness only:** kept as the behavior (polling continues); the banner is the *label*, not a pause.

## Trade-offs
The always-on age is a small visual cost on every polled surface — paid to make "live" a visible property.

## Consequences
- `stale-banner.test.tsx` green; `stale_seen` (age_sec) vs `stale_refreshed` events distinguish "was shown stale" from "user acted" (runbook Case 3 uses both).
- Gate 4 (freshness-stale) PENDING EXTERNAL VERIFICATION.
