# AGENTS.md

## What this repo is
Static UI-prototype monorepo for an enterprise payment-gateway dashboard. No build, framework, or backend — each screen is a self-contained `code.html` (Tailwind CDN + inline `tailwind.config`) + `screen.png` preview. No `package.json`, lockfile, CI, or tests.

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

## Screen conventions
Standalone `<!DOCTYPE html>` + Tailwind CDN `<script>` + inline `tailwind.config` + Material Symbols + Google Fonts (Inter, JetBrains Mono). Keep skeleton: sidebar (desktop) / bottom nav (mobile), top app bar, main content grid. No extra `<style>` beyond the Material Symbols / scrollbar setup already in existing screens.

## Commands
None — open `code.html` directly in a browser. No install, build, lint, or test to run.

## Docs
- `README.md` → entry point; `docs/STACK.md` → exact deps/commands; `docs/ARCHITECTURE.md` → layout + server/client/DAL boundaries; `INTEGRATION.md` → Xendit recipes.
- `docs/STORYBOOK.md` → component docs; `docs/SEARCH.md` → Postgres FTS first; `docs/QUEUES.md` → webhook/queue ladder (no Redis until needed).
- `CONTRIBUTING.md` → branch/PR/ADR rules; `CHANGELOG.md` → release history (Keep a Changelog).
- `PROGRESS.md` is the build-status source — every PR touching `apps/web` must flip one Milestone or Screen Migration row and cite the ADR.
- ADRs live in `docs/adr/` (`TEMPLATE.md` = MADR-lite: Context/Decision/Consequences/Alternatives/Verification). Status: Proposed → Accepted → Superseded. Don't re-litigate an Accepted ADR in code — supersede it.
- Adding a screen: `screens/<platform>/<name>/code.html` + `screen.png` → register in `SCREENS.md` (with Migrated Route) and `PROGRESS.md`.

## Tooling note
CodeGraph is deferred (`.codegraph/` gitignored, no index). If you add `backend/` or `apps/web`, run `codegraph init --yes` then use `codegraph_explore` before grep.

## Environment — WSL
- Distro: ubuntu-surfsense (this project at /home/norman2/31-8-26-xendit-projects inside WSL).
- From Windows/PowerShell, prefix shell commands with: wsl -d ubuntu-surfsense bash -c "<cmd>" (e.g. wsl -d ubuntu-surfsense bash -c "ls -la")
- Inside WSL, use plain bash commands. Do not use //wsl.localhost path translation for shell - it fails with CreateProcessParseCommon.
- Unzip rule: wsl -d ubuntu-surfsense bash -c "cd /home/norman2/31-8-26-xendit-projects && unzip -o <file>.zip && rm <file>.zip"
