# Implementation Plan: 27 screens → apps/web (AGENTS.md Compliant)

> Spec: `docs/spec/screens-27-migration.md:1` | Audit: `docs/audit/screens-migration-gap-2026-08-31.md:1` | Primitive: `docs/primitive-elements.md:1` | Screens: 27 ⬜ =21 unique (14+19 → 24 unique, 3 shipped).

## Overview
Migrate 21 unique routes (27 rows) `screens/mobile|desktop/code.html` → `apps/web/src/app/[locale]/*` via shadcn 94 primitives (never rewrite, `npx shadcn add`), keep `layout/*:6` as-is, preserve `globals.css:25` `--primary:#003fb1` + `label-caps sticky`/`data-mono right` + `TEST MODE #d97706`. Each PR flips 1 `PROGRESS.md:21` row + ADR cite.

## Architecture Decisions
- **Single responsive route** `lg:grid-cols-12` not dual files — `SCREENS.md:11+30` shared (AGENTS.md:9).
- **Tokens via CSS vars** not Tailwind config fork — `globals.css:25` `cn()` preserves.
- **shadcn 100+ via registry** `add -a` + `@diceui/@tailark` 32, CodeGraph 141 wal — existing `layout/*:6` kept, new wire `table/pagination/checkbox/badge/dialog/tabs/select/calendar/chart/avatar` (`primitive-elements:172`).
- **DAL server-only** `server/dal/*` + `lib/xendit.ts` + `proxy.ts` session check before team/risk.

## Task List

### Phase 0: Foundation (already done, checkpoint)

#### Task 0: Parse 33 — DONE
- Acceptance: `scripts/parse-screens.mjs:1` → `docs/screens-index.json:1` 33 entries ✅
- Verification: `node scripts/parse-screens.mjs && ls screens/*/code.html | wc -l` =33
- Dependencies: None | Scope: S | Files: `scripts/parse-screens.mjs`, `docs/*`

#### Task 1-2: Tokens + Layout — DONE
- Acceptance: `globals.css:25` `--warning` alias + 6 primitives `layout/*:6` ✅
- Verification: `pnpm build` + `codegraph 141 wal`
- Dependencies: Task 0 | Scope: M

#### Checkpoint: Foundation
- [x] `pnpm typecheck && pnpm build` + `codegraph sync` wal
- [x] `docs/screens-index.json` 33, `docs/primitive-elements.md` 94

### Phase 1: High-Value Core (vertical slices, sequential)

#### Task 3: Dashboard (DONE)
**Description:** Upgrade `dashboard/page.tsx:1` placeholder → MetricCard+DataTable `label-caps sticky`.
**Acceptance:**
- [ ] Metrics `grid sm:grid-cols-2 lg:grid-cols-12` + pill `TEST MODE`
- [ ] `data-mono` right, `label-caps` sticky
**Verification:**
- [ ] `pnpm build` route `ƒ /[locale]/dashboard`
- [ ] `codegraph explore "DashboardPage"`
**Dependencies:** Task 2
**Files:** `app/[locale]/dashboard/page.tsx`
**Scope:** S

#### Task 4: Transactions (DONE)
**Description:** 7-col DataTable `account, badge, pagination` via DAL.
**Acceptance:**
- [ ] 7 cols + toolbar + pagination `Page 1/2853`
- [ ] `thead label-caps sticky bg-surface-container-low`
**Verification:** `pnpm build` + Playwright nav
**Dependencies:** Task 3
**Files:** `transactions/page.tsx`, `server/dal/ledger.ts`
**Scope:** M

#### Task 5: Balance (DONE)
**Description:** IDR `headline-xl data-mono` + Auto-Withdrawal + `min-w-[600px]` table.
**Acceptance:** `IDR 1.005.870.599,00` right emerald, sticky header.
**Verification:** `pnpm build`
**Dependencies:** Task 4
**Files:** `balance/page.tsx`
**Scope:** S

### Phase 2: Batch 2 — 21 Unique Pending (M each, parallel safe after Phase 1)

