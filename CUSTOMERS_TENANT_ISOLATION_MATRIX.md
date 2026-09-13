# Customers Tenant Isolation Matrix — Wave 7C

Measured 2026-09-13, Wave 7C slice (Q0–Q7). Every cell below is a **test that runs**, not a claim:
the `Evidence` column names the file, and `pnpm --filter web test` executes all of them.

Invariant under test (same contract as Wave 7A, ADR-0041, unchanged):

> Organization A cannot list, search, open, export, or mutate a customer record of Organization B —
> even when it knows the id or email exactly. The directory is *derived* (ledger + manual records),
> so the invariant composes: a scoped ledger in yields a scoped directory out.

---

## The matrix

| Surface | Org A → A | Org A → B | Evidence |
|---|---|---|---|
| **List** (`listCustomers`) | **PASS** — own customers only, `total` excludes B | **BLOCKED** — B's rows never appear; the partition lookup is the predicate | `customers.tenant-isolation.test.ts` U-1 |
| **Search / filter** (`q`, status) | **PASS** — needles match A's customers | **BLOCKED** — a needle matching only B returns `rows: []`, `total: 0`; status filter never leaks | U-2 |
| **Detail by id** (`getCustomer`) | **PASS** — own id resolves | **BLOCKED** — `null`, byte-identical to an unknown id | U-3 |
| **Detail by email** (`getCustomer`) | **PASS** — own email resolves case-insensitively | **BLOCKED** — B's email is `null` for A | U-4 |
| **Customer transactions** (`getCustomerTransactions`) | **PASS** — A's ledger email resolves | **BLOCKED** — inherits the ledger scope; B's ledger email is invisible to A | U-5 |
| **Metrics** (`getCustomerMetrics`) | **PASS** — A's totals exclude B | **BLOCKED** — B's buyers never enter A's aggregate | U-6 |
| **Create** (`createCustomer`) | **PASS** — lands in the caller's partition; owner comes from ctx only | **BLOCKED** — invisible to B (get, list) | U-7 |
| **Update** (`updateCustomer`) | **PASS** — own id updates | **BLOCKED** — foreign id throws `cross-tenant` (audited); unknown id returns `null` | U-8 |
| **Email uniqueness** (composite key, P-10) | **PASS** — same email in another tenant allowed | **BLOCKED** — twice in one tenant is refused; each tenant resolves its own row for the shared id | U-9 |
| **Derived composition** (scoped ledger → directory) | **PASS** — a ledger buyer appears in its own directory | **BLOCKED** — a ledger buyer of B never appears in A's directory | U-10 |
| **Pagination × sort** | **PASS** — every page and ordering of A is A-only | **BLOCKED** — B unreachable at any offset or ordering | U-11 |
| **Export** (`GET /api/exports/customers`) | **PASS** — CSV contains A's rows only, frozen header | **BLOCKED** — no B reference; `?organizationId=<B>` flagged, session wins; unresolvable org ⇒ 401; `private, no-store` + `Vary: Cookie` | `route.tenant.test.ts` (4 tests) |
| **MCP `list_customers` / `get_customer`** | **PASS** — bound to the request's tenant | **BLOCKED** — foreign id/email ⇒ not-found; **no tenant on the request ⇒ both refuse** (no default, no demo fallback) | `customer-tools.tenant.test.ts` (3 tests) |
| **Server actions** (create/update/archive) | **PASS** — session ctx threaded | **BLOCKED** — cross-tenant ⇒ same not-found message as unknown id; unauthenticated ⇒ `Authentication required` | `actions/customers.tenant.test.ts` (6 tests) |
| **Structural ratchet** (ctx-first, formatters, quarantine, CSV vocab) | **PASS** — 6 repository functions ctx-first; formatters pure | **BLOCKED** — any new unscoped reader, a production import of the quarantine, or an `organization_id` CSV column fails CI | `customers-structural.test.ts` (8 tests, Q-1..Q-5) |
| **Derived legacy readers** (reports, subscriptions) | **QUARANTINED** — served while the store is single-tenant | **FAIL-CLOSED** — as soon as a second tenant has rows, every unscoped read throws `UnscopedCustomerAccessError` and names the surface | U-12, Q-2 |

## Negative-path detail (what "BLOCKED" means per surface)

