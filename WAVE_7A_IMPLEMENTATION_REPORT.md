# Wave 7A Implementation Report — Transactions tenant isolation

**Goal:** prove the tenant invariant on **one** vertical slice — Transactions — rather than retrofit 20
data modules. Date 2026-09-12 · Branch `arena/01a095f2-pay-dash` · Follows PR #11 / Wave 6 · Spec
`WAVE_7A_TENANT_ISOLATION_SPEC.md` · Evidence `TRANSACTIONS_TENANT_ISOLATION_MATRIX.md` · ADR-0041.

---

## Headline

| | |
|---|---|
| Invariant | **PROVEN for Transactions** — 8 surfaces × (own-tenant PASS, cross-tenant BLOCKED) |
| Tests added | **136**, all passing — 135 across 6 new files, +1 in the Wave 6 probe |
| Full suite | **1399 passed** / 128 files — baseline was 1263 / 122 |
| Only failing file | `mcp/server.integration.test.ts` — pre-existing, Prisma engines unavailable (identical at baseline) |
| Typecheck | `tsc --noEmit` **clean** |
| Lint | **0 errors**, 40 warnings — exactly the pre-existing D-17 count; zero new warnings |
| Mutation checks | **10/10 gates went red** when their guard was deliberately broken |
| Wave 7A readiness | **READY** (2 bounded residuals, §7) |
| Tenant isolation, whole app | **still CONDITIONAL** — 11 modules are quarantined, not scoped (Wave 7B) |

---

## 1. Final gate table

| Gate | Verdict | Evidence |
|---|---|---|
| Transaction List Isolation | **PASS** | T-1 |
| Search Isolation | **PASS** | T-2 |
| Detail Isolation | **PASS** | T-3, T-7 |
| Mutation Isolation (retry, refund request/approve/reject/execute, create) | **PASS** | T-4, T-5, T-10 |
| Export Isolation | **PASS** | T-6 + 7 route-level HTTP tests |
| IDOR/BOLA Tests | **PASS** | T-3/T-4/T-5/T-7, MCP suite, 10 mutation checks |
| Regression | **PASS** | 1399/1399, one pre-existing red file unchanged |

**Wave 7A Readiness: READY.** `pay-dash` must still not run two tenants' real data through the
*quarantined* surfaces (balance, audit, risk, webhooks, handoff, onboarding, command center, links,
customers, invoices, reports) — Wave 6's standing risk narrows from 20 modules to 11, and the
remaining 11 now **fail closed** instead of leaking.

---

## 2. What was built

| Piece | Module | Tests |
|---|---|---|
| Canonical contract `OrganizationContext` + constructor/predicates + Wave 6 bridge | `domain/tenancy/organization-context.ts` | 12 |
| Tenant-scoped transaction DAL (partitioned store, owner column, scoped reads/writes, scoped provider read) | `server/data/transactions.ts` | 41 (isolation) + 55 (structural) + existing 18 |
| Fail-closed quarantine for the 11 not-yet-scoped readers | `server/data/transactions-unscoped.ts` | T-12 (4) + S-2 |
| Session → tenant seam (strict, no demo fallback once multi-tenant), uniform not-found mapping | `server/services/transaction-organization-context.ts` | 11 |
| Denial sink: ring buffer + `logger.warn` + `TENANT_ISOLATION_DENIED` audit action | `server/services/tenant-denial.ts`, `domain/audit/audit.ts` | asserted inside T-4/T-5/T-7 |
| Ledger page, detail page, 6 server actions, CSV route, dashboard + 2 AI-journal pages, link detail page, link pay action — all tenant-bound | `app/**`, `server/actions/transactions.ts`, `server/actions/links.ts` | route suite (7) + S-3 |
| MCP transaction tools bound to the request's tenant; refusal without one; Postgres transaction readers deleted | `server/mcp/{auth,server,domain-tools,pg-stores}.ts`, `app/api/mcp/route.ts`, `server/dal/ledger.ts` | 9 |
| Wave 6 tripwire inverted into a passing assertion; matrix now prints 5 PASS / 1 GAP | `server/finance/tenant-isolation.probe.test.ts` | 7 |