#### Task 6: Customers `app/[locale]/customers/page.tsx`
**Description:** `customer_directory:257` 7-col `table` sticky + `data-mono` LTV right + `checkbox` row + `avatar` + `badge` status + `pagination` footer + search `input` + `dropdown-menu` more_horiz + `empty` zero-state.
**Acceptance:**
- [ ] `TableHead label-caps sticky top-0 bg-surface-container-low` + `TableCell data-mono text-right`
- [ ] `Checkbox` per row + `Avatar` + `Badge` Active/Past Due + `Pagination` Showing 1 to 5
**Verification:**
- [ ] `pnpm build` route exists, `grep -R @/components/ui/ src/app` shows `table,checkbox,avatar,badge,pagination`
- [ ] `codegraph explore "CustomersTable"` finds reusable
**Dependencies:** Task 5
**Files:** `customers/page.tsx` (new), uses `table, pagination, checkbox, avatar, avatar-group, badge/status, input, dropdown-menu, empty, breadcrumb`
**Scope:** M (3-5 files: page + maybe DAL `customer.ts`)

#### Task 7: Bulk Payouts `app/[locale]/payouts/bulk/page.tsx`
**Description:** `bulk_payouts_desktop:284` metrics `card/stat` + dashed `file-upload/dropzone` + `table` + `progress/circular-progress` + `stepper` + `selection-toolbar` + `dialog/sheet` create + `Payout.createPayout()` idempotent.
**Acceptance:**
- [ ] Dashed `border-2 border-dashed` upload + `FileUpload` + `Progress` + `Stepper`
- [ ] `Payout` wiring placeholder `isXenditConfigured()`
**Verification:** `pnpm build` + manual upload UI
**Dependencies:** Task 5 (parallel with 6)
**Files:** `payouts/bulk/page.tsx`, `components/ui/file-upload.tsx`, `progress, stepper` already installed
**Scope:** M

#### Task 8: Billing `app/[locale]/billing/page.tsx`
**Description:** `billing_invoices_desktop:254` `min-w-[800px]` table `label-caps sticky` + metric `Card` Next Invoice `data-mono` + `select/native-select` filters + `badge` Due/Paid + `tabs` Invoices vs Payments + `calendar` due date.
**Acceptance:**
- [ ] `Amount text-right data-mono` + `Status` pill + `picture_as_pdf` action + `Select` filters
**Verification:** `pnpm build`
**Dependencies:** Task 5 (parallel)
**Files:** `billing/page.tsx`, `table, card/stat, select, badge, tabs, calendar, empty`
**Scope:** M

#### Task 9: Audit `app/[locale]/audit/page.tsx`
**Description:** `detailed_audit_log_desktop:232` Main Tabs + Footer Tabs + `select`×4 + `calendar/time-picker` + `checkbox`×2 + `kbd ⌘K` + `data-mono` keys + `tabs` + pagination.
**Acceptance:**
- [ ] `Tabs` Main+Footer + 4 `Select` + `Calendar` + `Table` sticky
**Verification:** `pnpm build`
**Dependencies:** Tasks 6-8
**Files:** `audit/page.tsx`, `tabs, select, calendar, time-picker, checkbox, table, pagination, badge, kbd, breadcrumb`
**Scope:** M (3-5 files)

#### Task 10: Fraud + Blocklist `app/[locale]/fraud/page.tsx` + `fraud/blocklist/page.tsx`
**Description:** `fraud_prevention` blocklist table + search `command` + `badge` + `switch` + `dialog` + `pagination` (no SDK, Dashboard-only note).
**Acceptance:** `Input` search + `Switch` toggle + `AlertDialog` confirm
**Verification:** `pnpm build`
**Dependencies:** Task 9
**Files:** `fraud/page.tsx`, `fraud/blocklist/page.tsx` (2 routes, but 1 task vertical slice — both share fraud pattern)
**Scope:** M (but touches 2 route files + 5 ui)

#### Task 11: KYC `app/[locale]/kyc/page.tsx`
**Description:** `identity_verification_kyc` checklist + `file-upload` + `stepper` + `progress` + `accordion` + `input/textarea/field` + `badge`.
**Acceptance:** `Stepper` + `FileUpload` + `Accordion` docs
**Verification:** `pnpm build`
**Dependencies:** Task 10
**Files:** `kyc/page.tsx`, `file-upload, stepper, progress, accordion, input, textarea`
**Scope:** M

