# Wave 7B — Payouts + Refunds Tenant Isolation (Spec)

Date: 2026-09-13 · Branch: `main@c94d7b0` (+ MCP integration fail-closed fix, uncommitted) · Predecessor: Wave 7A (Transactions slice, PASS runtime 2026-09-13)
Status: **Proposed** · Follows ADR-0041 · Reuses `domain/tenancy/organization-context.ts` unchanged

---

## 0. Runtime baseline (measured, not carried over)

Wave 7A was re-run on this checkout after `pnpm install` + `prisma generate`:

| Gate | Result 2026-09-13 |
|---|---|
| Full suite | **1403 passed / 128 files, 0 failed** (`vitest run`) — beats the report's 1399 (one stale test fixed, see below) |
| Typecheck | **clean** (`tsc --noEmit`, after `prisma generate`; 3 pre-existing Prisma-client errors before generate) |
| Lint | **0 errors, 40 warnings** (== D-17 baseline) |
| Probe matrix | **5 PASS / 1 GAP** (`payouts.getPayoutBatches`), printed by suite |
| Spot mutation | `peekLedger()` without ctx → structural **1 failed** (S-1 ratchet live), reverted |

One stale test was fixed to get there (uncommitted, 1 file):
`server/mcp/server.integration.test.ts:89` expected unscoped `list_transactions`
to return rows — pre-7A behaviour. Wave 7A makes tenant-less transaction tools
refuse, so the test now asserts the fail-closed wire message
(`/organization|tenant/i`). Tenant-bound success stays covered in
`domain-tools.tenant.test.ts`. **Commit this fix with the 7B PR or separately
before it** — `main` is currently red on that 1 test without it
(1402 passed / 1 failed).

Wave 7A verdict after re-run: **PASS (slice)**. Whole-app verdict unchanged:
**CONDITIONAL** — single-tenant demo safe, multi-merchant production not.

---

## 1. The invariant under test

> **Organization A cannot list, search, open the detail of, export, approve,
> cancel, retry, or otherwise mutate a payout batch, recipient, or refund
> belonging to Organization B — even when it knows the batch/recipient id exactly.**

Same anti-enumeration policy as 7A (spec §4, ADR-0041): foreign/unknown/malformed
id are wire-identical (`null` / `notFound()` / `NOT_FOUND` + `Transaction…`-style
not-found message per surface); the loud half lives in the audit log
(`TENANT_ISOLATION_DENIED` + surface, org ids, actor, resource id — never PII).

Refunds note: the **transaction-side** refund lifecycle (`requestRefund` /
`approveRefund` / `rejectRefund` / `refundTransaction` in
`server/data/transactions.ts`) is **already scoped in 7A** and stays untouched
except as a caller. 7B's "Refunds" scope is everything that is *not* that:
payout-side reimbursement batches, the refund-approval handoff queue surface,
`server/repositories/refund-identities.ts`, and the CSV/export paths that carry
refund state. If implementation finds no unscoped refund surface outside those,
it says so with grep evidence and closes the refunds row as N/A-guarded rather
than inventing work.

---

## 2. Canonical contract (reuse, not redesign)

`OrganizationContext = { readonly organizationId: string }`,
`parseOrganizationContext()` as sole constructor, `tenantScopeFor()` bridge to
`domain/security/tenant.ts`, `requireTransactionOrganizationContext`-shaped
resolver per surface (or a shared `resolvePayoutOrganizationContext` if the two
resolvers are identical — implementation may factor the common 30 lines, spec
does not mandate duplication).

Rules C-1..C-7 apply verbatim with `transactions` → `payouts`:

| # | Rule |
|---|---|
| C-1 | Every payout read **and** write takes `ctx: OrganizationContext` **first**. No default, no optional, no `= {}`. |
| C-2 | Contexts only from `parseOrganizationContext()`; no default org. |
| C-3 | Production path builds ctx from the **session**; `?organizationId=` normalized against session scope, never wins. |
| C-4 | No demo fallback in strict mode; multi-tenant demo refusal mirrors 7A (`refuseMultiTenantDemo`). |
| C-5 | No global store lookup: store partitioned by `(organizationId, batchId)`; only accessor across partitions is the quarantine (§5). |
| C-6 | No ID-only mutation: `approveBatch`, `cancelBatch`, `retryBatchFailures`, `retryRecipient`, `createBatch` all take ctx. |
| C-7 | Bridge to `tenantScope()`; policy stays single-sourced. |

