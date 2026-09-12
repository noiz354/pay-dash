# Tenant Isolation Report

Wave 6 · `apps/web/src/domain/security/tenant.ts` · measured by
`apps/web/src/server/finance/tenant-isolation.probe.test.ts`

## Verdict: **FAIL (known, scoped, owned)**

This gate does not pass. Reporting it as a pass would be the single most dangerous sentence in the
Wave 6 deliverables, so the measured matrix is published instead.

---

## The measured matrix

Printed by the probe suite on every run — the report cannot drift from reality:

```
TENANT ISOLATION MATRIX
  PASS  payment projection store              composite key (org, id)
  PASS  domain/security/tenant.ts             explicit scope object
  PASS  read of a foreign id                  null-equivalence
  GAP   server/data/transactions.getLedgerRows   NONE — single-tenant demo store
  GAP   server/data/payouts.getPayoutBatches     NONE — single-tenant demo store
```

| Surface | Isolated | Mechanism |
|---|---|---|
| Payment projection store | **PASS** | Keyed by `(organizationId, resourceId)`; a foreign-org projection resolves to `null` |
| Durable stores (`DurableOperation`, `WebhookDelivery`, `AuditEvent`) | **PASS** | `organizationId` column + composite FKs `[id, organizationId]` |
| `domain/security/tenant.ts` | **PASS** | Explicit scope object; reads filter, writes throw |
| Reconciliation engine | **PASS** | Drops foreign-tenant records before comparison (INV-T2) |
| **20 legacy `server/data/*` modules** | **GAP** | **None.** No function accepts an organization |
| Export endpoints (10 CSV routes) | **GAP** | `guardExport()` authorizes the actor but its returned org id is unused |
| Webhook UI log | **GAP** | `recordWebhookDelivery()` stores `organizationId: "unresolved"` |

**0 of 20** files in `src/server/data/` contain the string `organizationId`.

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

Those two assertions are **tripwires**. The day someone adds scoping, they fail, forcing this
report to be updated instead of quietly going stale.

---

## The primitive that closes the gap

`domain/security/tenant.ts` provides the wall the authorization layer has been standing in front
of. `org-context.ts` already answers *who the actor is* and *what they may do*; it could not
answer *which tenant's rows this query may touch*, because the functions it guards take no
organization. Authorization without scoping is a lock on a door in a building with no walls.

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

Deliberately **not** attempted in this wave: retrofitting 20 data modules is a mega-diff, and the
instruction was one reviewable vertical slice per task.

1. One slice per `server/data/*` module: add a required `TenantScope` parameter, thread it through
   `globalThis` store keys, update co-located tests.
2. Wire `guardExport()`'s returned org id into each of the 10 CSV endpoints.
3. Resolve `organizationId` at webhook ingress instead of writing `"unresolved"`.
4. Postgres RLS as defence in depth (blocked on debt **D-09**).
5. Convert each `CURRENT GAP` probe into a passing isolation assertion as its module lands.

## Standing risk

Until step 1 completes, **`pay-dash` must not be operated with more than one tenant's real data in
the in-memory stores.** That is the honest operational constraint this wave produces.
