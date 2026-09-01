# Spec: Screens → Apps Migration (33 prototypes → Next.js App Router)

> Addy Osmani Spec-Driven Development — Phase 1: SPECIFY. Saved: `docs/spec/screens-to-apps-migration.md`

## ASSUMPTIONS I'M MAKING
1. Web app only (no native) — Next.js App Router `apps/web` (`AGENTS.md:4`, `docs/adr/0001` Accepted).
2. Single responsive route per screen (mobile + desktop `_desktop` merged via `lg:`), not 33×2 files — per `SCREENS.md:3` Migrated Route shared (e.g. `balance` → `app/[locale]/balance/page.tsx`).
3. Tokens are source of truth — `design-system/kinetic_ledger/DESIGN.md` (desktop) + `kinetic_enterprise` (mobile) → CSS vars, no new tokens (`AGENTS.md:15`).
4. Batch incremental — 1 PR = 1 row `PROGRESS.md:17`, not 33 in one PR.
5. CodeGraph stays `apps/web` only (25 files, wal); `screens/` stays spec reference, not indexed (HTML not parsed) — hybrid via `screens-index.json` if needed.
6. Auth DB ready — `apps/web/prisma/schema.prisma:10` `User/Account/LedgerEntry` exists, `lib/db/prisma.ts:1` singleton done; Better Auth vs Clerk still open.

→ Correct me now or I'll proceed with these.

## Objective
Parse 33 static prototypes (`screens/mobile/*` 14 + `screens/desktop/*_desktop` 19, each `code.html` Tailwind CDN + `screen.png`) and migrate to `apps/web/src/app/[locale]/*` Server Components, reusing shadcn + Kinetic tokens, avoiding rewrite.

**Who:** Dashboard users (merchant ops seeing `data-mono` IDR, `label-caps` tables, `TEST MODE #d97706`).
**Success look:** All `PROGRESS.md:21-55` Screen Migration rows `⬜` → `✅`, `SCREENS.md:7-48` routes render responsive, `data-mono` right-aligned, `label-caps` sticky, TEST MODE persistent, `pnpm build` + `codegraph status` wal.

User stories:
- As ops, I see `Transaction Ledger` table (`transaction_ledger:218`) with sticky `label-caps` and `data-mono` IDR right.
- As finance, `Balance History` shows `IDR 1.005.870.599` `headline-xl data-mono` (`balance_history:237`).
- As admin, `Bulk Payouts` upload works via `Payout.createPayout()` idempotent (`INTEGRATION.md:209`).

## Tech Stack
- Framework: Next.js 15.5 App Router + TS 5.9 + `pnpm@9.12.0` `node>=20.9.0` (`AGENTS.md:4`, `docs/STACK.md:7`)
- Styling: Tailwind 4.1 `@tailwindcss/postcss` + shadcn/ui + Radix + `lucide-react` (`docs/STACK.md:11`)
- Tokens: `design-system/*/DESIGN.md` → CSS vars `/styles/globals.css` (`kinetic_ledger` `sidebar-width:260px gutter:1.5rem cell-x/y 16/12px`)
- Validation: Zod 4.5 + `server-only` + `@t3-oss/env-nextjs` (`apps/web/src/lib/env.ts:1`)
- DB: PostgreSQL 16-alpine (`compose.yaml:1`) + Prisma 6.19 (`lib/db/prisma.ts:1` `PrismaClient` singleton, `NEXTJS_CONCEPTS.md #106`)
- Payments: `xendit-node@7.0.0` server-only (`lib/xendit.ts:1`, `INTEGRATION.md:32`)
- Reuse libs from `NEXTJS_CONCEPTS.md` 210: `#6 Route Handlers`, `#31 webhook`, `#85 shadcn`, `#106 Prisma`, `#138 Zod`, `#146 Motion`, `#161 next-intl`

## Commands
```bash
# Parse screens (read-only extractor)
node scripts/parse-screens.mjs  # → docs/screens-index.json

# Dev (static + apps/web)
pnpm install                    # requires pnpm@9.12.0
pnpm dev                        # pnpm --filter web dev (next dev)
pnpm typecheck                  # pnpm --filter web typecheck (tsc --noEmit)
pnpm lint                       # pnpm --filter web lint (eslint .)
pnpm build                      # pnpm --filter web build (standalone)

# CodeGraph (wsl -d ubuntu-surfsense)
~/.npm-global/bin/codegraph status
~/.npm-global/bin/codegraph files
~/.npm-global/bin/codegraph explore "DataTable ledger"
~/.npm-global/bin/codegraph sync

# Docker
docker compose up -d db
pnpm --filter web exec prisma generate
pnpm --filter web exec prisma migrate dev
docker build -t web:local .
docker run -p 3000:3000 web:local  # GET /api/health 200

# WSL rule
wsl -d ubuntu-surfsense bash -c "<cmd>"
```

