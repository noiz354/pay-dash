# Wave 7E — Derived Surfaces Tenant Isolation (Spec)

Date: 2026-09-13 · Branch: `wave-7d-derived-scoping` (main@a4b595a, Waves 7A/7B/7C PASS, 7D Proposed)
Predecessors: 7A Transactions, 7B Payouts+Refunds, 7C Customers (all PASS) · **7D Billing, 7F Identity, 7G Ingest** (Proposed — must land first, see P-12: their allowlist entries gate ES-6's deletions). Order per `WAVE_ROADMAP_7D_TO_11.md` §2.2: 7D → 7F → 7G → **7E** → 7H; 7E is the consolidation slice.
Status: **Proposed** · Follows ADR-0041/0042/0043 (this wave's ADR is reserved as **ADR-0045**) · Closes **D-28** (P1) · Reuses `domain/tenancy/organization-context.ts` unchanged

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
> themselves — and then **deletes the three legacy quarantines**
> (`server/data/transactions-unscoped.ts`, `server/data/payouts-unscoped.ts`,
> `server/data/customers-unscoped.ts`): after 7E, no unscoped reader **of the
> transactions/payouts/customers slices** remains in the tree. If any surface cannot
> be scoped inside the wave, it keeps a quarantine entry and 7E does NOT delete that
> file (delete is earned, not scheduled).
>
> **Scope boundary (pinned 2026-09-13 — roadmap finding G-1).** Waves 7D/7F/7G each
> create *slice* quarantines of their own (`subscriptions-unscoped.ts`,
> `invoices-unscoped.ts`, `team-unscoped.ts`, `settings-unscoped.ts`, conditional
> `kyc-unscoped.ts`, `webhooks-unscoped.ts`, `links-unscoped.ts`, conditional
> `blocklist-unscoped.ts`). Those are **not** 7E's deletion target: ES-6 asserts on
> the three legacy paths *by name*, never on a `*-unscoped.ts` glob, so a landed 7D
> does not false-fail this wave. Each slice quarantine is shrink-only and is deleted
> by the Q7 of the wave that empties it; the live ledger (which module exists, which
> allowlist is at zero, who owns the deletion) is `WAVE_ROADMAP_7D_TO_11.md` §4.
> "No unscoped reader remains in the tree" is therefore a *roadmap* end-state (all
> eight slices), not a 7E acceptance criterion — and see **P-12**: this wave's own
> deletions are only earnable if 7D/7F/7G have landed first.

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
- **P-11** Traceability — this wave **is** `KNOWN_DEBT_REGISTER.md` **D-28**. The register
  row's six unscoped payout-slice readers (`balance.ts`, `audit.ts`, `command-center.ts`,
  `handoff.ts`, `finance/snapshot.ts`, `reports/builder/page.tsx` — line numbers there are
  the Wave 7C vintage) map to **P-1..P-6** here with lines refreshed at `a4b595a`, and its
  `reports/builder/page.tsx` reader is additionally covered by **P-9** (page wiring); the
  row's 2-surface `customers-unscoped` quarantine is this wave's third deletion target.
  D-24/D-25 stay WONTNOW (out of scope by MoSCoW) and D-26/D-27 belong to 7H — so after 7E
  + 7H the register has no open tenant-scoping row. The D-28 row is updated at Q7 on
  evidence, never before (register rule: a row disappears when the evidence exists).
- **P-12** Ordering constraint (added 2026-09-13 — roadmap finding G-6, `WAVE_ROADMAP_7D_TO_11.md`
  §2.3). ES-6's deletion of `transactions-unscoped.ts` and `customers-unscoped.ts` is **not
  earnable by this wave alone**: at `af18cc4`, `LEGACY_LEDGER_SURFACES` still holds `invoices`
  (7D's `server/data/invoices.ts`), `onboarding` (7F), `links` + `webhooks` + `risk` (7G), and
  `LEGACY_CUSTOMER_SURFACES` still holds `subscriptions` (7D, via `subscriptions/page.tsx`).
  Only `payouts-unscoped.ts` (6/6 entries this wave's) is deletable on 7E's own. Resolution
  adopted in the roadmap: 7E runs **after** 7D/7F/7G as the consolidation slice
  (7D → 7F → 7G → 7E → 7H). If 7E is nonetheless scheduled second, ES-6 splits into **ES-6a**
  (payouts ABSENT — earnable here) and **ES-6b** (transactions + customers ABSENT — gated on
  7D/7F/7G), and the deferred deletion is written into roadmap §4.1 with a named owner in the
  same commit. Free shrink available at Q1: the `customers` entry in `LEGACY_LEDGER_SURFACES`
  has no consumer anywhere in the tree (production or test) — dropping it needs no code change
  and the monotone-decreasing pin permits it.

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
- **ES-6** deletion gate: asserts the three legacy quarantine files
  (`server/data/transactions-unscoped.ts`, `server/data/payouts-unscoped.ts`,
  `server/data/customers-unscoped.ts`) are ABSENT — pinned to those three paths **by name**,
  explicitly NOT a `*-unscoped.ts` glob, so slice quarantines created by 7D/7F/7G neither
  fail this gate nor hide behind it (fails while they exist — inverted at Q7 after deletion;
  documents the end-state explicitly). ES-4's monotone-decreasing allowlist pin is the
  ratchet that makes the deletion earnable; ES-6 is the end-state check.
- Probe: derived GAP tests added in Q1, flipped to PASS in Q5; gaps back to 0.

## 6. Plan Q0..Q7 (serial, same gates)

Q0 spec (this doc) → Q1 6 failing test files (45-ish tests, red for missing ctx + derived
GAPs) → Q2 scoped DALs + session wiring, quarantine shrinks → Q3 (folded: legacy tests to
demo ctx) → Q4 export routes + MCP + action tests → Q5 probe final + full gates → Q6
8 mutations (aggregate predicate removal, global movement/audit lookup, hardcoded export
org, MCP bypass, quarantine import in prod path, org col in CSV, topup-before-tenant-check,
withdraw-before-tenant-check) → Q7 report + matrix + ADR-0045 + close D-28 + deletion of the
three legacy quarantine files (if earned) + commit one slice.
