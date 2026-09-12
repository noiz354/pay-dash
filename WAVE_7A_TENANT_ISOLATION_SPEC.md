# Wave 7A — Transactions Tenant Isolation (Spec)

Date: 2026-09-12 · Branch: `arena/01a095f2-pay-dash` · Predecessor: PR #11 / Wave 6
Status: **Accepted for implementation** · Follows: Wave 7B (Payouts → Refunds → Customers → Ledger → Webhooks → Audit)

---

## 1. The invariant under test

> **Organization A cannot read, search, export, open the detail of, or mutate a transaction
> belonging to Organization B — even when it knows the resource id exactly.**

Wave 6 published this gate as **FAIL** (`TENANT_ISOLATION_REPORT.md`), with the honest reason: not
one of the 20 `server/data/*` modules accepts an organization, so *the capability to isolate does not
exist*. Wave 7A does not retrofit all 20. It converts **one vertical slice — Transactions — into a
proof**, and turns that proof into a machine-enforced contract the remaining 19 modules must obey
when they land.

Two things make this a slice rather than a patch:

1. The predicate lives at the **data boundary**, not in the UI. A filtered table is a presentational
   accident; a repository signature that cannot be called without a tenant is a compile-time fact.
2. The contract is **structurally tested**. A new repository function that forgets the context fails
   CI, so the invariant survives the next contributor.

---

## 2. Canonical contract

```ts
// domain/tenancy/organization-context.ts   (pure, importable from server + tests)
export type OrganizationContext = {
  readonly organizationId: string;
};
```

Rules, in order of how they are enforced:

| # | Rule | Enforcement |
|---|---|---|
| C-1 | Every transaction read **and** write takes an explicit `OrganizationContext` as its **first parameter**. No default value, no optional parameter, no `= {}`. | TypeScript (required param) + structural test on function arity/name of first param |
| C-2 | A context is only *fabricated* by `parseOrganizationContext()`, which rejects empty/whitespace/non-string. There is **no default organization**. | unit test |
| C-3 | The production path builds the context from the **session** (`resolveTransactionOrganizationContext`). A browser-supplied `?organizationId=` is normalized against the session scope and never wins. | test + `resolveRequestedScope()` reuse |
| C-4 | No **demo fallback** in strict mode. `AUTH_ENFORCED=strict` (the default) with no session → denied, exactly as `requireStrictOrgContext` already behaves for money movement and exports. | test |
| C-5 | No **global store lookup**. The ledger is partitioned by `(organizationId, id)`; the only accessor that could see across partitions is quarantined (§5). | structural test on import graph |
| C-6 | No **ID-only mutation**. `retry`, `refund.request`, `refund.approve`, `refund.reject`, `refund.execute`, `create` all take the context. | signatures + isolation tests |
| C-7 | The context is bridged to the Wave 6 primitive (`tenantScope()`), so **policy stays single-sourced**. `OrganizationContext` is the *shape at the boundary*; `domain/security/tenant.ts` remains the *policy engine*. | the bridge is one function, tested |

Forbidden in a production path, restated as code review triggers:

- ❌ `organizationId = DEFAULT_DEMO_ORG` as a parameter default
- ❌ `ctx ?? demoOrgContext()`
- ❌ `globalThis.__kineticTxStore` reachable from a route/action
- ❌ `refundTransaction(id, …)`, `retryTransaction(id, …)` — a mutation addressed by id alone

---

## 3. Flow map (read-only discovery, with evidence)