Signatures that changed (the point of the wave): every transaction read/write now takes
`ctx: OrganizationContext` **first** — `listTransactions`, `getTransaction`, `getTransactionWithSla`,
`getLedgerRows`, `getLedgerMetrics`, `getAnalyticsSeries`, `listRefundsAwaiting`, `createTransaction`,
`refundTransaction`, `retryTransaction`, `retryTransactionWithVersion`, `requestRefund`,
`approveRefund`, `rejectRefund`.

---

## 3. The design, in one paragraph each

**The predicate is at the boundary, not in the UI.** `Transaction` gained an `organizationId` field and
the store became `Map<organizationId, rows>`, so "read everything" is not expressible through the
module's own accessors. A filtered table is a presentational accident; a required first parameter is a
compile-time fact.

**Loud inside, silent outside.** Reads of a foreign id return `∅`; writes throw
`TenantIsolationError` and are audited with the surface name. Result-shaped APIs catch that throw and
answer with exactly what an unknown id gets (`NOT_FOUND`, same string). So an attacker probing ids learns
nothing, while an operator reading the audit log can see the probe. `404`-everywhere was rejected for
writes because silence-without-a-trail cannot distinguish "someone is enumerating ids" from "a teammate
raced this row".

**No demo fallback where it would matter.** Dev/preview keeps its single-tenant demo context (the
dashboard must stay usable without a session, under the existing `AUTH_ENFORCED` policy). But the
resolver refuses that context the moment the store holds a second tenant: browsing as "the demo
tenant" would then be a cross-tenant read. Same rule as the quarantine — a tenant-less context is only
legitimate while there is nothing to be ambiguous about.

**One slice, honestly fenced.** 12 call sites in *other* modules had to keep compiling. Threading a
tenant through all of them is Wave 7B's job (10 modules × their own tests); inventing a default tenant
is the defect this wave removes. So they read through `transactions-unscoped.ts`, which serves rows
only while the store is single-tenant and **throws** naming the surface the moment it is not. The
interim state is "safe for the demo deployment, loud on the first request that could have leaked".

**Contract outlives the contributor.** `S-1` scans every exported function in the DAL and fails on one
without a context (with two exemption lists, each justified: pure formatters, and tenancy *probes* whose
return type must be `number`/`string | null`). `S-2` freezes the quarantine's consumer set so it can only
shrink. `S-3` forbids the transaction production path from importing it. `S-5` keeps the store slot
private and pins the CSV header vocabulary. `S-6` forbids a `prisma.ledgerEntry` transaction read unless
it cites the debt that explains why it cannot be scoped.

---

## 4. Three bugs this wave found in its own work

1. **A create that returned a copy broke a caller — and the test caught it.** I made
   `createTransaction` return `{ ...tx }` for defensive reasons; `recordLinkPayment` mutates the row it
   just created to capture it, so the capture silently vanished (`expected 'PENDING' to be
   'SUCCEEDED'`). Restored the create-API convention (return the stored row; **reads** return copies) and
   documented why. Worth recording because the failure mode was silent data loss on a money row, caught
   only because a *neighbouring* module's test still ran.
2. **A refusal that threw synchronously out of an `await` chain.** `legacyListTransactions()` validated
   the tenant before returning its promise, so `expect(fn()).rejects` — and any caller using
   `.catch()` — saw a synchronous throw instead of a rejection. Made the async form actually `async`;
   the sync readers still throw, because their callers are sync.
3. **A guard that could not fail: `not.toContain("organizationId")`.** The CSV leak check passed while
   `organization_id` (snake_case) sat in the header. Rewrote the assertion against the *header
   vocabulary*. It was still caught by the structural test — but only by one of two nets, and "one net
   is enough" is exactly the reasoning that produces a vacuous gate.

All three were found by running the suite rather than by reading the diff.

---

## 5. Review across the eight axes

