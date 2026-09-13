# Wave 10 — Platform Hardening: Persistence, Offline Build & Edge Runtime (Spec)

Date: 2026-09-13 · Branch: `wave-7d-derived-scoping` (main@a4b595a)
Predecessors: Wave 7H (org column + RLS — the persistence contract); D-09, D-14, D-18, D-19
Status: **Proposed**

---

## 0. Runtime baseline (measured, not carried over)

| Gate | Result 2026-09-13 |
|---|---|
| Full suite | **1472 passed / 17 failed** (15 pre-existing env + 2 calendar flakes) |
| Typecheck | clean · Lint 0 errors / 40 warnings (== D-17) |
| Persistence | in-memory stores (dev/preview); Prisma wired only on MCP/audit paths + `server/dal/*` |

## 1. Goal

> The app survives its own platform: data persists across restarts, the build works
> offline, the edge runtime resolves one middleware, and errors report through the
> supported channel. After Wave 10, "restart resets the ledger" and "needs network to
> build" are false statements.

## 2. Standard (applies to every item below)

Each sub-slice ships behind no flag (platform behavior, not product behavior) but lands
in dependency order (D-09 first — the rest test against persisted data); every change
keeps the in-memory fallback working for preview (the fallback is a feature: zero-DB demo);
no production secret or PII in new logs; the 17-failure baseline must not grow.

## 3. Gaps (file:line evidence, checkout `a4b595a`)

- **P-1** Persistence seam is in-memory (D-09): Prisma is wired only on MCP/audit paths
  (`server/repositories/*`, `server/dal/*`, `lib/db/prisma.ts`) while
  `server/data/*` (transactions, payouts, customers, billing slices) reset on restart.
  Scope: complete the Prisma swap per-DAL behind the existing repository seams (7H owns
  the ledger column+RLS; 10 owns the remaining DALs + passthrough removal). Verify the
  per-DAL list at Q2 — the 7-series partitioned stores define the seam surface.
- **P-2** `app/layout.tsx:2` — `next/font/google` fetches Geist/Inter/JetBrains Mono at
  build/dev (D-14): self-host the three families (verify license + subset at Q2),
  build passes with network disabled (the gate is a network-off build, not a config glance).
- **P-3** Middleware indirection (D-18): root `apps/web/middleware.ts` +
  `apps/web/src/middleware.ts` + logic in `apps/web/src/proxy.ts` — Next's `src/`
  resolution makes this fragile. Consolidate to one entry honoring `src/` resolution,
  with the proxy/auth-redirect behavior pinned by the existing routing tests
  (`e2e/routing.spec.ts` + `customers-test-procedure` proxy section).
- **P-4** Sentry deprecated configs (D-19): `sentry.server.config.ts`,
  `sentry.edge.config.ts`, `sentry.client.config.ts` → `instrumentation.ts` (+ client
  init file per current Sentry Next.js docs — verify doc version at Q2, bias to docs
  over memory). Error sampling + PII scrub asserted by test (scrub test sends a payload
  with an email-shaped value, asserts redaction).
- **Out of scope**: D-21/D-22 (folded into Wave 9 Q7 checklist); D-23/24/25 (WONTNOW).

## 4. Design

P-1 first (others test against it): per-DAL Prisma repositories implementing the
in-memory interfaces, fallback selected by `DATABASE_URL` presence (existing pattern —
extend, don't fork). P-2 vendored fonts under `apps/web/src/app/fonts/` (or the repo's
font convention — verify at Q2). P-3 single middleware entry, logic co-located. P-4 per
current Sentry docs. Each sub-slice independently committable; one wave, up to four
commits, single Q7 report.

## 5. Tests

- **PL-1..PL-12**: per-DAL persistence round-trip (write → restart-simulation (fresh
  module registry) → read-back equal); network-off build green; single-middleware
  resolution (assert exactly one entry matches a request in a routing test); proxy +
  auth-redirect behavior unchanged (existing specs green unmodified); Sentry init on the
  supported path + PII scrub test; Prisma-vs-memory parity suite for migrated DALs
  (same isolation tests parameterized over both backends where feasible).
- **Mutation-style negatives**: Prisma repository removed ⇒ parity test red on the DB
  backend; font vendoring reverted ⇒ offline build red; middleware logic split again ⇒
  resolution test red.
- Gates: full suite + typecheck + lint baselines held; the 17 pre-existing failures may
  only shrink (the Prisma-engines integration file P-8 in 7H is the joint target).

## 6. Plan (serial, dependency order)

Q0 spec (this doc) → Q1 failing/parity tests (red: no persistence, offline build red,
dual middleware, deprecated init) → Q2 P-1 Prisma swap → Q3 P-2 fonts → Q4 P-3
middleware + P-4 Sentry → Q5 full gates (incl. offline build + parity) → Q6 negatives
above → Q7 report + ADR + close D-09/D-14/D-18/D-19 + commit (up to four commits, one report).
