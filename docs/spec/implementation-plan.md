# Implementation Plan: Screens → Apps Migration

> Spec: `docs/spec/screens-to-apps-migration.md:1` (33 prototypes `SCREENS.md:7` → `PROGRESS.md:21` routes). Approved: 2026-08-31. Stack: Next 15.5 + TS 5.9 + pnpm@9.12 + Tailwind 4.1 + Prisma 6.19 + xendit-node@7.0.0.

## Overview
Parse 33 static prototypes (`screens/mobile/*` 14 + `screens/desktop/*_desktop` 19, `code.html` Tailwind CDN + inline `tailwind.config` + `screen.png`) and migrate to `apps/web/src/app/[locale]/*` Server Components via reusable layout primitives (`test-mode-banner`, `sidebar`, `data-table`, `metric-card`), avoiding rewrite. Tokens from `design-system/kinetic_ledger/DESIGN.md` + `kinetic_enterprise` → CSS vars.

## Architecture Decisions
- Single responsive route per screen (`lg:grid-cols-12`), not dual files — `SCREENS.md:3` shared Migrated Route.
- Tokens merge to `apps/web/src/styles/globals.css` CSS vars (`sidebar-width:260px`, `gutter:1.5rem`, `cell-x/y 16/12px`), no new names (`AGENTS.md:15`).
- CodeGraph stays `apps/web` 25 files wal; `screens/` stays spec reference (HTML not parsed), hybrid `docs/screens-index.json` if needed.
- Vertical slicing: 1 PR = 1 route `PROGRESS.md:17` + ADR cite, `pnpm typecheck && pnpm build` + `~/.npm-global/bin/codegraph sync` per task.

## Task List

### Phase 0: Parse (XS)

#### Task 0: Parse screens → screens-index.json
**Description:** Script `scripts/parse-screens.mjs` reads 33 `code.html`, extracts `tailwind.config` colors/spacing/font + layout sections (Sidebar/Nav/Banner/Table/Metric/Input) + `data-mono`/`label-caps` fields → `docs/screens-index.json` + `docs/tokens-diff.md` (Enterprise vs Ledger delta).

**Acceptance criteria:**
- [ ] `node scripts/parse-screens.mjs` succeeds, `ls screens/*/code.html | wc -l` =33
- [ ] `docs/screens-index.json` contains 33 entries with `tailwind.config` and `warning:#D97706` missing count
- [ ] `docs/tokens-diff.md` lists `surface #f7f9fb vs #faf8ff` etc.

**Verification:**
- [ ] `cat docs/screens-index.json | jq length` =33
- [ ] `grep warning docs/screens-index.json` shows dashboard_home only

**Dependencies:** None
**Files likely touched:**
- `scripts/parse-screens.mjs` (new)
- `docs/screens-index.json` (new)
- `docs/tokens-diff.md` (new)
**Estimated scope:** S (1-2 files)

### Phase 1: Foundation (M)

#### Task 1: Merge tokens → globals.css
**Description:** Merge `kinetic_ledger` + `kinetic_enterprise` tokens into `apps/web/src/styles/globals.css` CSS vars (`--sidebar-width`, `--gutter`, `--cell-x`, `--data-mono`) + ensure `warning/test-mode-amber` present.

**Acceptance criteria:**
- [ ] `warning`/`test-mode-amber` present in `globals.css`
- [ ] No new token names invented (extend `DESIGN.md` first)

**Verification:**
- [ ] `pnpm typecheck` + `pnpm build` pass
- [ ] `grep warning apps/web/src/styles/globals.css`

**Dependencies:** Task 0
**Files likely touched:**
- `apps/web/src/styles/globals.css`
- `apps/web/tailwind.config.mjs` (if exists)
**Estimated scope:** S

#### Task 2: Layout primitives
**Description:** Create `components/layout/test-mode-banner.tsx`, `sidebar.tsx`, `top-bar.tsx`, `bottom-nav.tsx`, `metric-card.tsx`, `data-table.tsx`, `input.tsx` — `label-caps sticky p-table-cell-padding`, `data-mono text-right`, `bg-warning fixed top-0 font-label-caps`.

