# Implementation Progress — Kinetic Ledger UX Redesign
> Source: `IMPLEMENTATION_READY_UX_SPEC.md` (604 lines, 21 JRN × 45 SCR × 20 INT × 24 CMP × 14 ANA)
> Execution: Wave-based, traceable, tested, reversible. Wave 0 = Safety+Correctness Foundation.

## Wave Gates
- **Wave 0 Gate (P0):** auth fail-closed, financial guards, dual-control, export guard, navigation bug fixed, critical tests green
- **Wave 1 Gate:** grouped nav, permissions, core states, responsive nav
- **Wave 2 Gate:** canonical filter/search/bulk UX, URL state, DataTable stable
- **Wave 3 Gate:** tokens, canonical components, a11y, visual consistency
- **Wave 4 Gate:** command center, command palette, freshness, exception flows
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
| BE-005 | JRN-003/006 | Idempotency dedupe | BACKLOG | — | — | Phase 3 |
| BE-006 | JRN-015 | Invite 7d expiry | BACKLOG | — | — |  |
| BE-007 | JRN-006 | Optimistic locking 409 | BACKLOG | — | — | Phase 4 |

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

## Coverage Table (Wave 0 target)
| Registry | Total | Implemented (Wave0) | Verified | Remaining |
|----------|-------|---------------------|----------|-----------|
| JRN | 21 | 3 (001,003,006,017 partial) | 0 | 18 |
| SCR | 45 | 10 | 0 | 35 |
| INT | 20 | 6 | 0 | 14 |
| CMP | 24 | 4 | 0 | 20 |
| ANA | 14 | 0 | 0 | 14 |

## Notes
- All changes minimum safe change + maximum traceability. No large renames/refactors outside spec.
- Security defaults fail-closed. Backend enforces even if UI disabled.
- Financial operations: no real side effect in tests — use in-memory stores, mock provider.
