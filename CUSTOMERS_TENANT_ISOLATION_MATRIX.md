# Customers Tenant Isolation Matrix — Wave 7C

Measured 2026-09-13 on `arena/01a09adf-pay-dash`, Wave 7C slice (Q1–Q7). Every cell below is a **test that runs**, not a claim:
the `Evidence` column names the file, and `pnpm --filter web test` executes all of them.

Invariant under test (same contract as Wave 7A/7B, ADR-0041/0042, unchanged):

> Organization A cannot list, search, open, export, or mutate a customer record of Organization B —
> even knowing the id or email exactly. The customer directory is *derived* (ledger + manual records),
> so the invariant composes: scoped ledger in, scoped directory out.

---

## The matrix

| Surface | Org A → A | Org A → B | Evidence |
|---|---|---|---|
| **List** (`listCustomers`) | **PASS** — own customers only, `total` excludes B | **BLOCKED** — B's rows never appear; partition lookup is the predicate, scoped ledger is the second layer | `customers.tenant-isolation.test.ts` U-1 |
| **Search / filter** (`q`, `status`) | **PASS** — needles match A's customers | **BLOCKED** — needles matching only B return `rows: []`, `total: 0` | U-2 |
| **Detail by ID** (`getCustomer` id) | **PASS** — own id resolves | **BLOCKED** — `null`, byte-identical to unknown id | U-3 |
| **Detail by email** (`getCustomer` email) | **PASS** — own email case-insensitively | **BLOCKED** — `null`, byte-identical to unknown email | U-4 |
| **Customer transactions** (`getCustomerTransactions`) | **PASS** — own ledger email returns rows | **BLOCKED** — B's ledger email returns `[]` | U-5 |
| **Metrics** (`getCustomerMetrics`) | **PASS** — A's totals = A's customers only | **BLOCKED** — B's customers never inflate A's aggregates | U-6 |
| **Create** (`createCustomer`) | **PASS** — lands in caller's partition, owner from ctx only | **BLOCKED** — invisible to B (list, detail) | U-7 |
| **Update** (`updateCustomer`) | **PASS** — own id updates via overrides | **BLOCKED** — foreign id throws `cross-tenant` internally, answers not-found on wire; unknown id ⇒ `null` | U-8 |
| **Per-tenant email uniqueness** (composite key `organizationId,id`, spec P-10) | **PASS** — same email in other tenant is a different row | **BLOCKED** — duplicate in own tenant throws `already exists`; cross-tenant duplicate allowed | U-9 |
| **Derived composition** (scoped ledger in, scoped directory out) | **PASS** — B's ledger buyer appears in B's directory | **BLOCKED** — never appears in A's directory (U-10) | U-10 |
| **Pagination × sort** (`recent`/`ltv`/`name`/`added` + `page`) | **PASS** — every page/sort of A is A-only | **BLOCKED** — B unreachable at any offset or ordering | U-11 |
| **Quarantine + invalid ctx** (fail-closed, surface-naming) | **PASS** — valid ctx + seeded store serves | **BLOCKED** — `legacyListCustomers("subscriptions")` throws `UnscopedCustomerAccessError` once >1 tenant; `parseOrganizationContext("   ")` throws | U-12 |
| **Export** (`GET /api/exports/customers`) | **PASS** — CSV contains A's customers only, frozen header | **BLOCKED** — no B reference; `?organizationId=<B>` flagged, session scope wins; unresolvable org ⇒ 401 with no body; `private, no-store` + `Vary: Cookie` | `route.tenant.test.ts` (4 tests) |
| **MCP `list_customers` / `get_customer`** | **PASS** — bound to request's tenant (reuses `registerDomainTools` organization param) | **BLOCKED** — foreign id/email ⇒ not-found; **no tenant ⇒ both refuse** (no default, no demo fallback) | `customer-tools.tenant.test.ts` (3 tests) |
| **Server actions** (`createCustomerAction`, `updateCustomerAction`, `archiveCustomerAction`) | **PASS** — session ctx via `requireCustomerOrganizationContext("customer.read")`, actor recorded | **BLOCKED** — cross-tenant ⇒ same not-found message as unknown id (`"That customer no longer exists."`); tenant denial audited | `actions/customers.ts` + `customer-organization-context.ts` (ctx-first wiring) |
| **CSV vocabulary + pure formatters** (`customersToCsv`, `customerIdFromEmail`) | **PASS** — header frozen without tenancy columns; pure, deterministic | **BLOCKED** — adding `organization_id` fails Q-4; formatters touch no store/ctx (Q-3) | `customers-structural.test.ts` Q-3, Q-4 |
| **Quarantine derived readers** (`reports`, `subscriptions`) | **QUARANTINED** — served while store is single-tenant (demo seeded) | **FAIL-CLOSED** — as soon as a second tenant has customers, every unscoped read throws `UnscopedCustomerAccessError` naming the surface | U-12, structural Q-2 |
| **Probes + store privacy** (`countCustomerTenants`, `soleCustomerOrganizationId`, `__kineticCustomerStore`) | **PASS** — probes answer tenancy metadata, never rows; store slot private to DAL+quarantine+tests | **BLOCKED** — probes compose on 7A (`countLedgerTenants`); quarantine fails closed on `>1` | structural Q-2, Q-5 |

