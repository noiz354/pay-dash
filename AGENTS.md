# AGENTS.md

## What this repo is
Monorepo for an enterprise payment-gateway dashboard: static UI prototypes (`screens/` — each `code.html` Tailwind CDN + inline `tailwind.config` + `screen.png`) + Next.js app `apps/web` (Kinetic Ledger, `pnpm@9.12.0`, `node>=20.9.0`). No CI/tests yet.

## Structure
- `design-system/kinetic_enterprise/DESIGN.md` — **Kinetic Enterprise** tokens (mobile)
- `design-system/kinetic_ledger/DESIGN.md` — **Kinetic Ledger** tokens (desktop)
- `screens/mobile/<name>/` — mobile-first, no suffix (14 screens)
- `screens/desktop/<name>_desktop/` — desktop-density, `_desktop` suffix (19 screens)
- `SCREENS.md` — screen manifest; `PROGRESS.md` — build status; `INTEGRATION.md` — `xendit-node@7.0.0` wiring when adding a `backend/`

Adding a screen: `screens/<platform>/<name>/code.html` + `screen.png` → register in `SCREENS.md` and `PROGRESS.md`.

## Design-system rules
- Use exact token names from the matching `DESIGN.md` (`primary`/`surface-variant`, `headline-xl`/`data-mono`, `gutter`/`stack-md`). Don't invent tokens — extend `DESIGN.md` first, then the screen's `tailwind.config`.
- Numerics/currency: `data-mono`, right-aligned. Table headers: `label-caps` sticky.
- Every screen has the persistent **TEST MODE** amber banner (`#d97706`) unless explicitly live-mode.

## Component rules (shadcn 100+ — primitives)
- All 100+ shadcn/ui components must be used going forward — official 60 (`ui.shadcn.com/docs/components`) + 40 community via `registry.directory` (82 registries, 2093 components). **Never rewrite** — install via `npx shadcn@latest add <name>` or `npx shadcn add @diceui/<name>` / `@tailark/<name>` / `https://registry.directory/...` (e.g. `npx shadcn add avatar-group banner file-upload stepper`).
- Existing custom components are **kept as-is** (do not delete): `apps/web/src/components/layout/*` (6 files: `test-mode-banner.tsx`, `sidebar.tsx`, `top-bar.tsx`, `bottom-nav.tsx`, `metric-card.tsx`, `data-table.tsx`) + `apps/web/src/components/ui/*` pre-shadcn (`button.tsx`, `card.tsx`, etc.). New routes must use shadcn primitives (`@/components/ui/*` 94 files).
- Current inventory: 94 `src/components/ui/*.tsx` (62 official `add -a` + 32 `@diceui/@tailark`), `codegraph` 141 files wal. Only 4/94 were used in `src/app` before (`button, card, input, label`) — see `docs/primitive-elements.md` audit. New migrations must wire the 75 unused (`table, pagination, checkbox, badge, dialog, tabs, select, calendar, chart, avatar`, etc.) per `SCREENS.md` pattern.
- Primitive audit is source of truth: `docs/primitive-elements.md` (94 files, usage, `layout/*` overlap, mapping to 27 `⬜` screens). Do not remove it.
- Tokens still via `globals.css:25` (`--primary:#003fb1`, `--warning:#d97706` alias `test-mode-amber`), `cn` + `label-caps` sticky / `data-mono` right preserved via `cn()` not fork.

## Screen conventions
Standalone `<!DOCTYPE html>` + Tailwind CDN `<script>` + inline `tailwind.config` + Material Symbols + Google Fonts (Inter, JetBrains Mono). Keep skeleton: sidebar (desktop) / bottom nav (mobile), top app bar, main content grid. No extra `<style>` beyond the Material Symbols / scrollbar setup already in existing screens.

## Commands
- Static screens: open `code.html` directly in a browser (no build).
- `apps/web`: `pnpm --filter web dev` / `build` / `typecheck` (`tsc --noEmit`) / `lint` (`eslint .`); root aliases `pnpm dev` / `build` / `typecheck` / `lint`.
- Install: `pnpm install` (requires `pnpm@9.12.0`, `node>=20.9.0`).

## Docs
- `README.md` → entry point; `docs/STACK.md` → exact deps/commands; `docs/ARCHITECTURE.md` → layout + server/client/DAL boundaries; `INTEGRATION.md` → Xendit recipes.
- `docs/STORYBOOK.md` → component docs; `docs/SEARCH.md` → Postgres FTS first; `docs/QUEUES.md` → webhook/queue ladder (no Redis until needed).
- `CONTRIBUTING.md` → branch/PR/ADR rules; `CHANGELOG.md` → release history (Keep a Changelog).
- `PROGRESS.md` is the build-status source — every PR touching `apps/web` must flip one Milestone or Screen Migration row and cite the ADR.
- ADRs live in `docs/adr/` (`TEMPLATE.md` = MADR-lite: Context/Decision/Consequences/Alternatives/Verification). Status: Proposed → Accepted → Superseded. Don't re-litigate an Accepted ADR in code — supersede it.
- Adding a screen: `screens/<platform>/<name>/code.html` + `screen.png` → register in `SCREENS.md` (with Migrated Route) and `PROGRESS.md`.

## Tooling note
CodeGraph is active (`.codegraph/` gitignored but indexed, 141 files wal, 94 `src/components/ui/*.tsx` via `npx shadcn add -a` + `@diceui/@tailark`). Installed via `npm i -g @colbymchenry/codegraph` at `~/.npm-global/bin/codegraph` (v1.6.0, `wsl -d ubuntu-surfsense`). From Windows/PowerShell use `wsl -d ubuntu-surfsense bash -c '~/.npm-global/bin/codegraph <cmd>'` (e.g. `status`, `files`, `explore "<query>"`, `sync`); inside WSL use `~/.npm-global/bin/codegraph <cmd>`. MCP wired via `~/.npm-global/bin/codegraph install --yes` (opencode + Copilot CLI). Always run `codegraph_explore` before grep when `.codegraph/` exists. Primitive audit: `docs/primitive-elements.md`.

## Environment — WSL
- Distro: ubuntu-surfsense (this project at /home/norman2/31-8-26-xendit-projects inside WSL).
- From Windows/PowerShell, prefix shell commands with: wsl -d ubuntu-surfsense bash -c "<cmd>" (e.g. wsl -d ubuntu-surfsense bash -c "ls -la")
- Inside WSL, use plain bash commands. Do not use //wsl.localhost path translation for shell - it fails with CreateProcessParseCommon.
- Unzip rule: wsl -d ubuntu-surfsense bash -c "cd /home/norman2/31-8-26-xendit-projects && unzip -o <file>.zip && rm <file>.zip"
