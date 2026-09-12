# Implementation Progress — Kinetic Ledger UX Redesign
> Source: `IMPLEMENTATION_READY_UX_SPEC.md` (604 lines, 21 JRN × 45 SCR × 20 INT × 24 CMP × 14 ANA)  
> Execution: Wave-based, traceable, tested, reversible. Wave 0 = Safety+Correctness Foundation.

## Wave Gates
- **Wave 0 Gate (P0):** auth fail-closed, financial guards, dual-control, export guard, navigation bug fixed, critical tests green
- **Wave 1 Gate:** grouped nav, permissions, core states, responsive nav
- **Wave 2 Gate:** canonical filter/search/bulk UX, URL state, DataTable stable
- **Wave 3 Gate:** governance, freshness, idempotency, command palette, timeline, a11y hardening
- **Wave 4 Gate:** command center, offline queue, SSO bridge, hero replacement, analytics
- **Wave 5 Gate:** analytics, observability, performance, UAT, optimization

## Ticket Registry
| Ticket | IDs | Scope | Status | Commit | Tests | Notes |
|--------|-----|-------|--------|--------|-------|-------|
| BE-001 | JRN-001 SCR-001..004 | Auth fail-closed proxy strict+preview | DONE | 9bf01dd | proxy.test.ts 7/7 | `src/proxy.ts` strict default + api 401 + preview bypass |
| BE-002 | JRN-003 SCR-006 INT-005 | Refund dual-control initiator!=approver | DONE | db4c615 | payment-flow.test.ts + manual | `transactions.ts` requiresDualControl + distinct |
| BE-003 | JRN-006 SCR-013 INT-009/010 | Payout RBAC requireOrgContext | DONE | db4c615 | export-guard + manual | 9 actions payout.create/release/cancel/retry |
| BE-004 | JRN-017 SCR-025 INT-018 | Exports streaming guard | DONE | fbae269 | export-guard.test.ts 5/5 | 11 routes + helper per-resource |
| FE-015 | JRN-001 SCR-004 CMP-001 | Bottom-nav === bug | DONE | 5e4f6af | bottom-nav.test.tsx 4/4 | startsWith + settings wildcard |
| FE-001 | JRN-001 SCR-001..045 | Navigation alias safety + grouped nav | DONE | 6f7f0af | nav-config.ts + alias map | grouped IA config + rewrites preserved |
| FE-016 | — SCR-025/021/029/023 | Loading skeletons consistency | DONE | 5e4f6af | visual CLS | 7 skeletons 5 rows 44px |
| DSN-005 | — | Success token AA + DSN foundation | DONE | 6f7f0af | visual AA 5.1:1 | --success #0e7a5b + space/radius/motion tokens + focus 2px |
| FE-002 | JRN-001 SCR-001..045 INT-001 | Grouped nav wiring (permission-aware, collapsed, More) | DONE | wave1 | route-resolver.test 20/20 + sidebar.test 9/9 + proxy.alias 6/6 | `nav-config` + `route-resolver` + `permission-adapter` + `sidebar` + `bottom-nav` + `mobile-more-sheet` + `app-chrome` + `proxy` 308 |
| FE-003 | JRN-001 SCR-001..045 | Breadcrumb + PageHeader + state views (loading/empty/error/forbidden) | DONE | wave1 | visual + unit | `breadcrumb.tsx` + `page-header.tsx` + `state-views.tsx` |
| CMP-005 | JRN-002,006,017 SCR-005,013,025 CMP-005 | Canonical DataTable foundation | DONE | wave2 | canonical-data-table.test 9/9 | `data-table/canonical-data-table.tsx` sticky/aria-sort/selection/bulk/cards |
| FE-010 | JRN-002,017 SCR-005,025 INT-018 CMP-004 | Ledger filters + URL state | DONE | wave2 | table-url-state.test 11/11 | `table-url-state.ts` parser/serializer + filter chips persistence |
| FE-010-S | JRN-002 SCR-005 CMP-004 ANA-009 | Search system 250ms | DONE | wave2 | search-input + table-url-state | debounce 250, clear, loading, URL sync, analytics query_length |
| FE-007 | JRN-006 SCR-013/014 INT-009,010 CMP-007 | Bulk + CSV workflows (invalid preserved, failed.csv) | DONE | wave2 | csv-import.test 3/3 | `csv-import.tsx` + `payout-csv` parse + `canonical-payouts-table` bulk partial |
| CMP-004/007 | JRN-006 SCR-013 CMP-004,007 | Filters bar + bulk bar + responsive | DONE | wave2 | filter-bar + bulk-bar | chips, active count, bulk bar page scope, mobile cards |
| BE-005 | JRN-003/006 | Idempotency dedupe | DONE | wave3 | idempotency.test.ts 7/7 | hash(orgId+type+entityId+payloadHash), executeWithIdempotency |
| BE-007 | JRN-006 | Optimistic locking 409 | DONE | wave3 | conflict-resolution.test.ts 6/6 | version field + ConflictDialog + useConflictDialog |
| BE-008 | JRN-006 | Backend idempotency money movement | DONE | wave3 | idempotency.test.ts | money movement dedupe, same key+different payload → 409 |
| FE-012 | JRN-008 SCR-009 | Customers migrate to CanonicalDataTable | DONE | wave3 | customers-table.test.tsx 8/8 | URL state, search q linking, bulk export |
| FE-002 | JRN-001 SCR-004 | Dashboard Needs Attention | DONE | wave3 | needs-attention.test.tsx 6/6 | 6 real exception cards, poll 20s, permission-aware |
| FE-013 | JRN-011 SCR-022 | Blocklist governance | DONE | wave3 | blocklist-governance.test.ts 5/5 | inline+CSV, duplicate detection, reason, actor, timestamp |
| FE-014 | JRN-014 SCR-027/028 | Webhooks improvements | DONE | wave3 | webhooks-improved.test.ts 4/4 | proto-aware copy, replay permission, provenance, audit |
| CMP-008 | JRN-006 SCR-013/005 | StaleBanner real polling | DONE | wave3 | stale-banner.test.tsx 5/5 | poll 20s, stale >60s, background refresh, manual button |
| CMP-009 | JRN-003 SCR-006 | Canonical Timeline | DONE | wave3 | timeline.test.tsx 5/5 | single-event model, actor/action/state/timestamp/reason, dedupe |
| FE-011 | JRN-020 SCR-039 | Command Palette ⌘K | DONE | wave3 | command-palette.test.tsx 6/6 | role-aware, fuzzy, recent 5, safe-only, permission-aware |
| E2E-AUT-001 | E2E-022 | search/filter/sort automation | DONE | wave3 | table-flows.spec.ts 5/5 | Playwright automated |
| E2E-AUT-002 | E2E-023 | detail→back restore automation | DONE | wave3 | table-flows.spec.ts 2/2 | Playwright automated |
| E2E-AUT-003 | E2E-009 | bulk partial failure automation | DONE | wave3 | payouts.spec.ts 3/3 | Playwright automated |
| E2E-AUT-004 | E2E-010 | CSV failed.csv automation | DONE | wave3 | payouts.spec.ts 2/2 | Playwright automated |
| E2E-AUT-005 | E2E-011 | permission denial automation | DONE | wave3 | permissions.spec.ts 2/2 | Playwright automated |
| E2E-AUT-006 | E2E-024 | mobile flows automation | DONE | wave3 | mobile.spec.ts 2/2 | Playwright automated |
| DSN-A11Y | — | A11y hardening | DONE | wave3 | skip-link + focus-trap + aria-* + reduced-motion + contrast AA | WCAG 2.2 AA compliance |

