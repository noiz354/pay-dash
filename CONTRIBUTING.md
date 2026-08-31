# Contributing

How to contribute without breaking the prototype → production migration.

## Quick Start

- Prototype-only change: edit `screens/<platform>/<name>/code.html` + `screen.png`, then update `SCREENS.md` and `PROGRESS.md` (Screen Migration row).
- App change: `apps/web` must exist (see `docs/STACK.md`). Run `pnpm install --frozen-lockfile`, `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Branch & PR Rules

1. One PR = one `PROGRESS.md` milestone or one Screen Migration row. Reference ADR (`docs/adr/XXXX-...`).
2. No secrets in Client Components — `server-only` + DAL required (see `docs/ARCHITECTURE.md: Boundaries`).
3. Tokens: use exact names from `design-system/*/DESIGN.md` (`primary`, `data-mono`, `gutter`, etc.). Missing token → extend `DESIGN.md` first.
4. No `next lint` — use `eslint .` (Next 16 removed it).
5. Before pushing: `pnpm typecheck && pnpm lint && pnpm test` green; for `apps/web` also `pnpm build && pnpm test:e2e` on at least one smoke.

## ADRs

- Propose with `docs/adr/TEMPLATE.md` → Status `Proposed`.
- Accepted → code must follow it. To change, supersede (new ADR), don't re-litigate in code.
- `AGENTS.md` and `PROGRESS.md` are the enforcement points.

## Commit Format

`feat(scope): ...` / `fix(scope): ...` / `docs(scope): ...` with `Refs: ADR-XXXX` in body when applicable.