#### Task 12: Risk & Velocity `app/[locale]/risk/page.tsx`
**Description:** `risk_velocity_limits_desktop` `switch`, `slider`, `alert/banner`, `select`×3, `$ data-mono` inputs.
**Acceptance:** `Switch` + `Slider` + `Alert` amber + `Select`
**Verification:** `pnpm build`
**Dependencies:** Task 11
**Files:** `risk/page.tsx`, `switch, slider, alert, banner, select, input, card, accordion`
**Scope:** M

### Phase 3: Remaining 11 Unique (parallel batch)

#### Task 13: Team `app/[locale]/team/page.tsx`
**Description:** `team_permissions` member table `checkbox`×4 + `tabs` + `select` + `switch` + `avatar/avatar-group` + `badge/status` + pagination + `dialog/sheet` invite + `dropdown-menu`.
**Acceptance:** 4 `Checkbox` + `Tabs` + `Switch` + `Pagination`
**Verification:** `pnpm build`
**Dependencies:** Phase 2
**Files:** `team/page.tsx`, `table, avatar-group, checkbox, tabs, select, switch, badge, pagination, dialog, sheet, dropdown-menu`
**Scope:** M

#### Task 14: Subscriptions `app/[locale]/subscriptions/page.tsx`
**Description:** `subscription_management` Invoice recurring table + cards + `tabs` + `calendar` + `progress`.
**Acceptance:** `Table` + `Card` + `Tabs`
**Verification:** `pnpm build`
**Dependencies:** Phase 2
**Files:** `subscriptions/page.tsx` (shared mobile+desktop)
**Scope:** S

#### Task 15: Payment Links `app/[locale]/payments/links/page.tsx`
**Description:** `payment_links_invoices` links table + `qr-code` + `badge` + `input/copy` + `card`.
**Acceptance:** `QrCode` + `Table` + `Badge`
**Verification:** `pnpm build`
**Dependencies:** Phase 2
**Files:** `payments/links/page.tsx`, `qr-code, table, badge`
**Scope:** S

#### Task 16: Webhooks Logs `app/[locale]/webhooks/page.tsx`
**Description:** `webhook_logs` receive-only log table + `timeline` + `scroll-area` + `badge/status` delivered/failed + `empty`.
**Acceptance:** `Timeline` + `Table` + `Badge` status
**Verification:** `pnpm build`
**Dependencies:** Phase 2
**Files:** `webhooks/page.tsx`, `timeline, table, badge, scroll-area, empty`
**Scope:** S

#### Task 17: API Keys `app/[locale]/settings/api-keys/page.tsx`
**Description:** `api_key_management` key table `data-mono` `key_prod_...` + `input-otp/key-value` + `badge` + `dialog/alert-dialog` + `button-group` copy.
**Acceptance:** `Table` + `KeyValue` + `Badge`
**Verification:** `pnpm build`
**Dependencies:** Phase 2
**Files:** `settings/api-keys/page.tsx`, `table, key-value, badge, dialog, alert-dialog`
**Scope:** S

#### Task 18: Developer Settings `app/[locale]/settings/developer/page.tsx`
**Description:** `developer_settings` webhooks dashboard + `table` + `tabs` + `card` + `item` + `alert`.
**Acceptance:** `Tabs` + `Table`
**Verification:** `pnpm build`
**Dependencies:** Phase 2
**Files:** `settings/developer/page.tsx`
**Scope:** S

#### Task 19: Support `app/[locale]/support/page.tsx`
**Description:** `support_documentation_hub_desktop` static docs + `accordion` + `breadcrumb` + `navigation-menu` + `command` search.
**Acceptance:** `Accordion` + `Breadcrumb`
**Verification:** `pnpm build`
**Dependencies:** Phase 2
**Files:** `support/page.tsx`
**Scope:** S

#### Task 20: System Health `app/[locale]/system/page.tsx`
**Description:** `system_health_monitoring_desktop` health `chart/gauge/progress` + `timeline` + `card/stat` + `alert`.
**Acceptance:** `Chart` + `Gauge` + `Timeline`
**Verification:** `pnpm build`
**Dependencies:** Phase 2
**Files:** `system/page.tsx`, `chart, gauge, progress, timeline`
**Scope:** S

