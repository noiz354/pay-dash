# ADR-0007 — Customer directory: derived data seam, URL-param deep links, activated proxy

- **Status:** Accepted
- **Date:** 2026-09-01
- **Supersedes / relates to:** ADR-0004 (Better Auth), ADR-0006 (Server Actions + URL state)

## Context

The customers pass of the page-by-page flow audit hit three structural problems.

1. **`/[locale]/customers` was a static prototype.** Three hard-coded rows
   (Acme / Global Logistics / Stark), a decorative `Filter` button, an unwired
   search input, a select-all checkbox with no selection model, an overflow
   button with no handler, a fake "2,104 Total" and permanently disabled
   pagination. LTV strings had even lost their currency prefix (`",520.00"`).
2. **The customer entity had no home.** `/customers/[id]` did not exist, so
   every row, every row action and the transaction detail's "View customer"
   button were dead ends. Two deep links were already being emitted by shipped
   code and silently ignored: `?new=1` (dashboard quick action) and `?q=<email>`
   (transaction detail hand-off).
3. **`src/proxy.ts` had never executed.** Next.js loads `src/middleware.ts` when
   a `src/` directory exists and ignores the project-root `middleware.ts`. The
   proxy was dead code for the whole project: bare `/sign-in` 404'd, unmatched
   URLs fell out of the app shell, and the auth gate was inert.

## Decision

**1. Customers are derived from the ledger, not stored twice.**
`src/server/data/customers.ts` groups the existing transaction store by email
and computes name, first/last seen, lifetime value, success rate, methods and
channels. Manually-created customers live in the same seam as a small
`manual[]` list, and edits are stored as `overrides[id]` rather than mutating
records. Consequences:

- a customer's lifetime value and their payments panel can never disagree;
- `customerIdFromEmail()` gives a stable, URL-safe id (`cus_…`) so a transaction
  row and a directory row resolve to the same profile page with no join table;
- swapping to Prisma touches one file, exactly like `transactions.ts`.

**2. Archive is a status transition, never a delete.** `BLOCKED` renders as
"Archived" and is restorable. Nothing in the customer surface removes data.

**3. The status vocabulary lives in `src/lib/customer-status.ts`.**
`server/data/customers.ts` imports `server-only`, so any client component that
needed `CUSTOMER_STATUSES` at runtime would drag the data layer into the browser
bundle (a hard build error). The client-safe module is the single definition;
the data module re-exports it for server callers.

**4. All list state is URL state** (`q`, `status`, `sort`, `page`), matching
ADR-0006. Deep links are contracts: `?new=1` opens the create dialog and is
removed from the URL on close; `?q=` pre-fills the search box; `?edit=1` opens
the edit dialog on a profile.

**5. The proxy is activated, with auth opt-in.** `src/middleware.ts` re-exports
`./proxy`. To avoid locking a session-less preview out of every screen, the
protected-route redirect is gated behind `AUTH_ENFORCED=1`; the logic itself is
unchanged. The proxy now also: passes `/` and `/api/*` straight through, rewrites
bare `/sign-in` and `/sign-up` into the default locale, rewrites `/id` to the
dashboard instead of bouncing to the chooser scaffold, and rewrites any other
unmatched bare path into the locale segment so 404s render inside the app shell.

## Alternatives considered

- **A separate customer table seeded independently** — rejected: two sources of
  truth for "who paid us" is exactly the drift this dashboard is meant to expose.
- **Deleting the prototype rows** — rejected by the project rule that nothing is
  removed. They are seeded into the store instead (`PROTOTYPE_SEED`), so Acme,
  Global Logistics and Stark still render, now clickable and with real currency;
  the original markup is preserved as the exported `StaticCustomersPreview`.
- **Client-side filtering** — rejected: not shareable, not server-rendered, and
  it breaks the back button.

## Consequences

- New routes: `/[locale]/customers/[id]`, plus `loading.tsx` and `not-found.tsx`
  for both the list and the detail; new API route `/api/exports/customers`.
- `ExportCsvButton` gained two optional props (`endpoint`, `filePrefix`) with
  defaults that preserve its existing behaviour.
- `AUTH_ENFORCED=1` must be set in any environment that should actually enforce
  the sign-in redirect.
