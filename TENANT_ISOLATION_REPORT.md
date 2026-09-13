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
| **Team DAL** (`server/data/team.ts`) | **PASS** (Wave 7F) | `OrganizationContext` required on all 9 functions; store `Map<org, { members }>` with the prototype roster seeded into `DEFAULT_DEMO_ORG` only; composite key `(organizationId, id)` over the pure `memberIdFromEmail` hash; **roles are per tenant** and `changeMemberRole` is pinned tenant → row → role (F-13a); enforced by `identity-structural.test.ts` FS-1/FS-2/FS-5 |
| **Settings DAL** (`server/data/settings.ts`) | **PASS** (Wave 7F) | `OrganizationContext` required on all 15 functions; `Map<org, TenantSettingsState>` with `demoState()` (the prototype persona) vs **`freshState()`** (blank legal identity, no keys, no IP rules) — a new tenant does not inherit Acme's tax id or secret ring; partitions materialise on first write only; API keys are tenant-bound (`ApiKey.organizationId`) and `listApiKeys` partitions **before** its environment filter; `updateMerchantProfile` pinned tenant → read → patch → write (F-13b) |
| **KYC DAL** (`server/data/kyc.ts`) | **PASS** (Wave 7F) | `OrganizationContext` required on all 4 functions; `Map<org, KycSubmission>` — presence *is* "submitted"; still unseeded (ADR-0019), so "nothing submitted" and "submitted by somebody else" are the same `null` and there is no enumeration oracle over PII |
| **Onboarding aggregate** (`server/data/onboarding.ts`) | **PASS** (Wave 7F) | Derived from five stores, all read with the caller's one context; ledger rows via the scoped 7A `getLedgerRows(ctx)` instead of `legacyLedgerRows("onboarding")`, which **retires the `onboarding` entry in `LEGACY_LEDGER_SURFACES`** (11 → 10) and the D-28 refusal for that surface |
| Identity CSV export (`GET /api/exports/team`) | **PASS** (Wave 7F) | `guardExport()`'s org id *is* the predicate; unresolved org ⇒ 401 no body; `private, no-store` + `Vary: Cookie`; client `?organizationId=` flagged, never honoured; frozen 8-column header with no tenancy column |
| Identity MCP tools (`list_team_members`, `get_merchant_profile`, `get_settings_overview`, `get_kyc_submission`, `get_onboarding_status`) | **PASS** (Wave 7F) | Bound to the `registerDomainTools` organization param (no change to `mcp/auth.ts`); absent ⇒ `NO_TENANT` refusal text with **zero** identity payload |
| Identity server actions (16 across team, settings, KYC) | **PASS** (Wave 7F) | `requireIdentityOrganizationContext(permission)` before any store access — **none of these 16 actions checked a permission before this wave**; `TenantIsolationError` ⇒ the same string as an unknown id; bulk re-role/deactivate scope per row and report the honest count; validation still runs first so field errors stay honest |
| 5 other CSV export routes | **GAP** | Same `guardExport()` pattern, not yet rewired — each lands with its module's slice |
| **11 remaining `server/data/*` modules** | **QUARANTINED** | They read the ledger through `server/data/transactions-unscoped.ts` (10 surfaces after Wave 7F dropped `onboarding`), payouts through `payouts-unscoped.ts` (6), the directory through `customers-unscoped.ts` (1), the roster through `team-unscoped.ts` (1, `audit`), the key ring through `settings-unscoped.ts` (1, `audit`) or the KYC slot through `kyc-unscoped.ts` (1, `handoff`) — all of which **throw** once a second tenant has rows. Safe-by-refusal, not isolated |
| Webhook UI log | **GAP** | `recordWebhookDelivery()` stores `organizationId: "unresolved"` |

Before Wave 7A: **0 of 20** files in `src/server/data/` contained the string `organizationId`.
Now: **8 of 20** do — `transactions.ts` (7A), `payouts.ts` (7B), `customers.ts` (7C),
`subscriptions.ts` and `invoices.ts` (7D), `team.ts`, `settings.ts` and `kyc.ts` (7F) — plus a ninth,
`onboarding.ts`, which owns no rows and takes the context as its required first parameter instead.
The contract in `domain/tenancy/organization-context.ts` is what the other 11 inherit when their
slice lands.

Billing-specific note (Wave 7D, ADR-0044): the slice added **no** quarantine module. Its derived
readers used to ride `legacyListTransactions("invoices", …)`, which both leaked an aggregate and
capped the ledger at 100 rows; the derivation is now paged through the scoped 7A read, so the
`invoices` entry left `LEGACY_LEDGER_SURFACES` (12 → 11) and `subscriptions` left
`LEGACY_CUSTOMER_SURFACES` (2 → 1) in the same commit. `billing-structural.test.ts` R-4 fails if a
billing `*-unscoped.ts` file ever appears.

Identity-specific note (Wave 7F, ADR-0046): this slice went the other way — it **earned three**
quarantine modules, one per DAL, each with a named forcing caller from another wave
(`team-unscoped.ts` and `settings-unscoped.ts` for `audit.ts`; `kyc-unscoped.ts` for `handoff.ts`,
the spec's conditional module). Their only consumer is a 7E derived surface, and wiring audit in-wave
would have meant scoping the ledger, payout and webhook reads it also makes. It also *shrank* one
legacy allowlist: `LEGACY_LEDGER_SURFACES` 11 → 10 (`onboarding`) and S-2's
`ALLOWED_UNSCOPED_CONSUMERS` 10 → 9 — the clearance Wave 7E's ES-6 gate needs. Two findings the spec
did not list: **none of the 16 identity actions checked a permission**, and a non-demo tenant used to
start life *as* Acme Corporation LLC with its tax id, three API keys (two live) and two allowlisted
IPs, because the prototype persona was seeded process-wide.

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
