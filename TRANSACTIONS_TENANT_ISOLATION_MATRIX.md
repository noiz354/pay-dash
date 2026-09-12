# Transactions Tenant Isolation Matrix — Wave 7A

Measured 2026-09-12 on `arena/01a095f2-pay-dash`. Every cell below is a **test that runs**, not a claim:
the `Evidence` column names the file, and `pnpm --filter web test` executes all of them.

Invariant under test:

> Organization A cannot read, search, export, open the detail of, or mutate a transaction belonging to
> Organization B — even when it knows the resource id exactly.

---

## The matrix

| Surface | Org A → A | Org A → B | Evidence |
|---|---|---|---|
| **List** (`listTransactions`) | **PASS** — 3 of 3 own rows, `total` excludes B | **BLOCKED** — B's references never appear; an empty tenant gets `[]`, not the demo ledger | `transactions.tenant-isolation.test.ts` T-1 |
| **Search / filter** (`q`, status, channel, range, refundState, sla) | **PASS** — needles match A's rows | **BLOCKED** — 4 distinct needles that match only B return `rows: []`, `total: 0`; a needle shared by both still returns only A | T-2 |
| **Refund queue** (`listRefundsAwaiting`) | **PASS** — A sees its own awaiting-approval row | **BLOCKED** — B's queue item is absent from A's queue (this is a *mutation affordance*, so the leak class is worse, not better) | T-2 |
| **Detail by ID** (`getTransaction`, `getTransactionWithSla`) | **PASS** — own id resolves | **BLOCKED** — `null`, byte-identical to an unknown id; a UUID that exists nowhere is indistinguishable from one that exists in B | T-3, T-7 |
| **Retry** (`retryTransaction`, `retryTransactionWithVersion`) | **PASS** — own row → `PROCESSING` | **BLOCKED** — throws `CROSS_TENANT_WRITE` internally, answers `NOT_FOUND` on the wire; B's `status`, `updatedAt` and `events` unchanged | T-4 |
| **Refund initiation** (`requestRefund`) | **PASS** — own row → `AWAITING_APPROVAL` | **BLOCKED** — `NOT_FOUND`, no handoff opened, B's `refundState` stays `NONE` | T-5 |
| **Refund approval / rejection** (`approveRefund`, `rejectRefund`) | **PASS** — money moves only for a distinct approver | **BLOCKED** — `NOT_FOUND`; `refundedAmount` on B unchanged | T-5 |
| **Single-step refund** (`refundTransaction`) | **PASS** | **BLOCKED** — throws; no money moves | T-5 |
| **Create** (`createTransaction`) | **PASS** — lands in the caller's partition, carries its owner | **BLOCKED** — invisible to B (list, detail, count) | T-10 |
| **Export** (`GET /api/exports/transactions`) | **PASS** — CSV contains A's rows only, header + N lines | **BLOCKED** — no B reference id, no B email; `?organizationId=<B>` is ignored and flagged; unresolvable org ⇒ 401 with no body | `route.tenant.test.ts` (7 tests), T-6 |
| **Metrics / analytics** (`getLedgerMetrics`, `getAnalyticsSeries`) | **PASS** — A's totals = A's 3 rows (3 300 000) | **BLOCKED** — B's 27 300 000 never enters A's aggregate; per-tenant series, no cross-tenant double count | T-9 |
| **Provider read path** (`readTransactions(org)`) | **PASS** — asked for, and attributed to, the caller's org | **BLOCKED** — called with `undefined`? never; provider rows are scope-filtered again after mapping, so an adapter that ignored the org still cannot place a row in the wrong tenant | T-11 |
| **Pagination × sort** | **PASS** — all 5 pages of A's traversal are A-only, 25 unique ids | **BLOCKED** — B unreachable at any offset or ordering; every `sort`/`direction` combination is A-only; an out-of-range page clamps inside A | T-8 |
| **MCP `list_transactions` / `get_transaction` / `refund_transaction`** | **PASS** — bound to the request's tenant | **BLOCKED** — foreign id ⇒ not-found; **no tenant on the request ⇒ all three refuse** (no default, no demo fallback); `dataSource=postgres` refused until D-26 | `domain-tools.tenant.test.ts` (9 tests) |
| **Command Palette / entity search** | **N/A — no data source** | **N/A** | `command-palette.tsx` is a projection of `NAV_SECTIONS` with no import of `@/server/**`; `S-4` fails the build if an entity search ever adds one |
| **Derived legacy readers** (balance, audit, risk, webhooks, handoff, onboarding, command-center, links, customers, invoices, reports) | **QUARANTINED** — served while the store is single-tenant | **FAIL-CLOSED** — as soon as a second tenant has rows, every unscoped read throws and names the surface | T-12, `S-2` |

## Negative-path detail (what "BLOCKED" means per surface)