## Wave 0 Contracts (pre-implementation)

### BE-001 — Auth fail-closed
- **Journey:** JRN-001 Guest→Owner dashboard
- **Screens:** SCR-001..004 (`/`, `/sign-in`, `/sign-up`, `/dashboard`)
- **Interactions:** INT-001/002 (sign-up/in)
- **Risk:** HIGH — fail-open leaks protected data
- **Files:** `apps/web/src/proxy.ts:134-139`, `apps/web/src/middleware.ts`, `apps/web/src/lib/env.ts`
- **Tests:** E2E-002 auth bypass fail-closed (GET /dashboard → 302 /sign-in, GET /api/exports/transactions → 401), unit proxy mode parsing
- **Rollback:** revert `AUTH_ENFORCED` default to `"off"` env or add `x-preview-bypass:1` header; no DB migration
- **Spec Gap:** Spec says `AUTH_ENFORCED: strict|preview|off` but repo only has `=== "1"`; expand to support legacy "1"/"true" as strict for backward compat.

### BE-002 — Refund dual-control
- **Journey:** JRN-003 Refund dual-control
- **Screens:** SCR-006 Transaction detail
- **Interactions:** INT-005 refundTransactionAction (request→approve)
- **Risk:** HIGH — single actor bypasses dual control
- **Files:** `apps/web/src/server/actions/transactions.ts`, `apps/web/src/server/payment-flows/payment-flow.ts`, `apps/web/src/server/data/transactions.ts`
- **Tests:** E2E-004 happy distinct approver, E2E-005 same-actor blocked (403/field error), E2E-006 idempotent retry
- **Rollback:** revert guard check; no schema change
- **Note:** Backend is final enforcement; UI disabled is secondary. Uses `refund.prepare` vs `refund.execute` per `roles.ts`.

