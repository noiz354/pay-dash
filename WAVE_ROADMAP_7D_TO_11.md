# Wave Roadmap — 7D → 11 (master index, ordering & ownership)

Date: 2026-09-13 · Branch: `arena/01a09b03-pay-dash` (HEAD `af18cc4`, base `main@a4b595a`)
Status: **Live planning document** — the single home for cross-wave ordering, debt ownership,
quarantine ledger and ADR allocation. Per-wave detail stays in each `WAVE_*_SPEC.md`; this file
never duplicates a spec's gap list, it only sequences and owns the *between-wave* contracts.
Scope: **docs-only**. No production code is chartered here.

> **Why this file exists.** Nine specs (7D–7H, 8–11) were drafted as independent documents. Read
> together they had four cross-wave gaps: no sequencer, unallocated ADR numbers, one debt row
> (D-28) covered in substance but cited nowhere, and eight planned quarantine modules with no
> named deleter. Findings log: §7. Tracker sync: §8.

---

## 1. Wave ledger (state at HEAD `af18cc4`)

| Wave | Scope | Spec | Report | ADR | Status |
|---|---|---|---|---|---|
| 7A | Transactions tenant isolation | `WAVE_7A_TENANT_ISOLATION_SPEC.md` | `WAVE_7A_IMPLEMENTATION_REPORT.md` | [0041](docs/adr/0041-canonical-tenant-scoping.md) | ✅ PASS (on `main`) |
| 7B | Payouts + Refunds | `WAVE_7B_PAYOUTS_REFUNDS_SPEC.md` | `WAVE_7B_IMPLEMENTATION_REPORT.md` | [0042](docs/adr/0042-payout-tenant-isolation.md) | ✅ PASS (on `main`) |
| 7C | Customers | `WAVE_7C_CUSTOMERS_SPEC.md` | `WAVE_7C_IMPLEMENTATION_REPORT.md` (+ `WAVE_7C_HANDOFF_Q6_Q7.md`) | [0043](docs/adr/0043-customer-tenant-isolation.md) | ✅ PASS (on `main`) |
| 7D | Billing — subscriptions + invoices (incl. `payInvoice` money mutation) | `WAVE_7D_BILLING_SPEC.md` | — | 0044 (reserved) | 📋 Proposed |
| 7E | Derived surfaces + deletion of the three legacy quarantines | `WAVE_7E_DERIVED_SPEC.md` | — | 0045 (reserved) | 📋 Proposed |
| 7F | Identity & access — team, settings, KYC, onboarding | `WAVE_7F_IDENTITY_SPEC.md` | — | 0046 (reserved) | 📋 Proposed |
| 7G | Ingest & integrity — webhooks, idempotency, links, blocklist (+ risk/timeline verify-only) | `WAVE_7G_INGEST_SPEC.md` | — | 0047 (reserved) | 📋 Proposed |
| 7H | Persistence — org column + Postgres RLS + backfill (closes D-26/D-27) | `WAVE_7H_PERSISTENCE_SPEC.md` | — | 0048 (reserved) | 📋 Proposed |
| 8 | MCP & auth hardening — rate limits, call audit, timing-safe compare, token scopes, sign-in limiter | `WAVE_8_MCP_AUTH_HARDENING_SPEC.md` | — | 0049 (reserved) | 📋 Proposed |
| 9 | Verification — E2E execution, perf budgets, axe sweep, **Release Readiness verdict** | `WAVE_9_VERIFICATION_SPEC.md` | — | none (execution wave) | 📋 Proposed |
| 10 | Platform — Prisma seam swap, offline fonts, single middleware chain, Sentry instrumentation | `WAVE_10_PLATFORM_SPEC.md` | — | 0050 (reserved) | 📋 Proposed |
| 11 | Product — SLA admin, analytics dashboard, QuickPay drawer, invite-expiry cron, offline queue, legacy table retirement | `WAVE_11_PRODUCT_SPEC.md` | — | 0051 (reserved) | 📋 Proposed |

`main` stops at 7C: the nine Proposed specs exist only ahead of `main` (verified
`git diff --name-status main..HEAD` = exactly those nine files, all additions, docs-only).

---

## 2. Dependencies and execution order

### 2.1 Edges (each one cited from a spec header or body, not inferred)