```
browser (cookie session)
  │
  ├─ proxy.ts ──────────────── edge gate (roles, not tenant)          ✅ actor, ✗ tenant
  ├─ page: /transactions ───── listTransactions(filters)              ✗ no ctx        ← G-1
  ├─ page: /transactions/[id] ─ getTransactionWithSla(id)             ✗ no ctx        ← G-2
  ├─ action: create/refund/retry ─ requireStrictOrgContext(perm)      ✅ actor, ✗ tenant← G-3
  ├─ action: request/approve/reject refund ─ same                     ✅ actor, ✗ tenant← G-3
  ├─ route: /api/exports/transactions ─ guardExport() → organizationId RETURNED BUT UNUSED ← G-4
  ├─ route: /api/mcp (tools/call) ─ authorizeMcpRequest() → no org at all               ← G-5
  │        └─ pg-stores.listTransactionsPostgres / getTransactionPostgres                ← G-6
  ├─ derived surfaces (balance, audit, risk, webhooks, handoff, onboarding,
  │   command-center, links, customers, invoices, reports, finance/snapshot)
  │        └─ getLedgerRows()  ── process-wide view of every row                         ← G-7
  │
  └─ DAL: server/data/transactions.ts
           ├─ store(): globalThis.__kineticTxStore = { rows: seed() }                   ← G-8
           │        └─ rows carry NO organizationId column                               ← G-9
           ├─ provider read: service.readTransactions()  ← called with no org           ← G-10
           │        └─ resolveFirstActive(organizationId ?? DEFAULT_DEMO_ORG)            ← G-11
           └─ query: find(t => t.id === id || t.referenceId === id)   ← id-only, no predicate
```

### Gap inventory

| ID | Where | Defect | Wave 7A disposition |
|---|---|---|---|
| G-1 | `server/data/transactions.ts:listTransactions` | list/search/filter/sort/page over the process-wide row set | **FIXED** — scoped |
| G-2 | `transactions.ts:getTransaction`, `getTransactionWithSla` | id-only read; caller cannot tell "absent" from "not yours" because both are `null` *by accident*, not by policy | **FIXED** — scoped, null-equivalence by policy |
| G-3 | `server/actions/transactions.ts` (6 actions) | authorize the actor, then hand the DAL an unscoped id | **FIXED** — every action resolves and passes the context |
| G-4 | `app/api/exports/transactions/route.ts` | `guardExport()` returns `organizationId` and the route discards it | **FIXED** — the returned id *is* the query predicate |
| G-5 | `server/mcp/{auth,server,domain-tools}.ts` | one global bearer token; `buildMcpServer()` has no tenant; `list_transactions`/`get_transaction`/`refund_transaction` read and write the whole ledger | **FIXED (fail-closed)** — tools run against the request's tenant only; without a resolvable tenant they refuse instead of defaulting |
| G-6 | `server/mcp/pg-stores.ts` + `prisma/schema.prisma:75` | `LedgerEntry` has **no `organizationId` column** — a `where` clause cannot express the predicate | **CONTAINED + REPORTED** — Postgres transaction reads are refused from the MCP surface until the column/RLS lands (new debt **D-26**); `CanonicalPayment`/`AuditEvent` already carry `@@unique([id, organizationId])` and are unaffected |
| G-7 | 12 call sites of `getLedgerRows()`/`listTransactions()` in *other* modules | derived surfaces read across tenants | **QUARANTINED** (§5) + ratchet-tested; their own isolation is Wave 7B |
| G-8 | `transactions.ts:store()` | global store keyed by a single slot | **FIXED** — partitioned `(organizationId → rows)`; the slot is private |
| G-9 | `Transaction` DTO | no owning column at all | **FIXED** — `organizationId` is part of the row and the CSV/query key |
| G-10 | `listTransactions` provider path | provider read called with no org | **FIXED** — the read is org-bound |
| G-11 | `provider-read.ts:87,96` | `?? DEFAULT_DEMO_ORG` — a **default organization in a production path** | **FIXED** for the transaction surface: the DAL passes the tenant explicitly; the fallback stays only for balance (out of scope, tracked) |
| G-12 | `getLedgerMetrics`, `getAnalyticsSeries`, `listRefundsAwaiting` | aggregates/analytics/queue computed over every row | **FIXED** — scoped; metric and analytics metadata can no longer describe another tenant's book |
| G-13 | `retryTransaction`, `retryTransactionWithVersion`, `refundTransaction`, `requestRefund`, `approveRefund`, `rejectRefund` | ID-only mutations | **FIXED** — scoped writes, cross-tenant writes throw + are audited |

Not a gap, checked and recorded: `components/command-palette.tsx` is navigation-only (`NAV_SECTIONS`
projected through the permission adapter) and carries **no entity search and no data source** — grep
for a transaction read in that file returns nothing, so there is no cross-tenant path there. It is
covered by test **S-4** so the claim cannot rot if someone adds entity search later.

---

## 4. Security semantics (anti-enumeration policy)

**Chosen policy: canonical policy repository, one rule for all transaction surfaces.**

