# ADR-0002: Tailwind CSS + shadcn/ui + Kinetic Tokens as CSS Variables

Date: 2026-08-30
Status: Accepted

## Context
Tokens are the source of truth: `design-system/kinetic_enterprise/DESIGN.md:3-50` and `design-system/kinetic_ledger/DESIGN.md:3-56` define `primary`, `surface-variant`, `headline-xl`/`data-mono`, `gutter`, etc. `AGENTS.md:15` forbids inventing tokens. Screens use `data-mono` right-aligned and `label-caps` sticky headers.

## Decision
We will use Tailwind (`@tailwindcss/postcss`, `postcss.config.mjs`, `@import "tailwindcss"` in `globals.css`) + `tailwind-merge`/`clsx`/`cva` + `shadcn/ui` on Radix primitives + `lucide-react`. Kinetic tokens become CSS variables mapped into `tailwind.config.ts` theme, preserving exact token names.

## Consequences
Positive: one styling system, accessible primitives, easy migration from `tailwind.config` CDN blocks in `code.html`. Negative: shadcn is copy-paste — upgrades are manual.

## Alternatives Considered
CSS Modules only — no utility speed. Style Dictionary — overhead until tokens need multi-platform export. Material Symbols CDN — keep only if brand requires; prefer `lucide-react` for prod.

## Verification
One mobile + one desktop screen renders pixel-identical: `data-mono` right-aligned, sticky `label-caps`, `#d97706` TEST MODE banner, no visual regression vs `screen.png`.
