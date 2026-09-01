# Spec: Migrate Remaining 27 screens/code.html → apps/web (AGENTS.md Compliant)

> Addy Osmani Spec-Driven Development — Phase 1: SPECIFY. Saved: `docs/spec/screens-27-migration.md` | Audit: `docs/audit/screens-migration-gap-2026-08-31.md` | Parent: `docs/spec/screens-to-apps-migration.md` | Primitive: `docs/primitive-elements.md`
> Status: Proposed → awaiting Human review before PLAN/TASKS/IMPLEMENT. Build Mode active but gated — no code until approved.

## ASSUMPTIONS I'M MAKING
1. Web only (no native) — Next.js App Router `apps/web` `pnpm@9.12.0` `node>=20.9.0` (`AGENTS.md:4`, `docs/adr/0001` Accepted).
2. Single responsive route per prototype (mobile + desktop `_desktop` merged via `lg:`) not 27×2 files — per `SCREENS.md:11+30` shared `dashboard/page.tsx` etc. 33→24 unique, 6 shipped, **27 ⬜ = 21 unique** pending.
3. Tokens are law — `design-system/kinetic_ledger/DESIGN.md` + `kinetic_enterprise` → `globals.css:25` CSS vars `--primary:#003fb1`, `--warning:#d97706` alias `test-mode-amber`, no new tokens (`AGENTS.md:15`).
4. Batch incremental — 1 PR = 1 row `PROGRESS.md:21` + ADR cite (`AGENTS.md:39`), not 27 in one PR.
5. shadcn 100+ via registry, never rewrite — `npx shadcn@latest add <name>` / `@diceui` / `@tailark` (`AGENTS.md:21` 94 files `add -a` +32, CodeGraph 141 wal). Existing `layout/*:6` + pre-shadcn `ui/button,card` **kept as-is** (`AGENTS.md:22`), new routes wire 75 unused (`table, pagination, checkbox, badge, dialog, tabs, select, calendar, chart, avatar` per `primitive-elements.md:172`).
6. CodeGraph is `apps/web` only (HTML not parsed) — `~/.npm-global/bin/codegraph` `wsl -d ubuntu-surfsense` before grep (`AGENTS.md:43`).

→ Correct me now or I'll proceed with these.

## Objective

Migrate 27 pending `screens/*/code.html` (Tailwind CDN + inline `tailwind.config` + `screen.png`) to `apps/web/src/app/[locale]/*` Server Components, **full `AGENTS.md` compliant**: `design-system rules` (data-mono right, label-caps sticky, TEST MODE banner), `screen conventions` skeleton, `component rules` shadcn primitives, `commands`/`docs`/`tooling`/`WSL`.

**Who:** Merchant ops (Kinetic Ledger desktop) seeing `data-mono` IDR right, `label-caps` sticky tables, `TEST MODE #d97706` amber.

**Success look:**
- `PROGRESS.md:21` 27 `⬜` → `✅` (each PR flip 1), `SCREENS.md:7` 24 unique routes render responsive (`max-w-container-max 1440px`, `sidebar-width 260px`, `gutter 1.5rem`, `cell-x/y 16/12px`).
- `pnpm build` + `codegraph status wal` 141→~170 files, `label-caps` sticky `thead` + `data-mono text-right` via `cn()` not fork, shadcn `table/pagination/checkbox/badge/dialog/tabs/select/calendar/chart/avatar` wired (75 unused → used), existing `layout/*:6` untouched.

User stories:
- As ops, `customers` table shows `avatar` + `badge` status right, paginated.
- As finance, `billing` shows `Invoice` `data-mono` link + `select` filters.
- As risk, `risk_velocity_limits` toggles `switch/slider` + `alert`.

## Tech Stack

- Framework: Next.js 15.5 App Router + TS 5.9 + `pnpm@9.12.0` (`AGENTS.md:4`, `docs/adr/0001`)
- Styling: Tailwind 4.1 `@tailwindcss/postcss` + shadcn/ui 94 files + Radix/Base UI + `lucide-react` (`AGENTS.md:21`, `docs/adr/0002`)
- Tokens: `design-system/*/DESIGN.md` → `globals.css:25` CSS vars + `@theme inline`
- Validation: Zod 4.5 + `server-only` + `@t3-oss/env-nextjs` (`lib/env.ts:4`)
- DB: PostgreSQL 16-alpine `compose.yaml:1` + Prisma 6.19 `lib/db/prisma.ts:9` (`adr/0003`)
- Auth: Better Auth `lib/auth.ts:1` + `auth-client.ts` Prisma adapter (`adr/0004`, swappable to Clerk via 1 file)
- Payments: `xendit-node@7.0.0` server-only `lib/xendit.ts:9` + `/api/webhooks/xendit` verify/dedupe (`adr/0003`, `INTEGRATION.md:32`)
- Reuse libs from `NEXTJS_CONCEPTS.md` 210: `#6 Route Handlers`, `#85 shadcn`, `#106 Prisma`, `#138 Zod`, `#146 Motion`, `#161 next-intl` (deferred)

