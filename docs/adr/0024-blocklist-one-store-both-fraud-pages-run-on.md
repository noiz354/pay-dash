# 0024 — Blocklist: one store both fraud pages run on

Date: 2026-09-02
Status: Accepted

## Context

`/fraud` and `/fraud/blocklist` were two mockups of the same concept that
disagreed with each other:

1. **Two contradictory lists** — `/fraud` hard-coded
   `192.168.1.105 / 10.0.0.24 / 172.16.254.1 / 45.33.22.110` (added
   Oct 24–27 **2023**); `/fraud/blocklist` hard-coded
   `192.168.1.1 / 203.0.113.42 / 198.51.100.7 / 45.22.19.102` (Oct 10–24
   **2023**). Same domain, zero shared state, mutually exclusive data.
2. **Invented metrics** — "Total Blocked Entities **14,209** (+12% this
   week)", "High Risk IPs **8,432** (+5%)", "Blocked Cards **3,194**" —
   and "High Risk IPs" has no data source at all (the ledger has no IP
   field).
3. **A title with no model** — three tabs (IP / Card Numbers / Email
   Domains) on both routes, but Cards and Email rendered prose
   ("No card blocklist entries."); the world had only IP literals.
4. **Dead controls** — Add to Blocklist (no dialog), Filter/Search
   (unwired), Export (no endpoint), row ⋮ (no menu), delete (no handler),
   "Showing 1-4 of **124**" (124 invented) with a live-looking Next
   button.
5. **Prototype debris** — 2023 dates, `bg-white`, emerald/red literals,
   no `metadata`.
6. **No model anywhere** — INTEGRATION.md:92/:113/:319 documents the
   screen with **no Xendit source**: "Fraud rules are
   Dashboard/console-only."

## Decision

The blocklist is **app-owned** (the class the team, risk, webhooks and
links pages use), and there is exactly **one store**:

**1. `server/data/blocklist.ts` — deliberately seeded, one source of
truth.** Ten entries consolidating the two prototype lists into one
coherent world, date-relative (the 2023 stamps are gone): 6 IPs
(prototype values, deduped), **2 masked cards** (`453322 •••• 0110` —
first-6/last-4, the shape the console shows; stored that way) and
**2 email domains** (disposables — the Email tab becomes true). Fields:
`id (blk_… djb2 base36)`, `type (IP|CARD|EMAIL)`, `value`,
`reason (KNOWN_MALICIOUS|HIGH_FREQUENCY|CHARGEBACK_ABUSE|MANUAL_ENTRY)`,
`addedAt`. `listBlocklist({type,q,page})` newest-first;
`blocklistSummary()` derives per-type counts + "added in last 30 days";
`addBlocklist` validates **per type** (IPv4/IPv6 octet-checked; cards
12–19 raw digits stored masked; email domains — full addresses rejected),
rejects duplicates; `removeBlocklist`; `blocklistToCsv`
(`type,value,reason,added_at`). The type/reason vocabulary lives in
client-safe `lib/blocklist-options.ts`.

**2. `/fraud` rebuilt on the derived store** — the three metric cards are
now the three entry types (derived counts + real "N added in the last 30
days"; 14,209/8,432/3,194 and "+12%" dropped, "High Risk IPs" dropped —
no source). The panel: URL-driven tabs (`?type=ip|card|email`, labels
carry live counts), debounced search (`?q=`), **real Export**
(`/api/exports/blocklist` mirrors the URL filters — the shared
`ExportCsvButton` convention), real ⋮ (Remove from blocklist) and the Add
dialog. A link to the blocklist route replaces the prototype's invisible
relationship between the two pages.

**3. `/fraud/blocklist` rebuilt on the same store** — the focused view:
same panel, no metric cards. Both routes query `listBlocklist` with the
same URL vocabulary, so an add/remove is visible on both — the
contradiction is structurally impossible.

**4. Real Add dialog** (shared component, `useActionState` +
`addBlocklistAction`) — type select, value, reason; server-validated;
success view; toast + refresh. Remove is a direct server action
(customer-row pattern).

**5. Dropped** — both 2023 row sets (consolidated), the invented metrics
and deltas, "of 124" and the dead Next button (real `TablePagination`:
"1 to 6 of 6" on the IP tab), the prose empty tabs (real sections with
`EmptyState`), `bg-white`/emerald/red literals. `metadata` on both routes.

## Consequences

- URL tab values are lowercase (`ip|card|email`) — the store's enum is
  uppercase; pages normalise via a `TAB_TYPE` map and the export route via
  `toUpperCase()`. Deep links work in either case.
- The shared panel pre-renders all three sections; base-ui only mounts the
  active tabpanel in the DOM (inactive sections ride in the RSC payload),
  so a tab switch shows its real rows with no server round trip.
- `/fraud` shows page 1 of its sections (the console view); pagination is
  real but with ≤ 6 rows per type the page-2 state is unreachable —
  honest, not faked.
- The store is in-memory (restart = seeded 10 entries), like its siblings.
- The mobile prototype's *Allowlist* nav item stays out of scope: the app's
  sidebar promises no allowlist route.
- INTEGRATION.md:319 says Xendit-dashboard fraud is console-managed;
  nothing here claims otherwise.

## Alternatives considered

- *One route only (kill /fraud/blocklist).* Rejected: the route is
  documented in INTEGRATION.md as its own screen and the sidebar/UAT
  reference it; a focused blocklist route beside the fraud console is the
  prototype's own IA.
- *Keep "High Risk IPs" as a watchlist.* Rejected: a watchlist is a new
  domain with no prototype affordance beyond the number; derived
  per-type counts match the tabs and need no invention.
- *Card entries as full PANs.* Rejected: the app never holds full card
  numbers (the ledger has none); masked first-6/last-4 is the only shape
  the world supports.