| Situation | Internal behaviour | Wire-visible behaviour |
|---|---|---|
| Read of a foreign or unknown id | `scopeRecord()` → `null` | detail page `notFound()`; API/CSV → the empty *own-tenant* set; MCP → same `NOT_FOUND` text |
| Search/filter that would match only foreign rows | predicate applied *before* the filter | `rows: []`, `total: 0` |
| Write (retry / refund request / approve / reject / execute) targeting a foreign row | `assertTenantMatch()` throws `TenantIsolationError("CROSS_TENANT_WRITE")`, **audited** with `surface` | **identical to not-found** — `Transaction not found.` / `notFound()` |

The asymmetry (loud inside, silent outside) is inherited from Wave 6 and is deliberate:

- Externally indistinguishable ⇒ **no enumeration oracle**. A guessed UUID gets byte-identical
  behaviour whether the id exists in another tenant, exists nowhere, or is malformed.
- Internally loud + audited ⇒ a bug that reaches across the boundary is *visible in the audit log*,
  instead of quietly corrupting a neighbour's book.

`404`-everywhere was rejected for writes: a silent `ok:false` return with no audit trail cannot tell
an operator "you probed a foreign id" from "your click raced a teammate". Throwing-then-mapping
gives both properties at once.

---

## 5. The quarantine (how one slice stays one slice)

Threading a tenant through Transactions forces 12 call sites in **other** modules to compile. Giving
each of them a tenant is Wave 7B (10 modules × tests × UI = the mega-diff Wave 6 explicitly refused).
Ignoring them would mean inventing a `getLedgerRows()`-shaped default tenant — the exact thing C-2
forbids.

So the legacy readers are **quarantined behind a fail-closed gate**:

```ts
// server/data/transactions-unscoped.ts   @deprecated Wave 7B
export function legacyLedgerRows(surface: LegacyLedgerSurface): Transaction[];
export function legacyListTransactions(surface, filters, options): Promise<Paginated<LedgerRow>>;
```

The gate has one job: it may only return rows while the store holds **exactly one tenant**. The
moment a second tenant's rows exist, every unscoped reader **throws** rather than widening its view.

This converts a silent leak into a loud crash on the very first request that could have leaked —
which is what makes "ship the slice, finish the rest in 7B" survivable instead of a gamble.