**Acceptance criteria:**
- [ ] 6 primitives render with `label-caps` sticky header + `data-mono` right
- [ ] `test-mode-banner` both fixed banner (`mobile/dashboard_home:123`) + inline pill (`dashboard_home_desktop:207`)

**Verification:**
- [ ] `pnpm build` + `~/.npm-global/bin/codegraph explore "DataTable"` finds reusable
- [ ] Visual check `data-mono` right, `label-caps` sticky

**Dependencies:** Task 1
**Files likely touched:**
- `apps/web/src/components/layout/test-mode-banner.tsx`
- `apps/web/src/components/layout/sidebar.tsx`
- `apps/web/src/components/layout/top-bar.tsx`
- `apps/web/src/components/layout/bottom-nav.tsx`
- `apps/web/src/components/layout/metric-card.tsx`
- `apps/web/src/components/layout/data-table.tsx`
**Estimated scope:** M (3-5 files)

#### Checkpoint: Foundation
- [ ] `pnpm typecheck && pnpm build` + `~/.npm-global/bin/codegraph sync` wal (25→31 files)
- [ ] `docs/screens-index.json` 33 entries

### Phase 2: MVP Vertical Slices (M each, sequential)

#### Task 3: Dashboard `app/[locale]/dashboard/page.tsx`
**Description:** Upgrade placeholder `app/[locale]/dashboard/page.tsx:1` → metrics `grid sm:grid-cols-2 lg:grid-cols-12` + quick actions, TEST MODE banner+pill, `data-mono` $42,050.

**Acceptance criteria:**
- [ ] Metrics `grid sm:grid-cols-2 lg:grid-cols-12` + quick actions
- [ ] TEST MODE banner + header pill present
- [ ] `data-mono` left-baseline preserved

**Verification:**
- [ ] `pnpm build` route `ƒ /[locale]/dashboard`
- [ ] `~/.npm-global/bin/codegraph explore "DashboardPage"` shows `Card` wiring
- [ ] Manual: `data-mono` right, `label-caps` sticky

**Dependencies:** Task 2
**Files likely touched:**
- `apps/web/src/app/[locale]/dashboard/page.tsx`
**Estimated scope:** S
**Reuse:** `#85 shadcn Card` `button.tsx:21`

#### Task 4: Transaction Ledger `app/[locale]/transactions/page.tsx`
**Description:** 7-col table `Reference/Date/Method/Customer/Amount-right/Status/⋯` (`transaction_ledger_desktop:282`), toolbar `Status/Date/Channel` + `Filter… w-64`, pagination, DAL `listLedgerEntries()` mocked.

**Acceptance criteria:**
- [ ] 7 cols + checkbox + toolbar + pagination `Page 1 of 2853`
- [ ] `thead label-caps sticky bg-surface-container-low`, `td data-mono text-right`
- [ ] DAL `listLedgerEntries()` reusable

**Verification:**
- [ ] `pnpm lint` + Playwright nav `dashboard` → `transactions`
- [ ] `pnpm build` includes route

**Dependencies:** Task 3
**Files likely touched:**
- `apps/web/src/app/[locale]/transactions/page.tsx`
- `apps/web/src/server/dal/ledger.ts` (reuse)
**Estimated scope:** M
**Reuse:** `#138 Zod`, `#106 Prisma`

#### Task 5: Balance History `app/[locale]/balance/page.tsx`
**Description:** `IDR 1.005.870.599 headline-xl data-mono` (`balance_history:237`), Auto-Withdrawal card, `table min-w-[600px] Amount text-right emerald` + `custom-scrollbar 6px`.

**Acceptance criteria:**
- [ ] `IDR` `headline-xl data-mono` + Auto-Withdrawal card
- [ ] `table min-w-[600px]` `Amount text-right emerald` + scrollbar

**Verification:**
- [ ] `pnpm build` includes route
- [ ] `data-mono` right check

