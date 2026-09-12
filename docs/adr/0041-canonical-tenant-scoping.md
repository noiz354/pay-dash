# ADR-0041: Canonical tenant scoping — a required context at the data boundary, quarantined for the rest

Date: 2026-09-12
Status: **Accepted** (Wave 7A, Transactions slice)

## Context

`TENANT_ISOLATION_REPORT.md` (Wave 6) measured the gate and published **FAIL**: 0 of 20
`server/data/*` modules accepted an organization, so *the capability to isolate did not exist*.
Authorization was already real (`server/services/org-context.ts`, `requireStrictOrgContext`,
`guardExport`) — the app knew who the actor was and what they may do. It could not say **whose rows a
query may touch**, which is a lock on a door in a building with no walls.

Discovery for Wave 7A found the defect in four shapes, not one:

1. **Unscoped reads** — `listTransactions(filters)`, `getTransaction(id)` over a process-wide array.
2. **ID-only mutations** — `retryTransaction(id)`, `approveRefund({ transactionId })`,
   `refundTransaction(id, …)`.
3. **A returned-but-unused scope** — `guardExport()` resolves the actor's organization and the export
   route discarded it.
4. **A default organization in a production path** — the ledger's provider read called
   `readTransactions()` with no argument, which resolved `organizationId ?? DEFAULT_DEMO_ORG`:
   a real tenant's ledger page would render *another tenant's live provider rows*.

Plus one that cannot be fixed in code: the MCP transaction tools authenticated with one global bearer
token and read `LedgerEntry`, a table with **no `organizationId` column** — no predicate was available
to write.

The brief forbade retrofitting all 20 modules ("a mega-diff, one reviewable vertical slice per task"),
and it forbade the shortcut that retrofit invites: defaulting to a demo tenant so the call sites
compile.

## Decision

**One contract, enforced at the data boundary, generalised by a structural test.**

1. `OrganizationContext = { readonly organizationId: string }` (`domain/tenancy/organization-context.ts`)
   is the canonical shape. Every transaction read **and write** takes it as its **first required
   parameter** — no default, no optional, no overload without it.
2. `parseOrganizationContext()` is the only constructor. It rejects empty/blank/non-string and returns
   a frozen single-key object. There is no default organization to fall back to, and a context cannot
   smuggle roles.
3. Tenancy **policy** is not re-implemented here. The context bridges to Wave 6's
   `domain/security/tenant.ts` (`tenantScopeFor()`), which keeps the asymmetry: a foreign **read**
   returns `∅`, a foreign **write** throws `TenantIsolationError` and is audited.
4. Anti-enumeration is a **canonical policy repository** decision, not a per-endpoint one. The store
   is keyed `(organizationId, id)`; the wire answer for "not yours" and "does not exist" is identical
   (`notFound()` / `NOT_FOUND` / `Transaction not found.`), while the loud half lives in the audit log
   (`TENANT_ISOLATION_DENIED`, surface + org ids, never the neighbour's PII).
5. The **store is partitioned** (`Map<organizationId, rows>`), so "read everything" is not expressible
   through the module's own accessors. A `globalThis` slot remains, but it is private to the DAL and
   `S-5` fails CI if any production file outside it touches it.
6. **The remaining 11 unscoped consumers are quarantined** behind a fail-closed gate
   (`server/data/transactions-unscoped.ts`): it may answer only while the store holds **exactly one**
   tenant, must be handed a `surface` name, and throws the moment a second tenant's rows appear.
   Wave 7B deletes entries from it one module at a time; `S-2` freezes the set so it can only shrink.
7. Surfaces whose data cannot be scoped at all are **refused, not defaulted**: `server/dal/ledger.ts`
   throws on every entry point and `pg-stores`' unscoped transaction readers are deleted, until debt
   **D-26** (an `organizationId` column + composite key + RLS on `LedgerEntry`) lands.

## Consequences

**Positive**

- The invariant becomes a compile-time fact for its own module and a CI fact for its neighbours: adding
  a transaction repository function without a context fails `S-1`; a new unscoped reader fails `S-2`.
- The interim state is survivable. A single-tenant demo deployment keeps working; the *first request
  that could have leaked* crashes with the surface name instead of returning a neighbour's row.
- Wave 7B is a copy of this slice, not a design per module — Payouts → Refunds → Customers → Ledger →
  Webhooks → Audit each replace a quarantine entry with a scoped DAL plus the same five test shapes.
- Two defects outside the brief's letter were closed on the way because they were the same defect:
  the provider read's default organization, and the MCP endpoint's tenant-free money mutation.

**Negative / costs**

- 12 consumer call sites now import a module marked `@deprecated`. That is visible debt by design, and
  the ratchet makes adding to it impossible.
- `recordLinkPayment` had to gain a context parameter (it writes into the ledger), so a Wave 7B module
  carries a Wave 7A signature. Acceptable: the write is a transaction mutation.
- Refusing the Postgres transaction read removes functionality the MCP surface had. It is recorded as
  D-26 rather than restored unscoped.
- Two files (`server/dal/ledger.ts`, `server/mcp/pg-stores.ts`) keep `prisma.ledgerEntry` references
  that only `S-6` (must cite D-26) keeps honest.

## Alternatives Considered

- **Filter in the UI / per-route predicate.** Rejected: 12 callers, each able to forget it, and the
  defect class returns whenever someone adds a page. Wave 6 already showed the cost — `guardExport`
  had the organization id available and the route dropped it.
- **`getLedgerRows(ctx?)` optional during migration.** Rejected: an optional context is no context;
  every existing caller passes nothing and every new caller may.
- **Default to `DEFAULT_DEMO_ORG` for unscoped callers.** Rejected: it makes the demo tenant a *global*
  identity — one shared namespace for every deployment, and precisely the "default organization" this
  contract forbids.
- **Retrofit all 20 modules in one wave.** Rejected by the brief and by review reality; an unreviewed
  security change is a guess.
- **404-on-cross-tenant everywhere, no internal throw.** Rejected for writes: silence without an audit
  trail makes a wiring bug indistinguishable from a stale click, and the day the predicate is dropped
  nothing notices. Throwing-then-mapping keeps the wire quiet and the log loud.
- **Postgres RLS instead of application scoping.** Right long-term, unavailable now (D-09/D-26: the
  column does not exist), and it does not help the in-memory dev store that every dashboard page reads.
  Defence in depth, not a substitute.

## Verification

- `apps/web/src/server/data/transactions.tenant-isolation.test.ts` — T-1..T-14: list, search, detail,
  retry, three refund phases, export payload, guessed UUID, pagination/sort × isolation, metrics,
  provider path, quarantine fail-closed, orphan rows.
- `apps/web/src/server/data/transactions-structural.test.ts` — S-1..S-6 (arity, signature, first-arg,
  quarantine allowlist, no-unscoped-import-in-production-path, `ledgerEntry` refusal, store privacy).
- `apps/web/src/app/api/exports/transactions/route.tenant.test.ts` — the HTTP export boundary.
- `apps/web/src/server/mcp/domain-tools.tenant.test.ts` — tenant-bound tools; refusal without a tenant.
- `apps/web/src/server/services/transaction-organization-context.test.ts` — session wins, no demo
  fallback once multi-tenant, uniform not-found mapping.
- `apps/web/src/server/finance/tenant-isolation.probe.test.ts` — the published matrix; the Wave 6
  tripwire (`getLedgerRows.length === 0`) is inverted into a passing assertion.
