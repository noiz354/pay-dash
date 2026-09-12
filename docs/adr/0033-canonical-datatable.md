# ADR-0033: One canonical DataTable

**Status:** Accepted (Wave 2; customers migration Wave 3)

## Context
Four table implementations had diverged 90.1 % (audit §16): different empty states, no consistent `aria-sort`, selection semantics that drifted, and no shared mobile representation. Every screen-level fix had to be made four times.

## Decision
`CanonicalDataTable` (CMP-005) is the only list component for data screens:
- controlled contract (`rows`, `total`, `sort/direction`, `page/pageSize`, `selectedKeys`+`onSelectionChange`, `bulkActions`, `loading/error/empty/isFiltered`, `cardRenderer`);
- column `priority` 0/1/2 drives desktop/tablet/**mobile cards** (cards = identity + status + metadata + action, never a squeezed table);
- distinct empty states (no-data / no-results / filtered-empty with Clear-filters); `aria-sort`, sr-only caption, sticky header;
- **page-scoped** selection with an unambiguous label (no silent cross-page "select all");
- server-side sort/filter/pagination (the client never holds the full dataset).
Legacy tables are retained for unmigrated routes (coexistence, debt D-16) — no flag, no forced removal.

## Alternatives
- **Refactor all 11 tables at once:** rejected — mega-diff risk; incremental migration (transactions → payouts → customers) proved the contract first.
- **Virtualized list:** deferred (not needed at 10–100 rows; revisit > 500).

## Trade-offs
Migrating a screen is real work (page + params + card renderer + tests). The retained legacy tables are maintenance cost until the last consumer migrates.

## Consequences
- `canonical-data-table.test.tsx` 9/9; consumers: transactions (incl. Wave 4 SLA column/filter), payouts, customers (`customers-table.test.tsx` 8/8).
- New list screens are expected to use it (developer handoff §2/§6); a new table implementation is a review blocker.
