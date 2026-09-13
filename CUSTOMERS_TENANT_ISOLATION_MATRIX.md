# Customers Tenant Isolation Matrix — Wave 7C

Measured 2026-09-13 on `wave-7c-q6-q7`, Wave 7C slice (Q1–Q7). Every cell below is a **test that runs**, not a claim:
the `Evidence` column names the file, and `pnpm --filter web test` executes all of them.

Invariant under test (same contract as Wave 7A/7B, ADR-0041/0042, unchanged):

> Organization A cannot list, search, open, export, or mutate a customer record of
> Organization B — even knowing the id or email exactly. The directory is *derived*
> (ledger + manual records), so the invariant composes: scoped ledger in, scoped
> directory out. A foreign id is indistinguishable from an unknown id on the wire;
> the asymmetry lives only in the server-side denial audit.

Design decision (spec P-10): `customerIdFromEmail` is a pure global email hash —
the same email in two tenants yields the same `cus_` id shape. The key is the
composite `(organizationId, id)`: each tenant resolves its own row (same pattern
as 7A `txn_shared`). Manual store + overrides are partitioned per org.

---

## The matrix

| Surface | Org A → A | Org A → B | Evidence |
|---|---|---|---|
| **List** (`listCustomers`) | **PASS** — own customers only, `total` excludes B | **BLOCKED** — B's customers never appear; partition lookup is the predicate, the scoped ledger is the second layer | `customers.tenant-isolation.test.ts` U-1 |
| **Search / filter** (`q`, status) | **PASS** — needles match A's customers | **BLOCKED** — needle matching only B returns `rows: []`, `total: 0`; status filter never leaks | U-2 (2 tests) |
| **Detail by ID** (`getCustomer`) | **PASS** — own id resolves | **BLOCKED** — `null`, byte-identical to an unknown id | U-3 |
| **Detail by email** (`getCustomer`) | **PASS** — own email resolves case-insensitively | **BLOCKED** — B's email is `null` for A | U-4 |
| **Customer transactions** (`getCustomerTransactions`) | **PASS** — own ledger email returns its rows | **BLOCKED** — A's ledger email is invisible to B (inherits the 7A ledger scope) | U-5 |
| **Metrics** (`getCustomerMetrics`) | **PASS** — A's totals = A's customers only | **BLOCKED** — B's buyers never inflate A's counts | U-6 |
| **Create** (`createCustomer`) | **PASS** — lands in the caller's partition, owner from ctx only | **BLOCKED** — invisible to B (list, detail) | U-7 |
| **Update** (`updateCustomer`) | **PASS** — own id applies overrides | **BLOCKED** — foreign id throws `cross-tenant` internally, answers not-found on the wire; B's row unchanged; unknown id ⇒ `null` | U-8 |
| **Email uniqueness** (composite key) | **PASS** — same email in the other tenant is a different row, each resolves its own name | **BLOCKED** — twice in one tenant is refused (`already exists`) | U-9 |
| **Derived composition** (7A × 7C) | **PASS** — B's ledger buyer appears in B's directory as `source: "ledger"` | **BLOCKED** — never appears in A's directory | U-10 |
| **Pagination × sort** | **PASS** — every page A-only, all four orderings | **BLOCKED** — B unreachable at any offset or ordering | U-11 |
| **Export** (`GET /api/exports/customers`) | **PASS** — CSV contains A's customers only, frozen header, N lines | **BLOCKED** — no B reference; `?organizationId=<B>` flagged, session scope wins; unresolvable org ⇒ 401 with no body; `private, no-store` + `Vary: Cookie` | `route.tenant.test.ts` (4 tests), probe § |
| **MCP `list_customers` / `get_customer`** | **PASS** — bound to the request's tenant (reuses the `registerDomainTools` organization param) | **BLOCKED** — foreign id/email ⇒ not-found; **no tenant on the request ⇒ both refuse** (no default, no demo fallback, no quarantine) | `customer-tools.tenant.test.ts` (3 tests) |
| **Server actions** (create/update) | **PASS** — session ctx threaded via `requireCustomerOrganizationContext` | **BLOCKED** — cross-tenant ⇒ same not-found message as unknown id | wired in Q2 (actions use the pre-existing `customer.read` permission; no `customer.create`/`update` permission exists in `roles.ts`) |
| **Quarantine gate + invalid ctx** | **PASS** — single-tenant demo still served | **FAIL-CLOSED** — multi-tenant unscoped reads throw `UnscopedCustomerAccessError` naming the surface; blank ctx never becomes a tenant | U-12 (2 tests) |
| **Derived legacy readers** (subscriptions, reports) | **QUARANTINED** — served while the store is single-tenant | **FAIL-CLOSED** — as soon as a second tenant has rows, every unscoped read throws and names the surface | U-12, structural Q-2 |
| **Former single-tenant world** (exports-customers, mcp, pages, panel, actions) | **SCOPED in Q2** — no wired caller left | **SHRUNK at birth** — the allowlist seeded at 2 (`reports`, `subscriptions`); the consumer set may only shrink | structural Q-2 |

## Negative-path detail (what "BLOCKED" means per surface)

| Attack | Result | Why it is safe rather than merely denied |
|---|---|---|
| `GET /customers/[B-id]` | `notFound()` — the same page a typo'd id renders | Read path returns `∅`; no 403, so no enumeration oracle |
| Action with `id=B-id` | not-found message identical to an unknown id | The wire answer is uniform; the asymmetry lives in the audit log |
| Guessed id or email | identical to the above | Object-level null-equivalence, asserted (U-3, U-4) |
| `?organizationId=org_beta` on export | A's data, attempt flagged via `normalizeRequestedOrganization` | Session scope always wins |
| CSV export of A | A's rows; no `organization_id` column | Header vocabulary frozen by structural Q-4 (Q-3 purity pins it twice) |
| Same email registered in both tenants | two rows, same id shape, different owners | Composite key — asserted by U-9, the P-10 decision pin |
| Update of B's id from A | `cross-tenant` internally, not-found on the wire | Write path throws + audits; U-8 pins the throw, the probe pins the audit |
| New exported `peekCustomers()` with no context | CI red | Structural ctx-first scan (Q-1); pure formatters + tenancy probes are the only exemptions, each justified in-file |
| A new unscoped reader in any module | CI red | Quarantine consumer set frozen, shrink-only (Q-2) |
| A page/action importing the quarantine | CI red | Prod-path guard over pages + actions + panel + route + MCP (Q-2) |
| Orphan manual record with empty owner | Invisible to every tenant | Scope resolves from ctx, never from the row; a defect yields unreachable data, not shared data |