| Attack | Result | Why it is safe rather than merely denied |
|---|---|---|
| `GET /transactions/[B-id]` | `notFound()` — the same page a typo'd id renders | Read path returns `∅`; no 403, so no enumeration oracle |
| `POST` retry with `id=B-id` | `{ status:"error", message:"Transaction not found." }` — identical to an unknown id | The wire answer is uniform; the asymmetry lives in the audit log |
| Refund request with `id=B-id` | `{ ok:false, code:"NOT_FOUND", message:"Transaction not found." }` | Same code **and** same message as a nonexistent id (asserted, T-7) |
| Guessed UUID (`0f4c1a37-…`) | identical to the above | `expect(foreign).toBe(unknown)` — object-level null-equivalence, not "both were empty-ish" |
| `?organizationId=org_beta` on the ledger or export | A's data, and a `TENANT_ISOLATION_DENIED`-style flag for the attempt | Session scope always wins (`resolveRequestedScope`) |
| CSV export of A | A's rows; no `organization_id` column | Header vocabulary is frozen by `S-5` + asserted in T-6, so tenancy metadata cannot ride out in a file |
| A row whose owner field is empty (orphan) | Invisible to every tenant | The scope filter compares the row's owner to the resolved context; a defect produces *unreachable data*, not shared data |
| `id` present in both tenants (`txn_shared`) | Each tenant resolves to its own row | Composite key `(organizationId, id)`; identical ids, different owners, asserted amounts differ |
| New exported `peekLedger()` with no context | CI red | `S-1` scans every exported function; `PURE_EXPORTS`/`GATE_EXPORTS` are the only exemptions and each is justified in code |
| A new unscoped reader in any module | CI red | `S-2` — the consumer set is frozen and may only shrink |
| A page importing the quarantine | CI red | `S-3` — no transaction production path may depend on the unscoped accessor |
| A `prisma.ledgerEntry` transaction read | CI red unless it cites D-26 | `S-6` — the table has no `organizationId`; refusal is the only legal state |

## Gates

| Gate | Verdict | Basis |
|---|---|---|
| Transaction List Isolation | **PASS** | T-1 (3 tests) |
| Search Isolation | **PASS** | T-2 (4 tests, 10 needles/filter combos) |
| Detail Isolation | **PASS** | T-3 (3 tests) + T-7 (3 tests) |
| Mutation Isolation | **PASS** | T-4 (4) + T-5 (3) + T-10 (2) |
| Export Isolation | **PASS** | T-6 (2) + route suite (7) |
| IDOR/BOLA Tests | **PASS** | T-3/T-4/T-5/T-7 + MCP suite; 10 mutation checks proved they can go red |
| Regression | **PASS** | 1399 passed / 128 files (baseline 1263 / 122); the only red file is the pre-existing `mcp/server.integration.test.ts` (Prisma engines unavailable) |

## Proof that the gates can fail (mutation checks)

Wave 6's lesson — *a check that cannot fail looks identical to a check that passes* — so each guard was
broken on purpose, once, and the suite was observed going red. Patches were reverted immediately.

| # | Mutation introduced | Result |
|---|---|---|
| M-1 | `scopedRows()` ignores the context and flattens every partition | **19 failed** / 41 |
| M-2 | `getTransaction()` drops the ownership comparison | **11 failed** / 41 |
| M-3 | `writableRow()` stops probing for a foreign owner (writes unguarded) | **5 failed** / 41 |
| M-4 | Export route uses a hardcoded org instead of the guard's | **5 failed** / 6 |
| M-5 | Add `export function peekLedger()` with no context | structural **2 failed** / 57 |
| M-6 | Export route imports the quarantine module | structural **3 failed** / 55 |
| M-7 | Quarantine gate removed (always answers with the demo tenant) | **3 failed** / 41 |
| M-8 | `toCsv()` gains an `organization_id` column | behavioural **1 failed** + structural **1 failed** |
| M-9 | A page imports `seedDemoLedgerForOrganization` | structural **1 failed** / 55 |
| M-10 | The quarantine loses its `server-only` barrier | structural **1 failed** / 55 |

Ten mutations, ten reds. No gate in this wave is decorative — including the two that guard
this wave's own seams (the demo seeder, the `server-only` barrier) from being reached by a request.

## Residual, stated plainly

1. **`LedgerEntry` has no `organizationId` column** (debt **D-26**). The in-memory path is isolated; the
   Postgres transaction read is *refused*, not scoped. Restoring it requires column + composite key +
   RLS, and the refusal is what keeps the interim honest.
2. **11 modules still read the ledger unscoped** (the quarantine). They are safe only under the
   single-tenant assumption, which the gate now enforces at runtime instead of in prose. Wave 7B removes
   them one at a time.
3. **Webhook ingress still records `organizationId: "unresolved"`** — untouched by this slice, listed in
   Wave 6's report, still true.
4. **Analytics events carry no tenant dimension** (finding R-5, debt **D-27**): ledger events are emitted
   through `lib/analytics.ts#track()` rather than the allowlisted `trackEvent()`, so a multi-tenant
   deployment mixes per-tenant funnel metadata in one stream. No row content or resource id is sent, so
   this is not a data leak — it is a metadata-granularity gap that becomes real on the same day the
   second tenant does.