| Edge | Evidence |
|---|---|
| 7D → 7E | 7D P-9: scoping the subscriptions DAL lets `subscriptions/page.tsx` drop its `customers-unscoped` read (the `subscriptions` entry in `LEGACY_CUSTOMER_SURFACES`) |
| 7F → 7E | `LEGACY_LEDGER_SURFACES` contains `onboarding`; the only consumer is `server/data/onboarding.ts` — 7F's slice (verified at HEAD) |
| 7G → 7E | `LEGACY_LEDGER_SURFACES` contains `webhooks`, `links`, `risk`; consumers are `webhooks.ts`, `links.ts`, `risk.ts` — 7G's slice (risk/timeline are 7G P-6/P-7 verify-only, P-9 wires risk callers) |
| 7E → 7H | 7H re-opens `server/dal/ledger.ts` and flips S-6 from refusal to `where: { organizationId }`; the in-memory derived surfaces must already be scoped so the second enforcer lands on a clean tree |
| 7H → 10 | Wave 10 header: predecessor 7H — "the persistence contract"; 10 P-1 swaps the seam to Prisma, and 7H P-8's Prisma-engines integration file is the joint target |
| 7H → 11 | Wave 11 header: predecessor 7H — "analytics org dimension — the data contract this wave's dashboards consume" (D-11 dashboard reads per-org events) |
| all → 9 | Wave 9 header: predecessors = all implementation waves; its deliverable is the READY/NOT-READY verdict, so it must be last |
| 8 ⊥ (none) | Wave 8 touches `server/mcp/*` + sign-in limiter only; its own §5 states "no new quarantine … RLS/ctx untouched" — runnable in parallel with any 7-series slice |

### 2.2 Recommended order

```
7D ──► 7F ──► 7G ──► 7E ──► 7H ──► 10 ──► 11 ──► 9
                     ▲                          ▲
        8 ───────────┴── (any time, parallel) ──┘  (8 must simply precede 9's verdict)
```

1. **7D** (billing) — first, because it also shrinks the customers allowlist that 7E must empty.
2. **7F** (identity) — clears `onboarding`.
3. **7G** (ingest) — clears `webhooks`, `links`, `risk`; **last wave allowed to create an
   `*-unscoped.ts` module** (§4 "may create" column closes at 7G Q7).
4. **7E** (derived + consolidation) — deliberately moved *after* 7F/7G: it is the wave whose
   ES-6 deletes all three legacy quarantines, and that deletion is only earnable once the
   entries owned by 7D/7F/7G are gone (see 2.3). 7E is the consolidation slice, not a middle one.
5. **7H** (persistence) — closes D-26/D-27; unlocks 10 and 11.
6. **10** then **11** — both depend on 7H; 10 first because 11's dashboards are more useful
   against persisted data (10 P-1) than against the in-memory seam.
7. **9** last — publishes the Release Readiness verdict over everything above.
8. **8** anywhere in parallel (no ordering constraint except "before 9's verdict").

### 2.3 Finding G-6 — the ordering constraint that forced 7E later (hard, evidence-backed)

`transactions-unscoped.ts` is deletable only when `LEGACY_LEDGER_SURFACES` is empty. At HEAD
that list has 12 entries and **five of them are not 7E's to clear**:

| Entry | Consumer at HEAD | Owner wave |
|---|---|---|
| `audit`, `balance`, `command-center`, `handoff`, `finance-snapshot`, `reports` | `audit.ts`, `balance.ts`, `command-center.ts`, `handoff.ts`, `finance/snapshot.ts`, `reports/builder/page.tsx` | **7E** (P-1..P-6, P-9) |
| `invoices` | `server/data/invoices.ts` | **7D** |
| `onboarding` | `server/data/onboarding.ts` | **7F** |
| `links`, `webhooks` | `server/data/links.ts`, `server/data/webhooks.ts` | **7G** |
| `risk` | `server/data/risk.ts` | **7G** (P-6 verify-only + P-9 caller wiring) |
| `customers` | *no consumer anywhere, tests included* | **stale** — free shrink, drop at 7E Q1 |

`customers-unscoped.ts` has the same shape: its two entries are `reports` (**7E**) and
`subscriptions` (**7D**, via `subscriptions/page.tsx`). So with the specs' drafted header order
(7D → 7E → 7F → 7G), 7E's Q7 could delete `payouts-unscoped.ts` but **not** the other two —
ES-6 would be unsatisfiable and "delete is earned, not scheduled" would silently become
"delete never happens".

**Fallback if 7E must still run second** (e.g. to close D-28 early): split ES-6 into
**ES-6a** (assert `payouts-unscoped.ts` ABSENT — earnable at 7E, since all six of its entries
are 7E's) and **ES-6b** (assert `transactions-unscoped.ts` + `customers-unscoped.ts` ABSENT —
`it.skip`-free but explicitly gated on 7D/7F/7G having landed, recorded as a deferred deletion
in §4 with a named owner). A deferred deletion must be written into §4 in the same commit; it
may never be dropped silently.