## Project Structure
```
screens/mobile/<name>/code.html + screen.png          # 14 source prototypes
screens/desktop/<name>_desktop/code.html + screen.png # 19 desktop density
design-system/kinetic_ledger/DESIGN.md                 # desktop tokens
design-system/kinetic_enterprise/DESIGN.md             # mobile tokens
scripts/parse-screens.mjs                              # extractor → docs/screens-index.json
docs/spec/screens-to-apps-migration.md                 # THIS SPEC
docs/screens-index.json                                # generated index (tokens, layouts)
apps/web/src/styles/globals.css                        # Kinetic CSS vars
apps/web/src/components/layout/                        # reusable layout primitives
  test-mode-banner.tsx, sidebar.tsx, top-bar.tsx, bottom-nav.tsx
  metric-card.tsx, data-table.tsx, input.tsx
apps/web/src/components/ui/                            # shadcn (button, card, table, dialog, toast)
apps/web/src/app/[locale]/[route]/page.tsx             # 33 routes per SCREENS.md
apps/web/src/server/dal/                               # DAL server-only (user, ledger)
apps/web/src/lib/db/prisma.ts                          # singleton
apps/web/src/lib/xendit.ts                             # server-only client
apps/web/src/app/api/webhooks/xendit/route.ts          # verify + dedupe
apps/web/src/app/api/health/route.ts                   # health
compose.yaml                                           # postgres:16-alpine
```

## Code Style
One snippet beats paragraphs — reuse, no rewrite:

```tsx
// apps/web/src/server/dal/ledger.ts — DAL server-only, Zod, Prisma singleton
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
export const LedgerEntrySchema = z.object({ amount: z.number().positive(), currency: z.string().default("IDR") });
export async function listLedgerEntries(opts:{take?:number}={}) {
  const take = z.number().min(1).max(100).default(20).parse(opts.take);
  return prisma.ledgerEntry.findMany({ take, orderBy:{createdAt:"desc"} });
}

// apps/web/src/components/layout/data-table.tsx — wrapper reusable
export function DataTable({ children }: {children: React.ReactNode}) {
  return <div className="bg-surface border border-border-subtle rounded-lg overflow-hidden">{children}</div>;
}
// Table header: thead.bg-surface-container-low th:font-label-caps sticky p-table-cell-padding
// Cell: td:font-data-mono text-right (IDR right-aligned)
// Banner: bg-warning (#d97706) fixed top-0 font-label-caps (AGENTS.md:18)
```

Conventions: `label-caps` sticky `thead`, `data-mono` `text-right`, `gutter`/`stack-md`/`cell-x/y`, `max-w-container-max 1440px`, `sidebar-width 260px`, `server-only` for `lib/xendit.ts` + `server/dal`.

## Testing Strategy
- Framework: Vitest + RTL (unit) + Playwright (e2e) (`docs/STACK.md:24`, `NEXTJS #127-128`)
- Location: `apps/web/src/**/__tests__/*.test.tsx`, `e2e/*.spec.ts`
- Levels:
  - Unit: `lib/utils.ts cn`, `server/dal/ledger` Zod parse, `lib/xendit` mock
  - Component: `data-table` renders `label-caps` sticky + `data-mono` right (RTL)
  - e2e: Playwright `dashboard` → `transactions` nav, `bulk_payouts` upload
- Coverage: 80% for DAL + xendit client; visual: `screen.png` vs `apps/web` route screenshot diff (manual until Chromatic)
- Verify per task: `pnpm typecheck && pnpm build && pnpm lint` + `~/.npm-global/bin/codegraph sync`

## Boundaries
- **Always do:** `codegraph_explore` before grep (`AGENTS.md:37`), `pnpm typecheck` before commit, validate `env` via Zod, keep `server-only` for secrets, flip one `PROGRESS.md` row per PR with ADR cite.
- **Ask first:** DB schema change `prisma/schema.prisma` + `prisma migrate`, add dep (`xendit-node`, `motion`, `next-intl`), change `next.config.ts headers`/CI, add 3D `three` (deferred `docs/STACK.md:67`).
- **Never do:** Commit `.env` secrets, edit `node_modules/.codegraph` (gitignored), remove failing `tsc` test, invent tokens (extend `DESIGN.md` first), call `xendit-node` from Client Component.

## Success Criteria
- [ ] `scripts/parse-screens.mjs` parses 33 `code.html`, generates `docs/screens-index.json` (tokens + layouts).
- [ ] `apps/web/src/styles/globals.css` merged Ledger+Enterprise vars, no `warning` missing (`dashboard_home:64`).
- [ ] Layout primitives `test-mode-banner, sidebar, top-bar, bottom-nav, metric-card, data-table` in `components/layout/` reusable.
- [ ] Batch 1 migrated & passing `pnpm build`: `dashboard` (metrics + quick actions), `transactions` (ledger table 7 cols + pagination), `balance` (IDR `headline-xl data-mono`). Verif `curl -I localhost:3000` headers `CSP/HSTS/nosniff`.
- [ ] `PROGRESS.md:21-55` 3 rows `⬜`→`✅` + `SCREENS.md` migrated routes render, `data-mono` right, `label-caps` sticky.
- [ ] `~/.npm-global/bin/codegraph files` shows new routes, `status` wal, `explore "DataTable"` finds reusable.
- [ ] No new token invented; all colors via `primary/surface-variant` etc. (`AGENTS.md:15`).

## Open Questions
1. Single responsive route (`lg:grid-cols-12`) vs keep `mobile/*` + `desktop/*_desktop` separate? Spec assumes single.
2. Priority order after Batch 1 — `customers, bulk_payouts, billing_invoices, webhooks` or all 33 at once?
3. TEST MODE: global fixed `bg-warning` banner (`mobile/dashboard_home:123`) or inline pill (`dashboard_home_desktop:207`) — spec assumes both (banner + header pill)?
4. CodeGraph: keep `screens/` out (current 25 files) or index `screens/**/*.html` via extractor JSON?
5. Auth choice for `server/dal` — Better Auth (MIT, `PHASE0_PLAN.md:8`) vs Clerk (`docs/STACK.md:17`) — which before `team_permissions` migration?
