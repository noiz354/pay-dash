# ADR-0001: Next.js App Router + TypeScript + pnpm

Date: 2026-08-30
Status: Accepted

## Context
Repo is static `code.html` prototypes with no build (`AGENTS.md:4`, `README.md: Conventions`). `INTEGRATION.md:13-20` requires a server layer for `xendit-node@7.0.0` (Node 18+). Previous stack plan recommends Next.js App Router as the BFF.

## Decision
We will scaffold `apps/web` with `pnpm create next-app@latest --typescript --eslint --app --src-dir --import-alias "@/*"` on Node 20.9+ (`.nvmrc` + `.node-version`, commit `pnpm-lock.yaml`). App Router, Server Components by default, `src/` layout.

## Consequences
Positive: layouts/route handlers/Server Actions/streaming/metadata APIs fit the 33-screen migration (`SCREENS.md:5-46`). Negative: App Router learning curve vs Pages Router.

## Alternatives Considered
Pages Router — legacy only, no Server Components. Vite+Express — loses Next.js fetch cache/revalidation and file-based routing.

## Verification
`pnpm typecheck` (`tsc --noEmit`), `pnpm build` succeeds, `apps/web/src/app/layout.tsx` renders TEST MODE banner.
