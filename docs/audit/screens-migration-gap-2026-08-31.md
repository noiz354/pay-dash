# Audit: screens/code.html → apps/web Migration Gap — 2026-08-31

> **AGENTS.md compliance check** — 33 `screens/mobile/*` 14 + `screens/desktop/*_desktop` 19 = 33 `code.html` vs `apps/web` routes. Build Mode active.

## Summary

| Metric | Count | Status |
|---|---|---|
| `SCREENS.md:9-48` prototypes | 33 (14 mobile + 19 desktop) | 33/33 `code.html` + `screen.png` exist |
| Unique `app/[locale]/*` routes (`SCREENS.md` dedup) | 24 |  |
| `PROGRESS.md:21` Screen Migration | 6 ✅ / 27 ⬜ (82% pending) | 3 unique routes shipped |
| `apps/web/src/app/[locale]/*` on disk | 3 routes | `dashboard`, `balance`, `transactions` only |
| `src/components/ui/*.tsx` inventory | 94 files (62 official `add -a` + 32 `@diceui/@tailark`), `codegraph` 141 files wal |  |
| Business usage `src/app` | 4/94 (`button,card,input,label`) | `docs/primitive-elements.md:114` |
| Internal `ui→ui` imports | 19/94 | `button:22`, `direction:12` |
| Unused primitives | 75/94 (80%) | Reserved for 27 ⬜ |

**Conclusion:** Manifest complete, migration **18% shipped (6/33 rows, 3/24 routes)**. 27 ⬜ / 21 unique routes missing on disk, blocked on `AGENTS.md:20` shadcn wire-up.

---

## 1) SCREENS.md Manifest — 33 Prototypes ✅

- `SCREENS.md:9-24` 14 mobile `screens/mobile/<name>/code.html` no suffix
- `SCREENS.md:30-48` 19 desktop `screens/desktop/<name>_desktop/code.html` `_desktop` suffix
- Verified `ls screens/mobile/*/code.html` → 14, `ls screens/desktop/*/code.html` → 19, each `screen.png`.
- `PROGRESS.md:61-62` baseline 14/14 + 19/19 shipped.
- Deduplication: 33 prototypes → 24 unique routes (9 pairs share, e.g. `SCREENS.md:11+30` both `dashboard/page.tsx`).

## 2) PROGRESS.md Screen Migration — 6 ✅ / 27 ⬜

**✅ 6 rows (3 unique):**
- `PROGRESS.md:23` `Home Overview` mobile `dashboard` + `37` `Dashboard Home` desktop → same route ✅ 2026-08-31
- `PROGRESS.md:25` `Balance History` + `38` `Balance & History` → same ✅
- `PROGRESS.md:35` `Transaction Ledger` + `55` desktop → same ✅

**⬜ 27 rows (21 unique pending):**
`24 settings/api-keys`, `26 reports/builder` (shared `41`), `27 customers` (shared `42`), `28 settings/developer` (shared `44`), `29 fraud/blocklist`, `30 kyc` (shared `46`), `31 payments/links`, `32 payouts/settings`, `33 subscriptions` (shared `51`), `34 team` (shared `54`), `36 webhooks`, `39 billing`, `40 payouts/bulk`, `43 audit`, `45 fraud`, `47 settings/merchant`, `48 settings/notifications`, `49 risk`, `50 onboarding`, `52 support`, `53 system`

## 3) apps/web/src/app/[locale]/* — Only 3/24 Exist

- **Exists:** `apps/web/src/app/[locale]/dashboard/page.tsx`, `balance/page.tsx`, `transactions/page.tsx` (+ `layout.tsx` passthrough, `app/layout.tsx:18` `<TestModeBanner/>`).
- **Missing 21 unique:** `billing`, `payouts/bulk`, `customers`, `audit`, `fraud`, `fraud/blocklist`, `kyc`, `settings/merchant`, `settings/notifications`, `settings/developer`, `settings/api-keys`, `risk`, `onboarding`, `support`, `system`, `subscriptions`, `payments/links`, `webhooks`, `payouts/settings`, `team`, `reports/builder` — matches 27 ⬜.
- Verified `ls -R apps/web/src/app/[locale]` → only `balance,dashboard,transactions,sign-in,sign-up`.

## 4) AGENTS.md:20 Component Rules — shadcn 100+ Must Be Used / Existing Kept

- **Kept As-Is ✅:** `apps/web/src/components/layout/*` 6 files (`test-mode-banner.tsx:1`, `sidebar.tsx`, `top-bar.tsx`, `bottom-nav.tsx`, `metric-card.tsx:1`, `data-table.tsx:1`) — correct per `AGENTS.md:22`. `docs/primitive-elements.md:3` same.
- **Inventory:** `AGENTS.md:21` requires 100+ (60 official +40 community). Actual `src/components/ui/*.tsx` = **94 files** (62 official +32 `@diceui/@tailark`) — 6 short, `codegraph 141 wal` per `AGENTS.md:23`.
- **Usage Non-Compliance:**
  - `docs/primitive-elements.md:114` Only 4/94 Used — `card` (`balance:1`), `button` (`app/page:3`), `input/label` (`sign-in:6-7`).
  - `dashboard:1-2` uses `MetricCard`+`DataTable` (layout) not `ui/table, ui/stat, ui/chart`.
  - `transactions:2` uses `DataTable`+ hand-rolled `<table>` + raw checkbox/pagination instead of `table.tsx:85`, `checkbox:20`, `pagination:57`, `badge:10` — violates `AGENTS.md:22` *New routes must use shadcn primitives*.
  - `docs/primitive-elements.md:172-195` maps 27 ⬜ → needed primitives, e.g. `customers` needs `table+pagination+checkbox+avatar+badge`.

## 5) AGENTS.md:15 Design-System Rules — data-mono right / label-caps sticky / TEST MODE

- **Tokens:** `apps/web/src/app/globals.css:25` `--primary:#003fb1`, `61-62` `--test-mode-amber:#d97706` alias `--warning`, classes `globals.css:247` `.data-mono` + `248` `.label-caps`.
- **Migrated Preserve:** `balance:25` `data-mono headline-xl` + `61-62` `text-right`, `47` `label-caps` + `data-table:20` `sticky top-0`, `dashboard:19` `label-caps` sticky, `transactions:59` `label-caps`, `78,82` `TableCellMono text-right`.
- **TEST MODE Banner ✅:** `app/layout.tsx:20` `<TestModeBanner/>` → `test-mode-banner:14` `sticky top-0 h-7 bg-[var(--test-mode-amber)] label-caps` + pill variant `5` (`AGENTS.md:18` requires every screen unless live-mode). Pending 21 routes not verifiable but prototypes already contain banner per `AGENTS.md:28`.

## 6) AGENTS.md:39 Docs — PROGRESS.md Must Flip 1 Row Per PR + ADR Cite

- 6 flip done `✅ 2026-08-31`, 27 pending. `docs/adr/0001-0005` Accepted (Next.js, Tailwind+shadcn, Postgres+Prisma, Auth, Observability). Do not re-litigate — supersede.

## Next Plan (for spec-driven-development)

See `docs/spec/screens-27-migration.md` — vertical slices, 1 PR = 1 row, `pnpm typecheck && pnpm build` + `~/.npm-global/bin/codegraph sync` per task, `registry.directory` never rewrite, `cn()` preserve `label-caps`/`data-mono`.

*Generated 2026-08-31 via `codegraph` + `grep -R @/components/ui/` + `ls -R`.*
