# ADR-0031: Canonical grouped navigation (config + resolver, alias-safe)

**Status:** Accepted (Wave 1)

## Context
A flat 30-item sidebar (3 entry points for payouts, an orphan `/payments/platform`, a broken `/reports` parent) made IA depth 4.2 and cost a cognitive scan on every task. But 30 legacy routes were referenced by bookmarks, shared links, and in-shell 404 suggestions — a redesign that breaks them would ship a regression on day one.

## Decision
Three canonical modules own navigation:
- `nav-config.ts` — the IA (5 grouped sections + pinned footer), each item carrying `requiresPermission` (visibility by *permission*, never by role name).
- `route-resolver.ts` — canonical path ⇄ alias map ⇄ breadcrumb chain; all 30 legacy routes resolve.
- `permission-adapter.ts` — the single visibility filter over the config.
The edge (`proxy.ts` rewrites) keeps old URLs alive with 308-safe behavior; the UI renders groups, collapse (280→64), and a mobile More sheet.

## Alternatives
- **Delete legacy routes:** rejected — immediate bookmark/shared-link breakage.
- **Role-name-based menu filtering:** rejected — couples IA to role vocabulary; permission-based survives matrix changes.
- **Per-page nav fragments:** rejected — the flat list proved that nav logic must be one source.

## Trade-offs
The alias map is permanent load-bearing surface (debt D-18 documents the middleware indirection that protects it). A new route must register in config + resolver or it 404s in-shell without suggestions — a small onboarding tax paid to keep one source of truth.

## Consequences
- `route-resolver.test.ts` 20/20, `permission-adapter.test.ts` 12/12, `sidebar.test.tsx` 9/9, `bottom-nav.test.tsx` 4/4 (the FE-015 `startsWith` fix), `proxy.alias.test.ts` 6/6.
- IA depth target 2.8; findability +40 % (spec §6 targets; the measurement rides on the ANA-008 `nav_used` events).