Review triggers (fail the review, not just the tests):

- ❌ `organizationId = DEFAULT_DEMO_ORG` default in a production path
- ❌ `ctx ?? demoOrgContext()`
- ❌ `globalThis.__kineticPayoutStore` reachable from a route/action
- ❌ `approveBatch(id)`, `cancelBatch(id)`, `retryRecipient(batchId, recipientId)` addressed by id alone

---

## 3. Flow map (read-only discovery, with evidence on `main`)

```
browser (cookie session)
  │
  ├─ page: /payouts ─────────── listBatches(filters)                        ✗ no ctx   ← P-1
  ├─ page: /payouts/bulk ─────── listBatches + getPayoutsOverview            ✗ no ctx   ← P-1
  ├─ page: /payouts/[id] ─────── getBatch(id)                               ✗ no ctx   ← P-2
  ├─ actions: create/approve/cancel/retry ─ requireStrictOrgContext(perm)   ✅ actor, ✗ tenant ← P-3
  │     ├─ createBatchAction ── createBatch(input)                           ✗ no ctx
  │     ├─ approveBatchAction ─ approveBatch(id)                             ✗ no ctx
  │     ├─ cancelBatchAction ── cancelBatch(id)                              ✗ no ctx
  │     ├─ retryBatchAction ─── retryBatchFailures(id)                       ✗ no ctx
  │     └─ retryRecipientAction retryRecipient(batchId, recipientId)         ✗ no ctx
  ├─ route: /api/exports/payouts ─ guardExport() → org RETURNED BUT UNUSED  ✗ predicate dropped ← P-4
  ├─ MCP: list_payout_batches / get_payout_batch / get_payouts_overview     ✗ no tenant ← P-5
  ├─ settings/schedule/bank-accounts ─ getPayoutSettings / updatePayoutSettings
  │     / listBankAccounts / addBankAccount / getDestinationAccount          ? scope TBD ← P-6
  ├─ provider mapping (disbursement partner per-org)                        ? verify ← P-7
  │
  └─ DAL: server/data/payouts.ts (910 lines)
        ├─ PayoutBatch:51-63 — NO organizationId column                     ← P-8
        ├─ Store:117-122 — single { batches, accounts, settings } slot      ← P-9
        ├─ listBatches:436 / getBatch:485 / getPayoutBatches:496 (0 args!)   ← P-1/P-2
        ├─ getPayoutsOverview:516 — aggregates over every row               ← P-10
        ├─ create:571 / approve:616 / cancel:714 / retryBatch:738 / retryRecipient:772 — id-only ← P-3
        └─ batchesToCsv:864 / recipientsToCsv:902 — pure formatters (exempt)
```

Callers that force the quarantine (§5):

| Caller | Unscoped read today |
|---|---|
| `server/finance/snapshot.ts:121` | `getPayoutBatches()` finance snapshot |
| `server/data/command-center.ts:141` | failed-recipient scan |
| `server/data/audit.ts:113` | audit derivation over batches |
| `server/data/balance.ts:196` | reserved/available figures |
| `server/data/handoff.ts:142` | handoff queue |
| `app/[locale]/reports/builder/page.tsx:23` | report builder |
| `server/data/balance.ts:466` | `approveBatch(batch.id)` internal write |
| `lib/report-options.test.ts:38`, `finance/snapshot.test.ts:69`, `command-center.test.ts:136`, `data/balance.test.ts:161,187` | tests reading process-wide |

### Gap inventory