| Axis | Finding | Disposition |
|---|---|---|
| **Authorization** | Reads relied on the edge gate only; writes used `requireStrictOrgContext` but then handed the DAL an unscoped id. | Every transaction action now resolves permission **and** tenant in one call; the read path resolves the tenant before touching the store. |
| **IDOR / BOLA** | 8 surfaces addressable by id alone (detail, retry, 4 refund phases, MCP get/refund). | All scope-checked; the two MCP Postgres tools deleted; `server/dal/ledger.ts` refuses every entry point until D-26. |
| **Query scoping** | The provider read called `readTransactions()` with no org → resolved `?? DEFAULT_DEMO_ORG`, i.e. a **live provider's rows for the wrong tenant**. | The org is a required argument of the read, and the response is scope-filtered again after mapping. |
| **Bulk operations** | No bulk mutation exists on transactions; the table's bulk action is a client-side export of already-scoped rows. | **N/A this slice** — verified rather than assumed (`canonical-transactions-table.tsx:158-172`); recorded so 7B re-checks per module. |
| **Export** | `guardExport()` returned the organization and the route discarded it; CSV was cacheable by URL. | Guard's org *is* the predicate; `no-store, private` + `Vary: Cookie`; owner column deliberately excluded from the frozen header. |
| **Analytics metadata** | Aggregates (`getLedgerMetrics`, `getAnalyticsSeries`) were computed process-wide — a leak as a *number*, with no row in sight. Dashboard and both AI-journal prompt builders inherited it. | All scoped, and the AI-journal context blocks (fed to a model) now derive from the tenant's rows. Residual: events carry no tenant dimension and bypass the allowlist → **D-27**. |
| **Cache keys** | The only cache key in the path was the `globalThis` store slot — one slot for all tenants. Pages are `force-dynamic` (no route cache to poison). | The slot is now keyed `(organizationId, id)`; the export artefact is `private, no-store, Vary: Cookie`. `revalidatePath` is still path-scoped — over-invalidates across tenants, never under-invalidates (benign by direction; noted for 7B). |
| **Logging** | Nothing recorded a cross-tenant refusal, so the policy's silent half was invisible. | `TENANT_ISOLATION_DENIED` (new audit action) + structured `logger.warn` + bounded ring buffer; payload restricted to surface/org ids/actor/resource id — **no** customer name, email or amount, asserted by test (a denial is about another tenant's row, so its log line must not describe that row). |

Two further findings that were *not* fixed, on purpose:

- **R-3 probe cost.** `writableRow` scans other partitions to decide whether a missed id belongs to
  somebody else (that is what produces the audit entry). It is O(rows × tenants) on the write-miss path,
  so a scripted id-guesser is cheap-but-not-free. The correct fix is rate limiting the mutation surface —
  already filed as **D-05/D-06** — not a faster leak.
- **R-6 shared MCP credential.** `authorizeMcpRequest` validates one global token; there is no
  per-organization credential to bind a request to. Wave 7A closes the *data* hole (tools refuse without
  a session-derived tenant), but the durable fix is a token→organization mapping. Filed as part of
  **D-26**'s follow-up work in §8.

---

## 6. Evidence

```
Test Files  1 failed | 127 passed (128)
     Tests  1399 passed (1399)          # baseline: 1263 / 122 files
  Typecheck  clean
  Lint       0 errors, 40 warnings (== D-17 baseline; no new warnings)
```

New test inventory: `organization-context.test.ts` 12 · `transactions.tenant-isolation.test.ts` 41 ·
`transactions-structural.test.ts` 55 · `transaction-organization-context.test.ts` 11 ·
`exports/transactions/route.tenant.test.ts` 7 · `mcp/domain-tools.tenant.test.ts` 9 ·
probe file 6 → 7.

The isolation matrix is **printed by the suite** on every run, as in Wave 6, so the report cannot drift
from the code:

```
TENANT ISOLATION MATRIX
  PASS  payment projection store                      composite key (org, id)
  PASS  domain/security/tenant.ts                     explicit scope object
  PASS  read of a foreign id                          null-equivalence
  PASS  server/data/transactions (list/get/rows)      required OrganizationContext + (org, id) partition
  PASS  server/data/transactions detail + retry       read ∅ / write throws
  GAP   server/data/payouts.getPayoutBatches          NONE — single-tenant demo store (D-09 / Wave 7)
```

