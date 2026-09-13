# Tenant Isolation Report

Wave 6 primitive · `apps/web/src/domain/security/tenant.ts` · measured by
`apps/web/src/server/finance/tenant-isolation.probe.test.ts`
Transactions slice updated by **Wave 7A** (2026-09-12) — see `TRANSACTIONS_TENANT_ISOLATION_MATRIX.md`.

## Verdict: **PARTIAL — Transactions PASS, 11 modules still quarantined**

Wave 6 published this gate as **FAIL** and refused to soften it: the capability to isolate existed only
at the domain/durable layer, and 0 of 20 `server/data/*` modules accepted an organization. Wave 7A closed
the **Transactions** slice at the data boundary — list, search, detail, retry, three refund phases,
export, the MCP tools and the derived aggregates — and fenced the rest behind a gate that fails closed.

Reporting the whole gate as PASS would still be a lie. So the measured matrix is published instead, as in
Wave 6.

---

## The measured matrix

Printed by the probe suite on every run — the report cannot drift from reality:

```
TENANT ISOLATION MATRIX
  PASS  payment projection store                      composite key (org, id)
  PASS  domain/security/tenant.ts                     explicit scope object
  PASS  read of a foreign id                          null-equivalence
  PASS  server/data/transactions (list/get/rows)      required OrganizationContext + (org, id) partition
  PASS  server/data/transactions detail + retry       read ∅ / write throws
  GAP   server/data/payouts.getPayoutBatches          NONE — single-tenant demo store (D-09 / Wave 7)
```

| Surface | Isolated | Mechanism |
|---|---|---|
| Payment projection store | **PASS** | Keyed by `(organizationId, resourceId)`; a foreign-org projection resolves to `null` |
| Durable stores (`DurableOperation`, `WebhookDelivery`, `AuditEvent`) | **PASS** | `organizationId` column + composite FKs `[id, organizationId]` |
| `domain/security/tenant.ts` | **PASS** | Explicit scope object; reads filter, writes throw |
| Reconciliation engine | **PASS** | Drops foreign-tenant records before comparison (INV-T2) |
| **Transactions DAL** (`server/data/transactions.ts`) | **PASS** (Wave 7A) | `OrganizationContext` required on every read **and** write; store partitioned `(organizationId, id)`; provider read is org-bound; enforced by `transactions-structural.test.ts` |
| Transaction CSV export | **PASS** (Wave 7A) | `guardExport()`'s returned org id *is* now the query predicate; `no-store, private` + `Vary: Cookie`; header vocabulary frozen without a tenancy column |
| **Subscriptions DAL** (`server/data/subscriptions.ts`) | **PASS** (Wave 7D) | `OrganizationContext` required on all 3 repository functions; store `Map<org, { plans }>`; composite key `(organizationId, id)` over the pure `subscriptionIdFrom` hash; enforced by `billing-structural.test.ts` R-1 |
| **Invoices DAL** (`server/data/invoices.ts`) | **PASS** (Wave 7D) | `OrganizationContext` required on all 8 readers/writes; **derivation scoped before it aggregates** (`scopedLedgerRows(ctx)` pages the 7A read); payments composite `(org, invoiceId)`; `payInvoice` order pinned — tenant check before any write, refusal audited |
| Billing CSV exports (subscriptions, invoice list, single statement) | **PASS** (Wave 7D) | `guardExport()`'s org id *is* the predicate; unresolved org ⇒ 401 no body; `private, no-store` + `Vary: Cookie`; header vocabulary frozen without a tenancy column |
| Billing MCP tools (`list_invoices`, `get_invoice`, `list_subscriptions`) | **PASS** (Wave 7D) | Bound to the `registerDomainTools` organization param; absent ⇒ `NO_TENANT` refusal with zero payload; foreign id ⇒ not-found |
| Billing server actions (`payInvoiceAction`, bulk `payInvoicesAction`, `createInvoiceAction`, `createSubscriptionAction`) | **PASS** (Wave 7D) | `requireBillingOrganizationContext(permission)` before any store access; `TenantIsolationError` ⇒ the same string as a missing invoice; bulk settle scopes per row and reports `{paid, failed}` |
| 6 other CSV export routes | **GAP** | Same `guardExport()` pattern, not yet rewired — each lands with its module's slice |
| **15 remaining `server/data/*` modules** | **QUARANTINED** | They read the ledger through `server/data/transactions-unscoped.ts` (11 surfaces after Wave 7D dropped `invoices`), payouts through `payouts-unscoped.ts` (6) or the directory through `customers-unscoped.ts` (1 after 7D dropped `subscriptions`), all of which **throw** once a second tenant has rows. Safe-by-refusal, not isolated |
| Webhook UI log | **GAP** | `recordWebhookDelivery()` stores `organizationId: "unresolved"` |

Before Wave 7A: **0 of 20** files in `src/server/data/` contained the string `organizationId`.
Now: **5 of 20** do — `transactions.ts` (7A), `payouts.ts` (7B), `customers.ts` (7C),
`subscriptions.ts` and `invoices.ts` (7D) — plus the contract in
`domain/tenancy/organization-context.ts` that the other 15 inherit when their slice lands.