---

## 3. Debt → wave map (`KNOWN_DEBT_REGISTER.md`, all 28 rows)

| Debt | P | Owner wave | Closes at |
|---|---|---|---|
| D-01 Playwright Wave 4 gates never executed | P0 | **9** | Q2 + report |
| D-02 Full E2E inventory NOT_RUN (~224 tests / 30 specs) | P1 | **9** | Q3 (`E2E_INVENTORY_REPORT.md`) |
| D-03 Performance budgets unmeasured | P1 | **9** | Q4 |
| D-04 Accessibility = "touched screens only" | P1 | **9** | Q5 (full-route axe sweep) |
| D-05 Sign-in rate limiting missing | P1 | **8** | Q7 |
| D-06 MCP endpoint rate limiting missing (TODO R1) | P0 | **8** | Q7 |
| D-07 MCP call audit logging missing (TODO R2) | P1 | **8** | Q7 |
| D-08 MCP token compare not constant-time (TODO R3) | P1 | **8** | Q7 |
| D-09 Persistence seam is in-memory stores | P2 | **10** | Q2 (P-1 Prisma swap), after 7H supplies the schema |
| D-10 SLA policies hardcoded, no admin UI | P2 | **11** | Q2–Q5 |
| D-11 Analytics dashboards absent | P1 | **11** | Q2–Q5 (consumes 7H's org dimension) |
| D-12 QuickPay drawer (SCR-038 / FE-005) never built | P2 | **11** | Q2–Q5 |
| D-13 BE-006 invite 7-day expiry cron missing | P2 | **11** | Q2–Q5 |
| D-14 `next/font/google` network dependency | P2 | **10** | Q3 (P-2 self-hosted fonts) |
| D-15 Offline queue (IndexedDB) not implemented | P2 | **11** | Q2–Q5 |
| D-16 Legacy tables coexist (`transactions-table`, `batches-table`) | P3 | **11** | Q2–Q5 (P-6 retirement) |
| D-17 40 pre-existing lint warnings | P3 | *standing baseline* | every wave: **must not worsen** (0 errors / 40 warnings) |
| D-18 Middleware indirection quirk | P3 | **10** | Q4 (P-3) |
| D-19 Sentry config files deprecated | P3 | **10** | Q4 (P-4) |
| D-20 429 UX / `Retry-After` consumption partial | P3 | **8** | Q2 + Q7 |
| D-21 MCP sweep follow-up (`get_webhook_event`, row #20) | P3 | **9** | Q7 checklist (10 explicitly folds it into 9) |
| D-22 `WAVE_1_IMPLEMENTATION_REPORT.md` missing | P2 | **9** | Q7 (V-5) |
| D-23 Firebase SSO bridge | — | **WONTNOW** | unchartered by MoSCoW (10 and 11 both list it out of scope) |
| D-24 Web push notifications | — | **WONTNOW** | unchartered by MoSCoW |
| D-25 Multi-currency | — | **WONTNOW** | unchartered by MoSCoW |
| D-26 `LedgerEntry` has no `organizationId` column | **P0** | **7H** | Q2 migration + RLS, Q7 close |
| D-27 Analytics events carry no tenant dimension | P2 | **7H** | Q2 routing via `trackEvent` + hashed org, Q7 close |
| D-28 Remaining unscoped payout readers + customers quarantine | P1 | **7E** | P-1..P-6 + P-9 + P-11, ES-6, Q7 close |

Coverage check performed 2026-09-13: the union of `D-` citations across the nine specs is
D-01..D-23 + D-26 + D-27; D-28 was the only *chartered-in-substance-but-uncited* row (now cited
by 7E P-11 and by the register row itself); D-23/24/25 are WONTNOW by design. After 7E + 7H +
8 + 9 + 10 + 11 land, **no open row remains** except D-17 (standing baseline) and the three
WONTNOW rows.

---

## 4. Quarantine ledger (the shrink-to-zero ratchet)

**Rule set** (7E P-10 verbatim, applied to every slice): a quarantine file is deleted only when
its `LEGACY_*_SURFACES` allowlist is empty **AND** its structural consumer scan (Q-2/S-2/ES-4
family) is green **AND** the full suite is green without it. Allowlists are frozen at seeding
and **monotone-decreasing** — an entry may never be re-added, and after **7G Q7** no new
`*-unscoped.ts` file may be created at all. Partial success = smaller allowlists, file stays,
and the survivor is recorded below with an owner.

### 4.1 Legacy modules (exist at HEAD `af18cc4`, verified)

| Module | Allowlist | Entries | Cleared by | Deleted by |
|---|---|---|---|---|
| `server/data/transactions-unscoped.ts` | `LEGACY_LEDGER_SURFACES` | 12 (`audit` `balance` `command-center` `customers` `handoff` `invoices` `links` `onboarding` `reports` `risk` `finance-snapshot` `webhooks`) | 7E ×6 · 7D ×1 · 7F ×1 · 7G ×3 · stale ×1 (`customers`) | **7E** (ES-6) — only after 7D/7F/7G |
| `server/data/payouts-unscoped.ts` | `LEGACY_PAYOUT_SURFACES` | 6 (`audit` `balance` `command-center` `finance-snapshot` `handoff` `reports`) | 7E ×6 (= D-28) | **7E** (ES-6) — earnable at 7E |
| `server/data/customers-unscoped.ts` | `LEGACY_CUSTOMER_SURFACES` | 2 (`reports` `subscriptions`) | 7E ×1 · 7D ×1 | **7E** (ES-6) — only after 7D |

Free shrink available immediately: the `customers` entry in `LEGACY_LEDGER_SURFACES` has **no
consumer** in the tree (production or test) — 7E may drop it at Q1 with zero code change, which
the monotone-decreasing pin explicitly permits.

### 4.2 Slice modules (planned — none exist yet)

| Module | Planned by | Allowlist | Conditional? | Deleted by |
|---|---|---|---|---|
| `server/data/subscriptions-unscoped.ts` | 7D | `LEGACY_SUBSCRIPTION_SURFACES` | no | 7D Q7 if empty, else next wave that empties it |
| `server/data/invoices-unscoped.ts` | 7D | `LEGACY_INVOICE_SURFACES` | no | as above |
| `server/data/team-unscoped.ts` | 7F | `LEGACY_TEAM_SURFACES` | no | as above |
| `server/data/settings-unscoped.ts` | 7F | `LEGACY_SETTINGS_SURFACES` | no | as above |
| `server/data/kyc-unscoped.ts` | 7F | — | **yes** — only if a KYC caller cannot be wired in-wave (default = wire all four modules) | as above; creation itself must be recorded here |
| `server/data/webhooks-unscoped.ts` | 7G | `LEGACY_WEBHOOK_SURFACES` | no | as above |
| `server/data/links-unscoped.ts` | 7G | `LEGACY_LINK_SURFACES` | no | as above |
| `server/data/blocklist-unscoped.ts` | 7G | — | **yes** — only if a caller cannot be wired in-wave | as above; creation itself must be recorded here |

Waves 7H (persistence), 8, 9, 10, 11 create **no** quarantine modules: 7H removes refusals
rather than readers, 8 states "no new quarantine" in its own §5, 9 writes no production code,
and 10/11 inherit whatever survives.

### 4.3 Update protocol

Every wave's Q7 updates §4.1/§4.2 in the same commit as its report: entries removed, files
deleted, survivors re-owned. A wave that leaves a survivor without naming an owner here has not
finished Q7.

---

## 5. ADR allocation

Reserved up front in `docs/adr/README.md` §"Reserved ADR numbers" — 0044 (7D), 0045 (7E),
0046 (7F), 0047 (7G), 0048 (7H), 0049 (8), 0050 (10), 0051 (11); Wave 9 plans none. Each spec's
Q7 line now cites its own number, so out-of-order or parallel execution cannot collide. When a
wave lands, its row moves from the reserved table into the index table and the file is written at
the reserved number. Cancelled waves leave the number `WITHDRAWN` — never reused.

---

## 6. Shared gates and baselines (every wave, unchanged from 7A–7C)

| Gate | Baseline as drafted (2026-09-13, all nine specs §0) |
|---|---|
| Full unit/component suite | **1472 passed / 17 failed** — 15 pre-existing env failures (`DATABASE_URL` unset) + 2 pre-existing calendar flakes. May only improve; a wave that adds a failure has not passed Q5 |
| Typecheck | clean |
| Lint | **0 errors / 40 warnings** (== D-17; zero *new* warnings is the standing rule in `PR_REVIEW_GUIDE.md`) |
| Tenant-isolation probe | `server/finance/tenant-isolation.probe.test.ts` green; GAPs = 0 — a wave may *add* GAP pins at Q1 and must flip them by Q5 |
| Q6 mutations | 8 per 7-series slice (4 for Wave 8) reddened then reverted, residue grep = 0 |
| Deliverables at Q7 | implementation report + isolation matrix + ADR + debt-row closure + §4 ledger update + one slice commit |

Each spec re-measures its own baseline at Q1 rather than inheriting these numbers; the table is
the floor, not the measurement.

---

## 7. Findings log (cross-spec audit, 2026-09-13 — read-only pass)

| ID | Finding | Resolution | Status |
|---|---|---|---|
| G-1 | 7D/7F/7G plan up to eight new `*-unscoped.ts` modules; the only deletion gate in the set (7E ES-6) named "all three quarantines" and no wave owned the rest | 7E invariant + ES-6 pinned to the three legacy paths **by name** (never a glob); deletion ownership paragraph added to 7D/7F/7G §4; ledger §4 above is the ratchet; "may create" closes after 7G | ✅ closed (docs) |
| G-2 | D-28 (P1) was covered in substance by 7E P-1..P-6 but cited nowhere → the register row would have hung open after the work landed | 7E P-11 added (explicit D-28 ↔ P-1..P-6/P-9 mapping, incl. the register-vs-spec line-number distinction) + 7E Q7 closes D-28 + register row now names Wave 7E as owner of record | ✅ closed (docs) |
| G-3 | `docs/adr/README.md` indexed 41 rows against 43 ADR files (0042/0043 missing), and eight specs planned "an ADR" with no number | 0042/0043 rows added; 0044..0051 reserved in a dedicated table; every Q7 line now cites its number | ✅ closed (docs) |
| G-4 | No tracker knew the new waves existed: `PROGRESS.md` milestones stop at Phase 8, `IMPLEMENTATION_PROGRESS.md` gates stop at Wave 5, `TODO.md` is still framed as "Wave 4 leftovers / PR #9" | This file + pointers from `TODO.md` and the debt register header. The milestone trackers themselves are **not** rewritten here (they track a different taxonomy and belong to the waves' Q7 reports) | ✅ closed (docs) |
| G-5 | Execution order existed only implicitly in spec headers ("Predecessors:") | §2 above: explicit edge table with evidence + one recommended order + parallelism note for Wave 8 | ✅ closed (docs) |
| G-6 | **Discovered while fixing G-1:** with the drafted order (7D → 7E → 7F → 7G), 7E's ES-6 is unsatisfiable — `LEGACY_LEDGER_SURFACES` still holds `invoices` (7D), `onboarding` (7F), `links`/`webhooks`/`risk` (7G), and `LEGACY_CUSTOMER_SURFACES` still holds `subscriptions` (7D) | Order changed to **7D → 7F → 7G → 7E → 7H** (§2.2) with 7E as the consolidation slice; ES-6a/ES-6b split documented as the fallback (§2.3). Spec bodies left intact — the reorder is a roadmap decision, and 7E's own §6 remains valid once its predecessors land | ⚠️ closed in roadmap; **needs a human decision** if 7E must run second |

Not a finding, recorded for accuracy: commits `88297a4` and `40ba1e3` (the 7D–7H drafting
commits) are **not reachable** from this shallow checkout — `af18cc4` is a grafted root with no
parent. Everything above was verified against the working tree at `af18cc4`, not against those
hashes. Spot-checks performed: 12 `file:line` citations in 7E, 6 in the D-28 register row,
`risk.ts:171` + `timeline.ts:91` in 7G, all three legacy allowlists and their consumers — **all
accurate at HEAD**.

---

## 8. Tracker sync and branch state

- `TODO.md` — §"(c) Remediasi audit MCP" R1–R6 **is** Wave 8's scope (R1 → D-06, R2 → D-07,
  R3 → D-08, R5 → token scopes; R4/R6 are local-machine config, not repo work). The Wave 4
  leftover list **is** Wave 9's scope (D-01..D-04). Pointers added there; the checkboxes stay
  where they are until the waves execute them.
- `KNOWN_DEBT_REGISTER.md` — header now carries the wave-ownership summary; D-28 names its owner.
- `PROGRESS.md` / `IMPLEMENTATION_PROGRESS.md` — deliberately untouched: they track the
  prototype→production phases and the UX-redesign ticket registry, and each wave's Q7 report is
  the right place to flip their rows.
- Branch/merge: the nine specs + this roadmap are ahead of `main` (which stops at 7C). Merge
  strategy is unchanged from 7A–7C — one slice per PR, spec + report + matrix + ADR together,
  debt row closed in the same PR that produces the evidence.