`tenant-isolation.probe.test.ts` also asserts `gaps.length === 1` **and** that the remaining gap is
payouts — so when Wave 7B lands payouts, the probe goes red until this file is updated. The Wave 6
tripwire (`expect(getLedgerRows.length).toBe(0)`) is now inverted to `toBe(1)` inside a passing test
rather than deleted, so the history of "this gap existed and was closed" stays in the suite.

---

## 7. What this wave does NOT cover

Say it before someone assumes it:

1. **19 of 20 legacy modules are still unscoped.** They are *quarantined and fail-closed*, which is a
   different — stronger — claim than "isolated". Their own cross-tenant tests are Wave 7B's deliverable.
2. **`LedgerEntry` has no tenant column.** Postgres transaction reads are refused (MCP tools and
   `server/dal/ledger.ts`), not scoped. `getBalanceOverviewPostgres` still aggregates that table without a
   predicate — pre-existing, Wave 7B + D-26.
3. **Webhook ingress still writes `organizationId: "unresolved"`.** Untouched.
4. **No RLS.** Postgres row-level security remains the defence-in-depth layer Wave 6 named, blocked on
   the same schema work.
5. **Command Palette entity search does not exist**, so nothing was scoped there; `S-4` exists so the
   day someone adds one it cannot be unscoped.
6. **Playwright E2E was not executed** (D-01: 4 GB sandbox OOMs on the browser). The 5 e2e specs touching
   `/transactions` still assume a single demo tenant; they will need a Wave 7B pass (or a two-tenant
   fixture) before an E2E claim on isolation.
7. **The dev/demo store still seeds one 46-row ledger** for `org_demo`. That is data provisioning, not a
   request default (`S-3` pins the difference to one occurrence inside a marked block).

---

## 8. Handover: the Wave 7B recipe

For each of **Payouts → Refunds → Customers → Ledger → Webhooks → Audit**:

1. Add `organizationId` to the module's row type; partition its store by it
   (`Map<organizationId, rows>`), keeping `globalThis.__kinetic<Module>Store` as the slot so existing
   resets keep working.
2. Make every read/write take `ctx: OrganizationContext` first; delete any process-wide accessor and
   move its callers to `legacyXxx(surface)` **temporarily** — then remove that entry from
   `ALLOWED_UNSCOPED_CONSUMERS` in the same PR (the ratchet expects the list to shrink).
3. Copy the five test shapes: list · search · detail-by-id · mutation · export, plus
   guessed-UUID-equivalence and pagination/sort isolation.
4. Copy `transactions-structural.test.ts` with the module's own exemption lists.
5. Convert that module's `CURRENT GAP` row in the probe into a passing assertion and move the
   `gaps.length` number.

Two files to touch once per module, and nothing else needs re-designing — which is the evidence that the
contract, not the patch, was the deliverable.

**Also for 7B (from this wave's review):** bind MCP tokens to an organization (§5 R-6); add tenant
dimensions to analytics events and route them through `trackEvent` (**D-27**); rate-limit the mutation
surface so denial probing has a cost (**D-05/D-06**); consider a *shrinking* ratchet test for
`revalidatePath` per-tenant invalidation once a second tenant is real.

---

## 9. Deliverables

| Document | Contents |
|---|---|
`WAVE_7A_TENANT_ISOLATION_SPEC.md` | Flow map, 13 gaps with code evidence, canonical contract C-1..C-7, anti-enumeration policy, quarantine design, required tests, plan P0..P8
`TRANSACTIONS_TENANT_ISOLATION_MATRIX.md` | The shipped matrix: 16 surfaces × own/cross verdicts × named tests, negative-path table, 10 mutation checks
`docs/adr/0041-canonical-tenant-scoping.md` | The decision, alternatives rejected, consequences
`TENANT_ISOLATION_REPORT.md` | Wave 6's gate document, updated: transactions closed, remaining rows named
`KNOWN_DEBT_REGISTER.md` | D-26 (LedgerEntry has no tenant column / MCP binding), D-27 (analytics tenant dimension), D-09 annotated
`CHANGELOG.md`, `PROGRESS.md` | Release entry and build-status row