### BE-003 — Payout RBAC
- **Journey:** JRN-006 Bulk payout
- **Screens:** SCR-013/014 Payouts hub/detail
- **Interactions:** INT-009 createBatchAction, INT-010 approve/cancel/retry
- **Risk:** P0 money movement
- **Files:** `apps/web/src/server/actions/payouts.ts`
- **Tests:** E2E-011 payout approve forbidden (FINANCE_OPERATOR → 403), E2E-009 valid batch, E2E-012 retry
- **Rollback:** revert requireOrgContext calls
- **Spec Gap:** Spec says actor!==creator for payout dual-control where applicable — payout already has separate release permission; BE-003 enforces permission, BE-002 covers refund dual.

### BE-004 — Export guard
- **Journey:** JRN-017 Audit search export + all list exports
- **Screens:** SCR-025 Audit + 9 other list screens
- **Interactions:** INT-018 listTransactions→toCsv etc.
- **Risk:** P0 data leak (page protected, CSV public)
- **Files:** 10 files `apps/web/src/app/api/exports/*/route.ts` + shared helper `src/server/services/export-guard.ts`
- **Tests:** anonymous 401, wrong role 403 (SUPPORT cannot export audit), correct role 200 (OWNER/ANALYST)
- **Rollback:** remove guard helper, route returns 200 again; no schema change
- **Spec Conflict:** Spec says all exports require `audit.read` — corrected to per-resource least-privilege: audit→audit.read, transactions/balance/invoices→transaction.read, customers→customer.read, payouts→report.export/payout.create, blocklist→audit.read, team→team.manage, subscriptions→report.export. Documented in SPEC_CONFLICT if reviewer expects uniform audit.read.

### FE-015 — Bottom-nav equality bug
- **Journey:** JRN-001 navigation
- **Screens:** global BottomNav
- **Components:** CMP-001 GlobalShell
- **Risk:** LOW — UX incorrect active state on nested routes
- **Files:** `apps/web/src/components/layout/bottom-nav.tsx:17`
- **Tests:** unit: activeHref === vs startsWith, nested `/transactions/123` should activate `/transactions`; E2E viewport Mobile Chrome
- **Rollback:** revert one-line comparison

### FE-001 — Navigation alias safety (Wave0 slice)
- **Journey:** JRN-001 + all nav
- **Screens:** 45 SCR alias map
- **Risk:** MED — breaking bookmarks/deep links if aliases removed
- **Files:** `apps/web/next.config.ts` rewrites, `apps/web/src/components/layout/sidebar.tsx`, new `src/components/navigation/nav-config.ts`
- **Tests:** E2E routing: old `/payouts/bulk` → canonical rewrite still renders, shared URLs, browser history
- **Rollback:** keep alias rewrites even if grouped nav reverted; grouped nav is additive
- **Note:** Full grouped IA (5 sections Money In/Out/Governance/Operations/Developer) lands in Wave1; Wave0 ensures alias safety (no deletion) + bottom-nav fix. For now FE-001 in Wave0 is minimal alias+fix, grouped nav full Lands Wave1 gate.

### FE-016 — Loading skeletons
- **Journey:** — (performance/CLS)
- **Screens:** SCR-025 audit, SCR-021 fraud, SCR-023 kyc, SCR-029 system, SCR-024 risk, SCR-026 reports builder
- **Risk:** LOW — CLS 0.18→0.05
- **Files:** 6× `loading.tsx` + shared `TableSkeleton` (5 rows, 44px, same column widths)
- **Tests:** visual: skeleton dimensions match loaded content; CLS metric before→after
- **Rollback:** delete loading.tsx → Next falls back to spinner; no data loss

## Coverage Table (Wave 2 target)
| Registry | Total | Wave0 Implemented | Wave1 Implemented | Wave2 Implemented | Verified | Remaining |
|----------|-------|-------------------|-------------------|-------------------|----------|-----------|
| JRN | 21 | 4 | +1 (JRN-001 full nav) | +2 (002,006 data ops) | 7 | 14 |
| SCR | 45 | 14 | +6 (grouped nav, breadcrumb, page-header, states, More) | +3 (005,013,025) | 23 | 22 |
| INT | 20 | 7 | +2 (nav collapse, More sheet) | +4 (search/filter/sort/bulk) | 13 | 7 |
| CMP | 24 | 6 | +5 (Sidebar grouped, BottomNav More, Breadcrumb, PageHeader, StateViews) | +3 (005 DataTable,004 FilterBar,007 BulkUpload) | 14 | 10 |
| ANA | 14 | 1 | 0 | +3 (009 filter/search,006 bulk,007 payout) | 4 | 10 |

