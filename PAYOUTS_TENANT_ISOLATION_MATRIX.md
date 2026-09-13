# Payouts Tenant Isolation Matrix — Wave 7B

Measured 2026-09-13 on `main`, Wave 7B slice (Q2–Q7). Every cell below is a **test that runs**, not a claim:
the `Evidence` column names the file, and `pnpm --filter web test` executes all of them.

Invariant under test (same contract as Wave 7A, ADR-0041, unchanged):

> Organization A cannot read, search, export, open the detail of, or mutate a payout batch belonging to
> Organization B — even when it knows the batch id exactly. A foreign id is indistinguishable from an
> unknown id on the wire; the asymmetry lives only in the server-side denial audit.

---

## The matrix

| Surface | Org A → A | Org A → B | Evidence |
|---|---|---|---|
| **List** (`listBatches`) | **PASS** — own batches only, `total` excludes B | **BLOCKED** — B's batches never appear; partition lookup is the predicate, the owner filter is the second layer | `payouts.tenant-isolation.test.ts` U-1 |
| **Search / filter** (`q`, status, range) | **PASS** — needles match A's batches | **BLOCKED** — needles matching only B return `rows: []`, `total: 0` | U-2 |
| **Detail by ID** (`getBatch`, `getPayoutBatch`) | **PASS** — own id resolves | **BLOCKED** — `null`, byte-identical to an unknown id | U-3, U-10 |
| **Approve / cancel** (`approveBatch`, `cancelBatch`) | **PASS** — own batch transitions | **BLOCKED** — throws `cross-tenant` internally, answers not-found on the wire; B's `status` unchanged | U-4, U-5 |
| **Batch retry** (`retryBatchFailures`) | **PASS** — own failed recipients requeue | **BLOCKED** — not-found; B's recipient states unchanged | U-6 |
| **Recipient retry** (`retryRecipient`) | **PASS** — own recipient retries | **BLOCKED** — inherits the batch scope; a foreign batch id refuses before touching the recipient | U-7 |
| **Timeline** | **PASS** — own batch history | **BLOCKED** — foreign batch timeline is unreachable (same null as unknown id) | U-8 |
| **Create** (`createBatch`) | **PASS** — lands in the caller's partition, carries its owner; owner comes from ctx only | **BLOCKED** — invisible to B (list, detail, count) | U-9 |
| **Overview** (`getPayoutsOverview`) | **PASS** — A's totals = A's batches only | **BLOCKED** — B's amounts never enter A's aggregate | U-11 |
| **Pagination × sort** | **PASS** — every page A-only | **BLOCKED** — B unreachable at any offset or ordering; out-of-range clamps inside A | U-12 |
| **Dual-control** (creator ≠ approver) | **PASS** — same-actor approval refused | **BLOCKED + ORDERED** — a same-actor cross-tenant approve throws `cross-tenant`, never the dual-control error (tenant check runs first; U-13b pins the order) | U-13, U-13b |
| **Export** (`GET /api/exports/payouts`, `[id]`) | **PASS** — CSV contains A's batches only, frozen header, N lines | **BLOCKED** — no B reference; `?organizationId=<B>` flagged, session scope wins; unresolvable org ⇒ 401 with no body; `private, no-store` + `Vary: Cookie` | `route.tenant.test.ts` (5 tests), probe § |
| **MCP `list_payout_batches` / `get_payout_batch` / `get_payouts_overview`** | **PASS** — bound to the request's tenant (reuses the `registerDomainTools` organization param) | **BLOCKED** — foreign id ⇒ not-found; **no tenant on the request ⇒ all three refuse** (no default, no demo fallback, no quarantine) | `payout-tools.tenant.test.ts` (4 tests) |
| **Server actions** (create/approve/cancel/retry/recipient-retry/withdraw) | **PASS** — session ctx threaded, actor recorded | **BLOCKED** — cross-tenant ⇒ same not-found message as unknown id; unauthenticated withdraw ⇒ `Authentication required` | `actions/payouts.tenant.test.ts` (8 tests) |
| **Settings / bank accounts** (per-org, P-6) | **PASS** — each org sees its own accounts | **BLOCKED** — account numbers are direct money: `listBankAccounts`, `getBankAccount`, `setDefaultBankAccount`, `getPayoutSettings`, `updatePayoutSettings` all take ctx first | structural ctx-first |
| **Derived legacy readers** (balance, audit, command-center, handoff, finance-snapshot, reports) | **QUARANTINED** — served while the store is single-tenant | **FAIL-CLOSED** — as soon as a second tenant has rows, every unscoped read throws `UnscopedPayoutAccessError` and names the surface | U-15, structural Q-2 |
| **Former quarantine users** (exports-payouts, mcp) | **SCOPED in Q4** — no caller left | **SHRUNK in Q7** — both surfaces removed from `LEGACY_PAYOUT_SURFACES` (6 remain); the consumer set may only shrink | structural Q-2 |

## Negative-path detail (what "BLOCKED" means per surface)

| Attack | Result | Why it is safe rather than merely denied |
|---|---|---|
| `GET /payouts/[B-id]` | `notFound()` — the same page a typo'd id renders | Read path returns `∅`; no 403, so no enumeration oracle |
| Action with `id=B-id` | not-found message identical to an unknown id | The wire answer is uniform; the asymmetry lives in the audit log |
| Guessed id | identical to the above | Object-level null-equivalence, asserted |
| `?organizationId=org_beta` on export | A's data, attempt flagged via `normalizeRequestedOrganization` | Session scope always wins |
| CSV export of A | A's rows; no `organization_id` column | Header vocabulary frozen by structural CSV-vocab test |
| Same-actor cross-tenant approve | `cross-tenant` (U-13b) | Tenant check precedes dual-control — error precedence is tested, not assumed |
| Batch with empty owner (orphan) | Invisible to every tenant | Scope filter compares row owner to resolved context; a defect yields unreachable data, not shared data |
| New exported `peekPayouts()` with no context | CI red | Structural ctx-first scan; pure formatters are the only exemptions |
| A new unscoped reader in any module | CI red | Quarantine consumer set frozen, shrink-only |
| A page/action importing the quarantine | CI red | Prod-path guard over pages + actions |
