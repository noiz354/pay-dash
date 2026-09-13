# Wave 7E — Derived Surfaces Tenant Isolation (Spec)

Date: 2026-09-13 · Branch: `wave-7d-derived-scoping` (main@a4b595a, Waves 7A/7B/7C PASS, 7D Proposed)
Predecessors: 7A Transactions, 7B Payouts+Refunds, 7C Customers, 7D Billing (Proposed)
Status: **Proposed** · Follows ADR-0041/0042/0043 · Reuses `domain/tenancy/organization-context.ts` unchanged

---

## 0. Runtime baseline (measured, not carried over)

| Gate | Result 2026-09-13 |
|---|---|
| Full suite | **1472 passed / 17 failed** (15 pre-existing env `DATABASE_URL` unset + 2 pre-existing calendar flakes) |
| Typecheck | clean · Lint 0 errors / 40 warnings (== D-17) |
| Probe matrix | 0 GAPs — Q1 *adds* derived-surface GAP pins, Q5 closes them |

## 1. Invariant

> Organization A cannot read, aggregate, export, or move money through a derived
> surface computed from Organization B's rows. This wave scopes the aggregates
> themselves — and then **deletes all three quarantines**
> (`transactions-unscoped`, `payouts-unscoped`, `customers-unscoped`): after 7E,
> no unscoped reader remains in the tree. If any surface cannot be scoped inside
> the wave, it keeps a quarantine entry and 7E does NOT delete that file (delete
> is earned, not scheduled).

## 2. Contract reuse (C-1..C-7, unchanged)

`OrganizationContext` required-first, `parseOrganizationContext` only constructor, no defaults,
reads → null / writes → `TenantIsolationError` + denial audit, wire answers uniform not-found,
session-only resolution, fail-closed quarantine (here: the shrinking set, then deletion).

## 3. Gaps (file:line evidence, checkout `a4b595a`)

- **P-1** `server/data/balance.ts:272,313,362` — `getBalanceOverview`/`listMovements`/
  `getBalanceTrend` unscoped aggregates (fail-closed via quarantine today).
- **P-2** `balance.ts:397,436` — `topUpBalance` (money in) / `withdrawBalance` (money out)
  DAL entries; 7B scoped the *action* auth, the DAL read/write path still needs ctx-first
  with tenant-before-write order pins (7B M8 precedent).
- **P-3** `server/data/audit.ts:131,231,269` — `getAuditEvents`/`listAuditEvents`/
  `auditSummary` unscoped (the denial sink itself must be tenant-readable only by its owner).
- **P-4** `server/data/command-center.ts:138` — `getCommandCenter` unscoped snapshot
  (SLA exception queue across tenants is the worst leak class here — an exception queue
  is a *mutation affordance*, 7A matrix precedent).
- **P-5** `server/data/handoff.ts:136,348,372,386` — `deriveHandoffs`/`getHandoffQueue`/
  `getHandoffCounts`/`getOverdueHandoffs` unscoped (dual-control lanes cross tenants).
- **P-6** `server/finance/snapshot.ts:201` — `buildLedgerSnapshot` unscoped.
- **P-7** `app/api/exports/balance/route.ts`, `app/api/exports/audit/route.ts` — guard org
  handling unverified (7A shape #3); needs `private, no-store` + `Vary: Cookie`.
- **P-8** MCP balance/audit tools (verify names at Q2 — `domain-tools.ts` imports
  `getBalanceOverview`, `listMovements`, `listAuditEvents`) unscoped.
- **P-9** Pages: reports builder, balance, audit, command-center, handoff surfaces —
  session wiring per caller (verify full caller table at Q2 from quarantine consumer lists).
- **P-10** Design decision — deletion criterion: a quarantine file is deleted only when its
  `LEGACY_*_SURFACES` is empty AND its Q-2/S-2/structural consumer scan is green AND the
  full suite is green without it. Partial success = smaller allowlists, files stay.

## 4. Quarantine design (shrink-to-zero, no new files)

No new quarantine modules. Each surface is scoped to its session tenant (same Q4 recipe:
guard org → parse → normalize → scoped DAL; MCP via `registerDomainTools` org param).
`movementsToCsv`/`auditEventsToCsv`/`worstBand`/`toDto`/`slaBandFor` stay pure (structural pins).
Seam reuse: existing `transaction-`/`payout-`/`customer-organization-context` + a thin
`server/services/derived-organization-context.ts` ONLY if a derived surface needs
multi-slice composition (justify at Q2, default = reuse).

## 5. Tests

- **E-1..E-12** isolation: per-surface own/cross pairs (overview, movements, trend,
  topup, withdraw, audit list/summary, command-center, handoff queue/counts/overdue,
  snapshot, exports, MCP) + quarantine-dynamic-import + invalid-ctx.
- **E-13** order pins: tenant-before-write in `topUpBalance` AND `withdrawBalance`
  (same-actor cross-tenant movement throws `cross-tenant`, ledger untouched).
- **ES-1..ES-5** structural per module: ctx-first, no-default, purity, quarantine
  allowlist-monotone-decreasing (assert each list is a subset of the Q1 snapshot —
  may only shrink) + prod-path guards + slot privacy + CSV vocabs.
- **ES-6** deletion gate: asserts the quarantine files are ABSENT (fails while they
  exist — inverted at Q7 after deletion; documents the end-state explicitly).
- Probe: derived GAP tests added in Q1, flipped to PASS in Q5; gaps back to 0.

## 6. Plan Q0..Q7 (serial, same gates)

Q0 spec (this doc) → Q1 6 failing test files (45-ish tests, red for missing ctx + derived
GAPs) → Q2 scoped DALs + session wiring, quarantine shrinks → Q3 (folded: legacy tests to
demo ctx) → Q4 export routes + MCP + action tests → Q5 probe final + full gates → Q6
8 mutations (aggregate predicate removal, global movement/audit lookup, hardcoded export
org, MCP bypass, quarantine import in prod path, org col in CSV, topup-before-tenant-check,
withdraw-before-tenant-check) → Q7 report + matrix + ADR + quarantine deletion (if earned) +
commit one slice.