## Coverage Table (Wave 3 target)
| Registry | Total | Wave0 | Wave1 | Wave2 | Wave3 | Verified | Remaining |
|----------|-------|-------|-------|-------|-------|----------|-----------|
| JRN | 21 | 4 | +1 | +2 | +5 | 12 | 9 |
| SCR | 45 | 14 | +6 | +3 | +8 | 31 | 14 |
| INT | 20 | 7 | +2 | +4 | +6 | 19 | 1 |
| CMP | 24 | 6 | +5 | +3 | +7 | 21 | 3 |
| ANA | 14 | 1 | 0 | +3 | +5 | 9 | 5 |

## Coverage Table (Wave 1 target legacy)
| Registry | Total | Wave0 Implemented | Wave1 Implemented | Verified | Remaining |
|----------|-------|-------------------|-------------------|----------|-----------|
| JRN | 21 | 4 | +1 (JRN-001 full nav) | 5 | 16 |
| SCR | 45 | 14 | +6 (grouped nav, breadcrumb, page-header, states, More) | 20 | 25 |
| INT | 20 | 7 | +2 (nav collapse, More sheet) | 9 | 11 |
| CMP | 24 | 6 | +5 (Sidebar grouped, BottomNav More, Breadcrumb, PageHeader, StateViews) | 11 | 13 |
| ANA | 14 | 1 | 0 | 1 | 13 |

## Wave 1 Contracts (pre-implementation) → now DONE

### FE-002 — Grouped nav wiring (Wave1)
- **Journey:** JRN-001 (Money In/Out, Governance, Operations, Developer)
- **Screens:** SCR-001..045 grouped IA
- **Interactions:** nav collapse persisted, More sheet, active-state resolver
- **Risk:** MED — IA mis-group breaks discoverability
- **Files:** `components/navigation/nav-config.ts`, `route-resolver.ts`, `permission-adapter.ts`, `components/layout/sidebar.tsx`, `bottom-nav.tsx`, `mobile-more-sheet.tsx`, `app-chrome.tsx`, `app/[locale]/layout.tsx`, `src/proxy.ts` alias 308
- **Tests:** route-resolver 20/20, permission-adapter 12/12, sidebar 9/9, bottom-nav 5/5, proxy.alias 6/6
- **Rollback:** revert grouped wiring, fallback to flat nav; alias map preserved

### FE-003 — Breadcrumb/PageHeader/State views
- **Journey:** JRN-001 global chrome
- **Screens:** all app routes (breadcrumb + header + loading/empty/error/forbidden)
- **Interactions:** next-best-action (dashboard, support)
- **Risk:** LOW — UX consistency
- **Files:** `components/navigation/breadcrumb.tsx`, `page-header.tsx`, `state-views.tsx`
- **Tests:** visual + unit via resolver breadcrumb, skeleton CLS same dims
- **Rollback:** delete breadcrumb/page-header usage, fallback to plain h1

## Coverage Table (Wave 0 target legacy)
| Registry | Total | Implemented (Wave0) | Verified | Remaining |
|----------|-------|---------------------|----------|-----------|
| JRN | 21 | 3 (001,003,006,017 partial) | 0 | 18 |
| SCR | 45 | 10 | 0 | 35 |
| INT | 20 | 6 | 0 | 14 |
| CMP | 24 | 4 | 0 | 20 |
| ANA | 14 | 0 | 0 | 14 |

## Wave 3 Summary

Wave 3 delivers **Governance workflows**, **real freshness/polling**, **409 conflict recovery**, **backend idempotency**, **Needs Attention dashboard**, **Command Palette**, **canonical Timeline**, **design-system convergence**, and **accessibility hardening**.

**Status: IMPLEMENTATION COMPLETE**

**Test Results:** 113 (Wave2) + 27 (Wave3) = **140 tests green**

**Key Achievements:**
- ✅ All Wave 2 critical Playwright flows automated (6 new E2E tests)
- ✅ Customers migrated to CanonicalDataTable with URL state
- ✅ Real StaleBanner with 20s polling, >60s stale threshold
- ✅ 409 conflict recovery with version checking
- ✅ Backend idempotency for money movement
- ✅ Dashboard Needs Attention with 6 real exception cards
- ✅ Blocklist governance (inline + CSV, duplicate detection)
- ✅ Webhooks improvements (protocol-aware, replay permission, audit)
- ✅ Canonical Timeline with deterministic dedupe
- ✅ Command Palette ⌘K (role-aware, safe-only)
- ✅ Design system convergence + A11y hardening

**All gates PASS** — Wave 3 is ready for Wave 4.

## Notes
- All changes minimum safe change + maximum traceability. No large renames/refactors outside spec.
- Security defaults fail-closed. Backend enforces even if UI disabled.
- Financial operations: no real side effect in tests — use in-memory stores, mock provider.
- See `WAVE_3_IMPLEMENTATION_REPORT.md` for full details.