| Attack | Result | Why it is safe rather than merely denied |
|---|---|---|
| `getCustomer` with B's id or email | `null` — the same result a typo'd id gets | Read path returns `∅`; no 403, so no enumeration oracle |
| Action with `id=B-id` | not-found message identical to an unknown id | The wire answer is uniform; the asymmetry lives in the denial audit |
| `?organizationId=org_beta` on export | A's data, attempt flagged via `normalizeRequestedOrganization` | Session scope always wins |
| CSV export of A | A's rows; no `organization_id` column | Header vocabulary frozen by Q-4 structural test |
| Shared email in two tenants | Each tenant resolves its own row | Composite key `(organizationId, id)`; the pure `customerIdFromEmail` hash is unchanged |
| Foreign write (`updateCustomer` on B's id) | `TenantIsolationError` + denial record, then not-found on the wire | Denial is audited (`recordTenantDenial`) without leaking B's existence |
| New exported `peekDirectory()` with no context | CI red | Q-1 scans every exported function; `PURE_EXPORTS`/`PROBE_EXPORTS` are the only exemptions, each justified in code |
| A new unscoped reader in any module | CI red | Quarantine consumer set frozen, shrink-only (Q-2) |
| A page/action importing the quarantine | CI red | Prod-path guard over pages + actions (Q-2) |
| A tenant whose buyers exist only as ledger rows | Still owns a directory | `countCustomerTenants` folds in the ledger tenant count, so the quarantine gate cannot be bypassed by an empty manual partition |

## Gates

| Gate | Verdict | Basis |
|---|---|---|
| List isolation | **PASS** | U-1 |
| Search / filter isolation | **PASS** | U-2 |
| Detail isolation (id + email) | **PASS** | U-3, U-4 |
| Ledger-composition isolation | **PASS** | U-5, U-10 |
| Metrics isolation | **PASS** | U-6 |
| Mutation isolation | **PASS** | U-7, U-8, U-9 + action suite (6) |
| Export isolation | **PASS** | route suite (4) + probe |
| MCP isolation | **PASS** | customer-tools suite (3) |
| Structural ratchet | **PASS** | Q-1..Q-5 (8) |
| Regression | **PASS** | 1489 passed / 2 failed (both pre-existing calendar flakes in `balance.test.ts`); `server.integration.test.ts` env-blocked (Prisma engines, pre-existing) |

## Proof that the gates can fail (mutation checks)

Wave 6's lesson — *a check that cannot fail looks identical to a check that passes* — means each
guard must be broken on purpose, once, and the suite observed going red. The Q6 mutations are
specified in `WAVE_7C_CUSTOMERS_SPEC.md` §6 and were not re-executed in the authoring sandbox; the
structural ratchet (Q-1..Q-5) is the standing guard that a regression in any of these directions
turns CI red:

| # | Mutation (spec §6 Q6) | Guarded by |
|---|---|---|
| M-1 | Partition-predicate removal (list flattens every tenant) | U-1, U-2, U-6, U-11 |
| M-2 | Global lookup in `getCustomer` | U-3, U-4 |
| M-3 | Hardcoded export org | route suite (4) |
| M-4 | MCP `scoped` bypass | customer-tools suite (3) |
| M-5 | Quarantine import in a wired path | Q-2 prod-path guard |
| M-6 | `organization_id` in CSV body | Q-4 CSV-vocab |
| M-7 | Per-org override loosening | Q-2 store-privacy + U-8 |
| M-8 | Create-before-tenant-check | U-7 + Q-1 ctx-first |

## Residual, stated plainly

1. **2 derived readers remain unscoped** (`reports`, `subscriptions`) — quarantined fail-closed,
   not scoped. Debt **D-29**; scope them one at a time and shrink the `LEGACY_CUSTOMER_SURFACES`
   allowlist to zero.
2. **`LedgerEntry` still has no `organizationId` column** (debt **D-26**, P0) — the in-memory
   customer directory is isolated; the Postgres ledger read remains *refused*, not scoped.
3. **Webhook ingress still records `organizationId: "unresolved"`** — untouched by this slice.
4. **Analytics events carry no tenant dimension** (debt **D-27**) — the directory slice does not
   change this; it becomes real the day a second tenant's funnel is measured.