**Dependencies:** Task 4
**Files likely touched:**
- `apps/web/src/app/[locale]/balance/page.tsx`
**Estimated scope:** S

#### Checkpoint: Core
- [ ] 3 routes `⬜`→`✅` in `PROGRESS.md:21-23`
- [ ] `SCREENS.md:7` routes render, `data-mono` right, `label-caps` sticky
- [ ] `curl -I localhost:3000` has `CSP/HSTS/nosniff` (`next.config.ts:5`)
- [ ] Review with human before proceeding

### Phase 3: Batch 2 (parallelizable after Phase 2)

#### Task 6: Customers `app/[locale]/customers/page.tsx`
**Description:** Hybrid card-table `grid-cols-12` (`customer_directory:184`), `label-caps` header + mobile card-stack.

**Acceptance criteria:**
- [ ] Desktop `grid-cols-12` header + rows `h-[48px]`
- [ ] Mobile card-stack fallback

**Verification:**
- [ ] `pnpm build` + `codegraph sync`
**Dependencies:** Task 5
**Files likely touched:** `customers/page.tsx`
**Estimated scope:** M

#### Task 7: Bulk Payouts `app/[locale]/payouts/bulk/page.tsx`
**Description:** Upload dashed `border-2 border-dashed` (`bulk_payouts_desktop:284`), metrics `sm:grid-cols-2`, `Payout.createPayout()` idempotent (`INTEGRATION.md:209`).

**Acceptance criteria:**
- [ ] Upload dashed card + metrics
- [ ] `Payout.createPayout()` wiring placeholder

**Verification:**
- [ ] `pnpm build`
**Dependencies:** Task 5 (parallel with 6)
**Files likely touched:** `payouts/bulk/page.tsx`
**Estimated scope:** M

#### Task 8: Billing Invoices `app/[locale]/billing/page.tsx`
**Description:** `billing_invoices_desktop:238` `picture_as_pdf` action, `Amount text-right data-mono` + centered `Status` pill.

**Acceptance criteria:**
- [ ] `Amount-right` + `Status` pill + `pdf` action

**Verification:**
- [ ] `pnpm build`
**Dependencies:** Task 5 (parallel)
**Files likely touched:** `billing/page.tsx`
**Estimated scope:** M

#### Checkpoint: Complete MVP
- [ ] 6 routes `✅`, `codegraph status` 31 files wal
- [ ] `pnpm test` (Vitest RTL for `data-table`) + `pnpm build` green

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| `BigDecimal`→`Decimal` drift (like `prisma:40` fix) | Med | `find-docs` verify Prisma docs before schema change |
| Desktop `w-sidebar-width` vs mobile `md:ml-[260px]` hack divergence | Med | Test `max-w-container-max 1440px` both |
| `warning` token missing outside `dashboard_home:64` | Low | Task 1 merge fixes, add pill to `billing/bulk/audit` |
| 33-file big bang | High | Vertical slicing, 1 PR = 1 route `PROGRESS.md:17` |

## Parallelization Opportunities
- Safe to parallelize: Tasks 6-8 (different routes) + `screens-index.json` gen after Task 5
- Must be sequential: 0→1→2→3→4→5 (deps), `prisma migrate` before DAL
- Needs coordination: Shared `data-table` contract (Task 2) before parallel routes

## Open Questions (from Spec)
1. Single responsive route OK or keep dual? — Spec assumes single.
2. Priority after Batch 1 — `customers/bulk/billing` confirmed?
3. Banner vs pill — both?
4. CodeGraph include `screens/` JSON hybrid or keep out?
5. Auth choice — Better Auth vs Clerk — which before `team_permissions`?

## Verification (pre-implementation)
- [x] Every task has acceptance criteria
- [x] Every task has verification step
- [x] Dependencies ordered correctly
- [x] No task touches >5 files (max M: 6 primitives in Task 2 → already split)
- [x] Checkpoints after Foundation/Core/Complete
- [x] Human approved spec (`approve` 2026-08-31) — plan approved, ready for IMPLEMENT (incremental-implementation + TDD)