| ID | Where | Defect | 7B disposition |
|---|---|---|---|
| P-1 | `payouts.ts:listBatches`, pages `/payouts`, `/payouts/bulk` | list/search/filter/sort/page over process-wide batches | **FIX — scoped** |
| P-2 | `payouts.ts:getBatch`, `getPayoutBatches`, detail page | id-only read; absent vs not-yours indistinguishable by accident | **FIX — scoped, null-equivalence by policy** |
| P-3 | `server/actions/payouts.ts` (5 actions) + `balance.ts:466` | authorize actor, hand DAL unscoped id | **FIX — resolve + pass ctx; dual-control: approver ≠ creator** |
| P-4 | `app/api/exports/payouts/route.ts:10-21` | guard org discarded; `no-store` without `private`/`Vary: Cookie` | **FIX — guard org is predicate; harden cache headers; freeze CSV header vocab** |
| P-5 | `server/mcp/domain-tools.ts:175-190` | `list_payout_batches`/`get_payout_batch`/`get_payouts_overview` tenant-free | **FIX (fail-closed)** — refuse without resolvable tenant; Postgres path refused until column lands |
| P-6 | settings/schedule/bank accounts (`:801-864`) | per-org or global? undecided | **DECIDE in build** — per-org partition by default; if genuinely global, record decision + test proving no PII/amount per tenant leaks through it |
| P-7 | provider disbursement mapping | per-org mapping unverified | **VERIFY** — reads bound to caller org + scope-filter after mapping (defence in depth, as 7A T-11) |
| P-8 | `PayoutBatch` DTO | no owner column | **FIX — `organizationId` part of row + CSV/query key, never exported in CSV** |
| P-9 | store slot | single slot for all tenants | **FIX — `Map<organizationId, batches>` (+ accounts/settings per P-6 decision); slot private** |
| P-10 | `getPayoutsOverview`, bulk aggregates | process-wide numbers = leak-as-a-number | **FIX — scoped; per-tenant series** |
| P-11 | timeline (`batch.timeline`) | per-batch events readable via batch read | **FIX — inherit batch scope; no standalone unscoped timeline reader** |
| P-12 | refund-adjacent (reimbursement batches, handoff refund queue, `refund-identities.ts`) | scope unknown | **SCOPE-or-N/A** — scoped with same contract, or N/A with grep evidence + guard test |

---

## 4. Security semantics

Inherit 7A §4 exactly: reads → `∅`; writes → throw
`TenantIsolationError("CROSS_TENANT_WRITE")` audited with surface, mapped on the
wire to the same not-found shape as an unknown id. `?organizationId=` attempts
flagged (`*.scope-override`) and ignored. Dual-control for money-out:
`approveBatch` by an actor distinct from the batch creator (mirror BE-002);
same-actor approval refused without revealing anything about the batch.

---

## 5. The quarantine (how the slice stays a slice)

Mirror 7A §5 one-to-one:

```ts
// server/data/payouts-unscoped.ts   @deprecated Wave 7C
export function legacyPayoutBatches(surface: LegacyPayoutSurface): PayoutBatch[];
export function legacyListBatches(surface, filters): Promise<PaginatedBatches>;
```

- `LEGACY_PAYOUT_SURFACES` frozen allowlist (snapshot, command-center, audit,
  balance, handoff, reports + tests); may only shrink.
- Serves rows **only while the payout store holds exactly one tenant**;
  otherwise throws naming the surface.
- `surface` required literal argument.
- Ratchet (copy of S-1..S-6 with `transactions` → `payouts`):
  Q-1 ctx-first on every exported payout read/write; Q-2 consumer set frozen;
  Q-3 no payout production path imports quarantine; Q-4 (reuse S-4, extend if
  entity search appears); Q-5 store slot private + CSV header vocab frozen, no
  `organization_id` column in exports; Q-6 no `prisma.*Payout*` read without
  citing the schema debt (new D-number if the table lacks the column — verify
  during build).

---

## 6. In scope / out of scope

**In scope:** payout list · search/filter/sort/pagination · detail by id ·
create (incl. CSV bulk intake) · approve / cancel (dual-control) · batch retry ·
recipient retry · export (`/api/exports/payouts`) · timeline · settings/schedule/
bank-accounts decision (P-6) · provider mapping verification (P-7) ·
MCP `list_payout_batches` / `get_payout_batch` / `get_payouts_overview` ·
refund-adjacent items (P-12) · quarantine + ratchet.

**Out of scope (deliberate):** Customers, Balance/Ledger aggregates beyond the
payout-derived figures, Webhooks, Audit-as-module, Invoices, Links, Risk,
Reports-as-module, Handoff internals, Postgres RLS, Playwright E2E (same D-01
constraint; unit + route + MCP tests carry the claim).