## Commands

```bash
# Screens reference (no build)
# open screens/mobile/<name>/code.html or screens/desktop/<name>_desktop/code.html

# Install & dev (AGENTS.md:32)
pnpm install # pnpm@9.12.0 node>=20.9.0
pnpm dev # pnpm --filter web dev (next dev)
pnpm typecheck # pnpm --filter web typecheck (tsc --noEmit)
pnpm lint # pnpm --filter web lint (eslint .)
pnpm build # pnpm --filter web build (standalone, headers CSP)

# CodeGraph (wsl -d ubuntu-surfsense, AGENTS.md:43)
wsl -d ubuntu-surfsense bash -c '~/.npm-global/bin/codegraph status'
wsl -d ubuntu-surfsense bash -c '~/.npm-global/bin/codegraph files'
wsl -d ubuntu-surfsense bash -c '~/.npm-global/bin/codegraph explore "DataTable ledger"'
wsl -d ubuntu-surfsense bash -c '~/.npm-global/bin/codegraph sync'
# inside WSL: ~/.npm-global/bin/codegraph status

# shadcn (never rewrite, AGENTS.md:21)
npx shadcn@latest add <name> -y -o # e.g. table pagination checkbox badge dialog tabs select calendar chart avatar
npx shadcn add @diceui/avatar-group @tailark/gantt -y -o
npx shadcn diff <name> # check update

# DB
docker compose up -d db
pnpm --filter web exec prisma generate
pnpm --filter web exec prisma migrate dev

# WSL rule (AGENTS.md:48)
wsl -d ubuntu-surfsense bash -c "ls -la"
wsl -d ubuntu-surfsense bash -c "cd /home/norman2/31-8-26-xendit-projects && unzip -o <file>.zip && rm <file>.zip"
```

## Project Structure

```
screens/mobile/<name>/code.html + screen.png # 14 prototypes, no suffix
screens/desktop/<name>_desktop/code.html + screen.png # 19 _desktop suffix
design-system/kinetic_ledger/DESIGN.md # desktop tokens
design-system/kinetic_enterprise/DESIGN.md # mobile tokens
SCREENS.md # manifest (Migrated Route) + PROGRESS.md # build status (1 row per PR + ADR)
docs/spec/screens-27-migration.md # THIS SPEC (AGENTS.md compliant)
docs/audit/screens-migration-gap-2026-08-31.md # gap audit (6 ✅ /27 ⬜)
docs/primitive-elements.md # 94 files audit (4 used, 75 unused mapping)
apps/web/src/styles/globals.css:25 # Kinetic CSS vars --primary:#003fb1 --warning:#d97706
apps/web/src/components/layout/* # 6 kept as-is: test-mode-banner, sidebar, top-bar, bottom-nav, metric-card, data-table
apps/web/src/components/ui/* # 94 shadcn primitives (table, pagination, checkbox, badge, dialog, tabs, select, calendar, chart, avatar, etc.)
apps/web/src/app/[locale]/[route]/page.tsx # 3 shipped (dashboard/balance/transactions) + 21 pending (customers, payouts/bulk, billing, audit, fraud, kyc, team, etc. per SCREENS.md:7)
apps/web/src/server/dal/* # DAL server-only (ledger, user)
apps/web/src/lib/db/prisma.ts:9 # singleton
apps/web/src/lib/xendit.ts:9 # server-only client
apps/web/src/app/api/webhooks/xendit/route.ts # verify x-callback-token + dedupe
compose.yaml # db postgres:16-alpine
```

Adding a screen: `screens/<platform>/<name>/code.html` + `screen.png` → register `SCREENS.md` + `PROGRESS.md` (`AGENTS.md:13`).

## Code Style

One snippet beats paragraphs — reuse via `cn()`, never fork tokens:

```tsx
// apps/web/src/app/[locale]/customers/page.tsx — AGENTS.md:15 tokens + 20 primitives
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function CustomersTable() {
  return (
    <Table>
      <TableHeader className="sticky top-0 bg-[var(--surface-container-low)] label-caps">
        <TableRow><TableHead>Customer</TableHead><TableHead className="text-right">LTV</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        <TableRow className={cn("hover:bg-[var(--surface-container-low)]/50")}>
          <TableCell className="flex items-center gap-2"><Avatar/><span>Budi</span></TableCell>
          <TableCell className="data-mono text-right">IDR 12,340,000.00</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
// Banner: <div className="bg-[var(--test-mode-amber)] label-caps">TEST MODE — Data is not live</div> (AGENTS.md:18)
// Sidenav: w-sidebar-width 260px bg-inverse-surface, bottom-nav: fixed bottom-0 h-16 md:hidden
```