#### Task 21: Onboarding `app/[locale]/onboarding/page.tsx`
**Description:** `sub_merchant_onboarding_checklist_desktop` checklist `stepper` + `progress` + `checkbox` + `collapsible`.
**Acceptance:** `Stepper` + `Progress`
**Verification:** `pnpm build`
**Dependencies:** Phase 2
**Files:** `onboarding/page.tsx`
**Scope:** S

#### Task 22: Merchant Profile `app/[locale]/settings/merchant/page.tsx`
**Description:** `merchant_profile_settings_desktop` form `avatar` + `input/textarea` + `select` + `field` + `tabs`.
**Acceptance:** `Avatar` + `Field` + `Select`
**Verification:** `pnpm build`
**Dependencies:** Phase 2
**Files:** `settings/merchant/page.tsx`
**Scope:** S

#### Task 23: Notifications `app/[locale]/settings/notifications/page.tsx`
**Description:** `notification_preferences_desktop` `switch` + `checkbox` + `select` + `card` + `tabs` + `alert`.
**Acceptance:** `Switch` + `Checkbox`
**Verification:** `pnpm build`
**Dependencies:** Phase 2
**Files:** `settings/notifications/page.tsx`
**Scope:** S

### Checkpoint: Complete 27
- [ ] `PROGRESS.md:21` 27 `⬜` → `✅` (21 unique routes) 2026-09-xx + ADR 0001/0002 cite
- [ ] `ls -R apps/web/src/app/[locale]` shows 24 routes
- [ ] `pnpm typecheck && pnpm build` + `pnpm lint` (1 warning ok)
- [ ] `~/.npm-global/bin/codegraph sync` wal 141→~170 files, `grep -R @/components/ui/ src/app` 4→~30
- [ ] `data-mono text-right` + `label-caps sticky top-0 bg-surface-container-low` + `TEST MODE #d97706` on all routes
- [ ] `layout/*:6` untouched, `ui/*:94` wired, `docs/primitive-elements.md` preserved, review with human

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| 75 unused → not wired, hand-rolled `data-table` stays | High | Task 6-8 wire `table/pagination/checkbox/badge` first; `codegraph explore` before grep |
| `BigDecimal`→`Decimal` drift (like `prisma:40`) | Med | `find-docs` verify Prisma docs before schema change |
| `w-sidebar-width 260px` vs `md:ml-[260px]` hack divergence | Med | Test `max-w-container-max 1440px` both |
| `warning` alias missing outside `dashboard_home:64` | Low | Task 1 already `globals.css:25` `--warning` alias |
| 27-file big bang | High | Vertical slicing, 1 PR =1 row `PROGRESS.md:17`, parallel only Phase 3 |

## Parallelization Opportunities
- Safe parallel: Tasks 6-8 (different routes), Tasks 13-23 (11 routes) after Phase 2 checkpoint
- Must sequential: Task 0→1→2→3→4→5 (deps), `prisma migrate` before DAL, `table` contract before parallel routes
- Needs coordination: Shared `data-table` contract (Task 2) before parallel

## Open Questions
1. Single responsive `lg:grid-cols-12` vs keep dual files? Spec assumes single.
2. Priority after Phase 2a customers/bulk/billing — audit/kyc/risk or team/webhooks? Plan assumes Phase 2b audit→fraud→kyc→risk then Phase 3.
3. TEST MODE full banner vs inline pill — spec assumes both (`layout.tsx:18` banner + `top-bar` pill).
4. CodeGraph include `screens/*.html` via `docs/screens-index.json` hybrid or keep `apps/web` only? Plan keeps out.
5. Auth choice for `team` — Better Auth (current `lib/auth.ts:1`) vs Clerk (`adr/0004`) — which before Task 13 team?

## Verification (pre-implementation)
- [x] Every task has acceptance criteria (2-3 bullets)
- [x] Every task has verification step (`pnpm build` + `codegraph sync` + `grep`)
- [x] Dependencies ordered correctly (0→1→2→3→4→5→6-8→9→10→11→12→13-23)
- [x] No task touches >5 files (max M: 3-5 files, Task 10 touches 2 route files +5 ui but slice vertical)
- [x] Checkpoints after Foundation/Core/Complete
- [x] Human approved `docs/spec/screens-27-migration.md` (awaiting this plan approval)