Accompanying ratchet (as shipped — `S-1c`, `S-1d` and `S-6` were added during the build, each in
response to a hole this spec's own review found):

| Test | Property |
|---|---|
| S-1 | Every exported async/scoped function in `server/data/transactions.ts` has `OrganizationContext` as its first required parameter (arity ≥ expected, name checked) |
| S-2 | `transactions-unscoped.ts` consumer set ⊆ the frozen allowlist, and `surface` is a required literal argument (a new unscoped reader fails CI) |
| S-3 | No transaction production path (ledger page, detail page, export route, transaction actions, MCP transaction tools) imports the quarantine |
| S-4 | `command-palette.tsx` imports no data source (no entity search may quietly grow an unscoped read) |
| S-5 | No exported `Transaction`-shaped object can lack an owner: `getLedgerRows`-equivalent reads always carry `organizationId`, and `toCsv` never emits it (no internal metadata in an export) |
| S-1c | `soleLedgerOrganizationId()` — the accessor that makes the quarantine's decision — is importable by exactly one file (the quarantine), and tenancy probes must return `number`/`string \| null`, never a row |
| S-1d | The demo seeder (`seedDemoLedgerForOrganization`) is unreachable from `app/**`, and both modules keep their `server-only` barrier, so no request path can invent a tenant's ledger |
| S-6 | No `prisma.ledgerEntry` **transaction** read may exist unless the file cites debt **D-26**: the table has no `organizationId` column, so an unscoped Postgres read cannot be fixed by adding a `where` clause |

---

## 6. In scope / out of scope

**In scope (all eight named surfaces):** transaction list · search/filter/sort/pagination · detail by
ID · retry · refund initiation · refund approval (+ rejection) · CSV export · Command Palette/entity
search (verified N/A, guarded by S-4). Plus, because they are transaction surfaces with the same
defect: the MCP `list_transactions`/`get_transaction`/`refund_transaction` tools, `createTransaction`,
the derived aggregates `getLedgerMetrics`/`getAnalyticsSeries`/`listRefundsAwaiting`, and the provider
read path used by the ledger.

**Out of scope (deliberate):** tenant isolation *tests and threading* for Payouts, Refunds-as-module,
Customers, Ledger/audit, Webhooks, Invoices, Links, Risk, Balance, Reports, Handoff internals,
Postgres RLS, and `LedgerEntry` schema work. They keep compiling, they get **quarantined**, and they
get their own slice in 7B.

---

## 7. Required tests (TDD — written before the implementation)

| ID | Test | Must prove |
|---|---|---|
| T-1 | Org A lists | only A's rows; `total` counts only A |
| T-2 | Org A searches (`q`, `status`, `channel`, `range`, `refundState`, `sla`) | a needle that matches only B's rows returns `[]`, never B |
| T-3 | Org A detail of B's id | `null`/not-found; indistinguishable from a nonexistent id |
| T-4 | Org A retry of B's id | refused; B's row unchanged; denial audited |
| T-5 | Org A refund request/approve/reject of B's id | refused; no money moves on B; `refundState` unchanged |
| T-6 | Org A export | CSV contains only A's rows, byte-for-byte no B reference id |
| T-7 | Guessed UUID / `txn_bogus` / empty string | denied and identical to each other (anti-enumeration) |
| T-8 | Pagination × filter × sort | every page of A's traversal contains only A rows, and B is unreachable at any offset (`total`/`pageCount` exclude B) |
| T-9 | Metrics + analytics per tenant | A's `totalVolume`/series reflect A's rows only; a two-tenant store cannot double-count |
| T-10 | Create | a write lands in the caller's partition and carries the owner; a second tenant cannot see it |
| T-11 | Provider path | `listTransactions` asks the provider for **the caller's** org, and provider rows are still scope-filtered (defence in depth) |
| T-12 | Quarantine fail-closed | with 2 tenants in the store, `legacyLedgerRows(surface)` throws |
| T-13 | Bridge totality | `OrganizationContext → TenantScope` preserves id, rejects empty, and `tenantScope("")` throws |
| S-1..S-6 | Structural (§5, incl. S-1c/S-1d) | contract cannot be quietly bypassed — verified by 10 mutation checks |
| R-1 | Regression | existing 1263-test suite stays green (same failing file as baseline: `mcp/server.integration.test.ts`, Prisma engines) |

---

## 8. Plan (the ordered build)

| Step | Deliverable | Gate to next step |
|---|---|---|
| P0 | This spec + flow/gap map | gaps cited to code |
| P1 | Failing tests: `transactions.tenant-isolation.test.ts`, `organization-context.test.ts`, `transactions-structural.test.ts` | red for the *right* reason (missing ctx, not typos) |
| P2 | Canonical contract `domain/tenancy/organization-context.ts` + Wave 6 bridge | T-13 green |
| P3 | Scoped DAL: partitioned store, owner column, scoped reads/writes, scoped provider read | T-1..T-11 green at module level |
| P4 | Quarantine `transactions-unscoped.ts` + 12 call-site retargets | T-12 green, full suite green |
| P5 | Route/action/page wiring: ledger page, detail page, 6 actions, export route, MCP tools | structural + action-level tests green |
| P6 | Cross-tenant probe matrix update (`tenant-isolation.probe.test.ts` GAP→PASS) | matrix prints 4 PASS / 1 GAP |
| P7 | Review pass (8 axes) + fixes | every finding either fixed or filed |
| P8 | Evidence + ship docs (report, matrix, ADR-0042, PROGRESS/CHANGELOG/debt) | gates table filled with measured output |

---

## 9. Final gate (measured, not asserted)

| Gate | Verdict |
|---|---|
| Transaction List Isolation | PASS |
| Search Isolation | PASS |
| Detail Isolation | PASS |
| Mutation Isolation | PASS |
| Export Isolation | PASS |
| IDOR/BOLA Tests | PASS |
| Regression | PASS |

**Wave 7A Readiness: READY** — bounded by: `LedgerEntry`/RLS debt **D-26** (Postgres transaction reads
stay refused at the MCP surface until the column lands) and the Wave 7B quarantine still carrying 12
legacy reader call sites. See `WAVE_7A_IMPLEMENTATION_REPORT.md` §7 for what this wave does *not*
cover.