Conventions: standalone `<!DOCTYPE html>` CDN + `tailwind.config` inline + Material Symbols + Inter/JetBrains Mono kept for `screens/` only; `apps/web` uses `@theme inline` + `globals.css` vars, `cn()` + Radix, no extra `<style>`.

## Testing Strategy

- Framework: Vitest + RTL (unit) + Playwright (e2e) (`docs/STACK.md:24`, `NEXTJS #127-128`) — deferred until Batch 1, but every task `pnpm typecheck && pnpm build` required (`AGENTS.md:32`).
- Location: `apps/web/src/**/__tests__/*.test.tsx`, `e2e/rows.spec.ts`
- Levels:
  - Unit: `lib/utils cn`, `server/dal/ledger` Zod, `lib/xendit` mock
  - Component: `table` sticky `label-caps` + `data-mono right` (RTL), `badge` status colors, `checkbox` select
  - e2e: Playwright nav `dashboard→customers→billing→audit`, pagination, dialog `bulk_payouts` create
- Coverage: 80% DAL + xendit; visual: `screen.png` vs route screenshot diff manual until Chromatic
- Verify per task: `wsl -d ubuntu-surfsense bash -c '~/.npm-global/bin/codegraph sync && pnpm typecheck && pnpm build'` + `codegraph_explore "DataTable"` before grep (`AGENTS.md:43`)

## Boundaries

- **Always do:** `codegraph_explore` before grep; `pnpm typecheck` before commit; validate `env` Zod; keep `server-only` for secrets; flip one `PROGRESS.md:21` row per PR + cite ADR (`AGENTS.md:39`); use exact `DESIGN.md` tokens (`AGENTS.md:15`); keep `layout/*:6` as-is, wire `ui/*:94` (`AGENTS.md:21`).
- **Ask first:** DB schema `prisma/schema.prisma` + `prisma migrate`, add dep (`xendit-node`, `motion`, `next-intl`, `better-auth`↔`Clerk`), change `next.config.ts headers`/CI, add 3D `three` (deferred `STACK.md`).
- **Never do:** Commit `.env` secrets, edit `node_modules/.codegraph` (gitignored), remove failing `tsc` test, invent tokens (extend `DESIGN.md` first), call `xendit-node` from Client Component, rewrite shadcn component (use `npx shadcn add`), delete `layout/*:6` or `primitive-elements.md`, use `//wsl.localhost` shell path (`AGENTS.md:48`).

## Success Criteria

- [ ] All 27 `⬜` → `✅` in `PROGRESS.md:21` (21 unique routes) — each PR 1 row + ADR `0001-0005` cite, verified `ls -R apps/web/src/app/[locale]` shows 24 routes.
- [ ] Every migrated route uses shadcn primitives (not hand-rolled `data-table`): `customers`→`table+pagination+checkbox+avatar+badge`, `billing`→`table+select+badge+tabs`, `audit`→`table+tabs+select+calendar+checkbox` etc. per `primitive-elements.md:172` map; `grep -R @/components/ui/ src/app` grows 4→~30.
- [ ] Design-system compliant: `data-mono text-right` for IDR, `label-caps sticky top-0 bg-surface-container-low` for `th`, `TEST MODE #d97706` amber banner persistent (`AGENTS.md:18`) via `test-mode-banner` pill+banner.
- [ ] Screen conventions: `screens/*` remains standalone CDN `code.html` (no `<style>` extra), `apps/web` uses `globals.css:25` vars + `cn()`; no fork of primitives.
- [ ] Commands pass: `pnpm typecheck`, `pnpm build` (standalone, CSP/HSTS), `pnpm lint` (1 warning `analytics.ts:11` ok).
- [ ] Tooling: `codegraph status` wal, 141→~170 files, `explore` finds `table` before grep (`AGENTS.md:43`), primitive audit `docs/primitive-elements.md` preserved.
- [ ] Spec is living: updated when scope changes, committed, referenced in PRs.

## Open Questions

1. Single responsive route `lg:grid-cols-12` vs keep `mobile/*` + `_desktop` separate files? Spec assumes single (SCREENS.md shared).
2. Priority after `customers/bulk/billing` — `audit/kyc/risk` or `team/webhooks`? Spec assumes Batch 2a customers/bulk/billing first.
3. TEST MODE full fixed banner (`mobile/dashboard_home:123`) vs inline pill (`dashboard_home_desktop:207`) — spec assumes both (banner `layout.tsx:18` + pill `top-bar`).
4. CodeGraph include `screens/*.html` via extractor `docs/screens-index.json` hybrid or keep `apps/web` only? Spec keeps out.
5. Auth choice for `team_permissions` — Better Auth (current `lib/auth.ts:1`, `schema.prisma:10` User/Session/Account) vs Clerk (`docs/adr/0004`) — which before team migration?
