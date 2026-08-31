# Changelog

All notable changes. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: SemVer once `apps/web` ships (prototype is `0.x`).

## [Unreleased]

### Added
- `docs/adr/` with 5 accepted ADRs (0001 App Router, 0002 Tailwind+shadcn, 0003 Postgres+Prisma, 0004 Auth, 0005 Observability).
- `docs/STACK.md` (golden-path deps/commands) and `docs/ARCHITECTURE.md` (layout + boundaries).
- `docs/STORYBOOK.md`, `docs/SEARCH.md`, `docs/QUEUES.md` (previously deferred — now unskipped).
- `CONTRIBUTING.md`, `CHANGELOG.md`.
- `SCREENS.md` Migrated Route column; `PROGRESS.md` phased tracker (0 Scaffold → 6 Testing/CI).

### Changed
- `AGENTS.md` → compact structure + Docs + Tooling note (`codegraph init` for `apps/web`).
- `README.md` → Production Migration section.

## [0.1.0] - 2026-08-29

- Reorganized into `design-system/` and `screens/{mobile,desktop}`; added `README.md`, `AGENTS.md`, `PROGRESS.md`, `SCREENS.md` (14 mobile + 19 desktop prototypes).