---

## 7. Required tests (TDD)

| ID | Test | Must prove |
|---|---|---|
| U-1 | Org A lists | only A's batches; `total` excludes B |
| U-2 | Org A searches (`q`, `status`, `range`, sort) | needles matching only B → `[]`/`total: 0`; shared needle → only A |
| U-3 | Org A detail of B's batch id | `null`/not-found, identical to unknown id |
| U-4 | Org A approve/cancel of B's batch | refused; B's `status`, recipients, timeline unchanged; denial audited; wire = not-found |
| U-5 | Org A retry batch / retry recipient of B | refused; B's recipient `status`/`paidAt` unchanged |
| U-6 | Org A export | CSV only A's batches, byte-for-byte no B id/name/account; `?organizationId=<B>` ignored + flagged; unresolvable org ⇒ 401 no body |
| U-7 | Guessed batch id / empty string | denied, identical to each other |
| U-8 | Pagination × filter × sort | every page A-only at any offset/ordering; counts exclude B |
| U-9 | Overview/bulk aggregates per tenant | A's totals = A's batches only; no double-count in two-tenant store |
| U-10 | Create | lands in caller partition with owner; invisible to B (list, detail, count) |
| U-11 | Provider path | disbursement read asked for caller's org; response scope-filtered after mapping |
| U-12 | Timeline | B's batch timeline unreachable via A's reads |
| U-13 | Dual-control | creator cannot approve own batch (`SAME_ACTOR`-class refusal, no info leak) |
| U-14 | Quarantine fail-closed | 2 tenants → `legacyPayoutBatches(surface)` throws |
| U-15 | Bridge totality | ctx → TenantScope preserves id, rejects empty |
| Q-1..Q-6 | Structural (§5) | contract unbypassable — each verified by a deliberate-break mutation check |
| R-1 | Regression | full suite green (baseline after this spec's pre-fix: **1403 / 128**) |

---

## 8. Plan (ordered build)

| Step | Deliverable | Gate |
|---|---|---|
| Q0 | This spec + flow/gap map | gaps cite code lines above |
| Q1 | Failing tests: `payouts.tenant-isolation.test.ts`, `payouts-structural.test.ts`, `payout-organization-context.test.ts` (or shared resolver), route + MCP tenant tests | red for the right reason |
| Q2 | Scoped DAL: `organizationId` on batch (+ recipient ownership via batch), partitioned store, scoped reads/writes/overview, scoped provider read | U-1..U-13 green at module level |
| Q3 | Quarantine `payouts-unscoped.ts` + retarget callers in table §3 | U-14 green, suite green |
| Q4 | Route/action/page/MCP wiring: list page, bulk page, detail, 5 actions, export route, 3 MCP tools | route + action-level tests green |
| Q5 | Probe update: payouts GAP→PASS; add explicit next-GAP rows for 7C scope | matrix prints payouts PASS, suite enforces new gap count |
| Q6 | Review pass (7A's 8 axes) + mutation checks (≥6: flatten scope, drop ownership check, unguarded write, hardcoded export org, peek function, quarantine import, CSV org column) | every finding fixed or filed |
| Q7 | Evidence + ship docs (report, matrix, ADR-0042 or ADR-0041 amendment, PROGRESS/CHANGELOG/debt) | gates table measured |

---

## 9. Final gate (measured, not asserted)

| Gate | Target |
|---|---|
| Payout List / Search Isolation | PASS (U-1, U-2, U-8) |
| Detail Isolation | PASS (U-3, U-7) |
| Mutation Isolation (create/approve/cancel/retry/recipient-retry/dual-control) | PASS (U-4, U-5, U-10, U-13) |
| Export Isolation | PASS (U-6 + route suite) |
| Aggregates Isolation | PASS (U-9) |
| Provider Mapping | PASS (U-11) |
| Timeline Isolation | PASS (U-12) |
| IDOR/BOLA | PASS (U-3/U-4/U-5/U-7 + MCP suite + mutation checks) |
| Regression | PASS (full suite green; pre-existing reds listed, none new) |

**Wave 7B readiness: READY when** all gates PASS **and** the quarantine consumer
list is frozen-and-shrinking **and** P-6 is decided with a test either way.