Billing-specific note (Wave 7D, ADR-0044): the slice added **no** quarantine module. Its derived
readers used to ride `legacyListTransactions("invoices", …)`, which both leaked an aggregate and
capped the ledger at 100 rows; the derivation is now paged through the scoped 7A read, so the
`invoices` entry left `LEGACY_LEDGER_SURFACES` (12 → 11) and `subscriptions` left
`LEGACY_CUSTOMER_SURFACES` (2 → 1) in the same commit. `billing-structural.test.ts` R-4 fails if a
billing `*-unscoped.ts` file ever appears.

---

## What is actually broken, and why it is survivable today

The legacy in-memory modules behind every dashboard page are **single-tenant demo stores**. They
do not leak one tenant's data to another because there is no second tenant in them — they hold one
process-wide dataset. The failure mode is not "org A reads org B's rows"; it is that **the
capability to isolate does not exist**, so the moment a second tenant's data enters those stores,
every read is a cross-tenant read.

The probe asserts this structurally rather than rhetorically:

```ts
expect(getLedgerRows.length).toBe(0);                              // no scope parameter exists
expect(Object.keys(rows[0])).not.toContain("organizationId");      // no row carries an owner
```

Those two assertions were **tripwires**. Wave 7A fired them: the arity probe now asserts
`getLedgerRows.length === 1`, the row shape carries `organizationId`, and the payouts tripwire is left
in place, still red, until its own slice lands.

---

## The primitive that closes the gap

`domain/security/tenant.ts` provides the wall the authorization layer has been standing in front
of. `org-context.ts` already answers *who the actor is* and *what they may do*; for 19 of 20 modules it
still cannot answer *which tenant's rows this query may touch*, because the functions it guards take no
organization. Authorization without scoping is a lock on a door in a building with no walls.

Wave 7A added the missing half for the **Transactions** wall: `domain/tenancy/organization-context.ts`
(`OrganizationContext`, ADR-0041) is the shape every scoped boundary must be handed — required, with no
default — and it bridges to this primitive rather than re-implementing it, so there remains exactly one
implementation of "reads ∅, writes throw" in the codebase.

Two rules, and the asymmetry is deliberate:

| Operation | Foreign tenant | Why |
|---|---|---|
| **Read** | Returns **∅**, never an error | A 403 on a specific id confirms the id exists — an enumeration oracle. "Not found" and "not yours" must be indistinguishable. |
| **Write** | **Throws** `TenantIsolationError` and is audited | There is no benign cross-tenant write; silence would let a bug corrupt another tenant's book. |

A browser-supplied organization id never wins: `resolveRequestedScope()` answers from the
session's scope and flags the attempt (`overridden: true`) for audit.

Verified by 15 tests in `domain/security/tenant.test.ts`, including the null-equivalence property:

```ts
expect(scopeRecord(scopeA, foreignRecord)).toBe(scopeRecord(scopeA, null));
```

---

## Cross-tenant probes that DO pass

From the mandated failure-scenario suite (`server/finance/failure-scenarios.test.ts`, Scenario 6):

- A list read never returns another tenant's rows.
- A direct id read of a foreign row is indistinguishable from not-found.
- A cross-tenant write throws, with the surface recorded for the audit entry.
- A webhook projection cannot land a resource in another organization.
- Reconciliation ignores foreign-tenant records entirely.

---

## Remediation plan (Wave 7)

Deliberately **not** attempted in one wave: retrofitting 20 data modules is a mega-diff, and the
instruction was one reviewable vertical slice per task.

1. ~~One slice per `server/data/*` module~~ **Transactions: done in Wave 7A** (required
   `OrganizationContext`, partitioned store, co-located tests, structural guard). Remaining 19 follow the
   recipe in `WAVE_7A_IMPLEMENTATION_REPORT.md` §8: Payouts → Refunds → Customers → Ledger → Webhooks →
   Audit, deleting one entry from `ALLOWED_UNSCOPED_CONSUMERS` per PR.
2. ~~`guardExport()`'s org id into the CSV endpoints~~ **transactions route: done.** 9 endpoints remain.
3. Resolve `organizationId` at webhook ingress instead of writing `"unresolved"` — still open.
4. Postgres: land the `organizationId` column + composite key on `LedgerEntry`, then RLS as defence in
   depth — **D-26**, and the reason Postgres transaction reads are refused today rather than scoped.
5. Convert each `CURRENT GAP` probe into a passing isolation assertion as its module lands — the
   transactions row did exactly that; the payouts row is the next one.

## Standing risk

Wave 6 said: *until step 1 completes, `pay-dash` must not be operated with more than one tenant's real
data in the in-memory stores.* Wave 7A makes that enforceable rather than advisory for the ledger: the
unscoped readers **throw** once a second tenant has rows, and the session resolver refuses the demo
context in the same condition. The residual is the same list, 11 modules long, and it is now a
`LEGACY_LEDGER_SURFACES` union in code rather than a paragraph.

## Standing risk

Until step 1 completes, **`pay-dash` must not be operated with more than one tenant's real data in
the in-memory stores.** That is the honest operational constraint this wave produces.
