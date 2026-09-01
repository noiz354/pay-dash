# ADR-0006: Server Actions + URL state for the transaction journey

Date: 2026-09-01
Status: Accepted

## Context
The migrated screens (`SCREENS.md`: `dashboard_home_desktop`, `transaction_ledger_desktop`)
were pixel-faithful but behaviourally inert: the "New Transaction" CTA was a plain
link, filters/pagination/search were decorative, ledger rows had no destination, and
there was no create/refund/retry path, no toast layer, no empty states and no
per-region skeletons (see `docs/audit/user-flow-audit-2026-09-01.md`).
`docs/ARCHITECTURE.md:42` mandates server/client/DAL boundaries, and Postgres is not
always reachable in dev/preview.

## Decision
We will drive all transaction mutations through **Server Actions**
(`src/server/actions/*.ts`, zod-validated, returning a serialisable `ActionState`
with `fieldErrors`) consumed by client components via `useActionState` /
`useFormStatus`, and keep all **list state in the URL** (`status`, `channel`,
`range`, `q`, `page`) so the ledger is server-rendered, shareable and cacheable.
Reads and writes both go through a single seam, `src/server/data/transactions.ts`,
which currently serves a deterministic in-memory ledger and is the only file that
changes when the Prisma DAL (`src/server/dal/ledger.ts`, ADR-0003) is switched on.
Feedback is standardised: sonner `<Toaster/>` in the root layout, `<Suspense>` +
`TableSkeleton` for loading, `EmptyState` for no-data/no-match, `error.tsx` +
`not-found.tsx` for failure paths.

## Consequences
Positive: every CTA on the dashboard/ledger/detail journey resolves to a real
destination or mutation; filters are bookmarkable; pending/disabled/error states are
uniform; 12 previously unused shadcn primitives are now wired (`AGENTS.md:20`).
Negative: the in-memory store resets on server restart and is per-instance — it is a
development seam, not a persistence strategy; bulk selection and the "More filters"
panel remain backlog.

## Alternatives Considered
- Client-side `useState` filters: not shareable, no SSR, loses the streaming skeleton.
- Route Handlers + `fetch` for mutations: duplicates validation and loses
  `revalidatePath` integration; kept only for the CSV export (a real file download).
- Blocking the work on Postgres: would leave the whole journey untestable.

## Verification
`pnpm --filter web typecheck` and `eslint` clean; `pnpm --filter web test` 3 passed;
dev-server smoke: `/dashboard` 200, `/transactions` 200, `/transactions?status=FAILED&range=7d` 200,
`/transactions/<id>` 200 renders summary/timeline/refund, unknown id renders the
not-found screen, `/api/exports/transactions` returns CSV.