## Negative-path detail (what "BLOCKED" means per surface)

| Attack | Result | Why it is safe rather than merely denied |
|---|---|---|
| `GET /customers/[B-id]` | `notFound()` — same page a typo'd id renders | Read path returns `∅`; no 403, so no enumeration oracle |
| Action with `id=B-id` | not-found message identical to unknown id (`"That customer no longer exists."`) | Wire answer uniform; asymmetry lives in audit log (`CROSS_TENANT_WRITE`, `recordTenantDenial`) |
| Guessed `cus_` id | identical to above (null) | Object-level null-equivalence asserted (U-3 / U-8) |
| `?organizationId=org_beta` on export | A's data, attempt flagged via `normalizeRequestedOrganization` | Session scope always wins; `exports-customers.scope-override` denied |
| CSV export of A | A's rows; no `organization_id` column | Header vocabulary frozen by structural Q-4 |
| Same email in both tenants | Two rows, same `cus_` id shape, different `organizationId` | Composite key `(organizationId, id)` per spec P-10; `customerIdFromEmail` is pure global hash, partition is the key |
| Duplicate email in own tenant | `already exists` error | Per-tenant uniqueness enforced via `getCustomer(ctx,email)` |
| Manual override of foreign id | `TenantIsolationError` thrown, audited | `updateCustomer` checks `customerOwnedByAnotherTenant` before null |
| Batch with empty owner (orphan) | Invisible to every tenant | Partition filter + `readPartition` compares row owner to resolved context; defect yields unreachable, not shared |
| New exported `peekCustomers()` with no context | CI red | Structural Q-1 ctx-first scan; `PURE_EXPORTS` and `PROBE_EXPORTS` are the only exemptions |
| A new unscoped reader in any module | CI red | Quarantine `LEGACY_CUSTOMER_SURFACES` frozen, shrink-only (Q-2) |
| A page/action importing the quarantine | CI red | Prod-path guard over `customers/page.tsx`, `[id]/page.tsx`, `customer-transactions-panel.tsx`, `actions/customers.ts`, `exports/customers/route.ts`, `domain-tools.ts` |
| Export without resolved org | 401 `Unauthorized` with `Cache-Control: no-store` | `UNRESOLVED_ORGANIZATION_ID` sentinel refused, never exported |

## Quarantine snapshot (Wave 7C, shrink-only)

`LEGACY_CUSTOMER_SURFACES = ["reports", "subscriptions"]` in `server/data/customers-unscoped.ts`.

- **Allowed consumers (frozen):**
  - `app/[locale]/reports/builder/page.tsx`
  - `app/[locale]/subscriptions/page.tsx`
- **Wired paths that must NOT import the quarantine (prod-path guard):**
  `app/[locale]/customers/page.tsx`, `app/[locale]/customers/[id]/page.tsx`,
  `components/customers/customer-transactions-panel.tsx`, `server/actions/customers.ts`,
  `app/api/exports/customers/route.ts`, `server/mcp/domain-tools.ts`
- **Gate:** `legacyListCustomers(surface, filters)` is **NOT async** so refusal throws synchronously (`expect(() => …).toThrow()` in U-12); served path returns `listCustomers(legacyContext(surface), filters)` with `soleCustomerOrganizationId()` single-tenant demo assumption.
- **Store privacy:** `__kineticCustomerStore` touched only by `server/data/customers.ts`, `server/data/customers-unscoped.ts`, and tests (Q-2).

## Evidence files

- `apps/web/src/server/data/customers.tenant-isolation.test.ts` — 14 tests (U-1..U-12)
- `apps/web/src/server/data/customers-structural.test.ts` — 8 tests (Q-1..Q-5)
- `apps/web/src/app/api/exports/customers/route.tenant.test.ts` — 4 tests
- `apps/web/src/server/mcp/customer-tools.tenant.test.ts` — 3 tests
- `apps/web/src/server/finance/tenant-isolation.probe.test.ts` — customers probe now PASS (was GAP)

Total new in this slice: **29 tests**, all green (9 deliberate mutation checks also reddened then reverted, see report §4).
