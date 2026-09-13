# Wave 7C Handoff — Q6 + Q7 pickup prompt

Branch: `wave-7c-q6-q7` (repo: noiz354/pay-dash, base: main @ 290ca99).

## Context

- This is the 3rd vertical slice of a multi-tenant retrofit. Wave 7A (Transactions)
  merged PR #12; Wave 7B (Payouts+Refunds) committed d337a13 + ADR-0042.
- Contract (ADR-0041/0042, unchanged): OrganizationContext required-first on every
  DAL read/write; no default org; reads→null, writes→TenantIsolationError + denial
  audit; wire answers uniform not-found; fail-closed quarantine with surface-naming.
- Spec: `WAVE_7C_CUSTOMERS_SPEC.md` (root, committed 5983ec8).

## Done (Q0–Q5, all on this branch, verified)

- Q1: 4 test files, 29 tests — GREEN (not red-then-green; route/MCP went green in Q2
  because the Q-2 prod-path guard forbids them from touching the quarantine):
  - `apps/web/src/server/data/customers.tenant-isolation.test.ts` (U-1..U-12)
  - `apps/web/src/server/data/customers-structural.test.ts` (Q-1..Q-5)
  - `apps/web/src/app/api/exports/customers/route.tenant.test.ts` (4)
  - `apps/web/src/server/mcp/customer-tools.tenant.test.ts` (3)
- Q2: scoped DAL `apps/web/src/server/data/customers.ts` (Customer +=
  organizationId, store = `Map<org,{manual,overrides}>`, demo partition EAGERLY
  seeded from PROTOTYPE_SEED, all 6 fns ctx-first, composite key (org,id) per spec
  P-10, update: own→apply / foreign→TenantIsolationError+CROSS_TENANT_WRITE /
  unknown→null; probes countCustomerTenants/soleCustomerOrganizationId compose on
  7A probes);
  NEW seam `apps/web/src/server/services/customer-organization-context.ts`;
  NEW quarantine `apps/web/src/server/data/customers-unscoped.ts`
  (LEGACY_CUSTOMER_SURFACES=['reports','subscriptions'], legacyListCustomers is
  NON-async so the gate throws synchronously per U-12);
  wired: `actions/customers.ts`, `exports/customers/route.ts` (private,no-store +
  Vary:Cookie + 401 sentinel), `domain-tools.ts`, customers pages + panel +
  recovery-agent (seam), subscriptions + reports-builder pages (quarantine).
  NOTE: `actions/customers.ts` uses customer.read permission — NO customer.create/
  update permission exists in roles.ts; do not invent one.
- Q2 fixes you must NOT regress:
  1. eager demo seeding in `store()`;
  2. Q-1b PROBE_EXPORTS exemption in `customers-structural.test.ts`;
  3. S-1c in `transactions-structural.test.ts` amended to exactly [customers.ts,
     transactions-unscoped.ts] with justification comment (sibling scoped DAL
     composing its own fail-closed gate — no rows flow through the probes).
- Q4/Q5: probe gaps = 0 (transactions/payouts/customers all PASS),
  `tenant-isolation.probe.test.ts` GREEN 9/9; full suite 1472 pass / 17 fail =
  pre-existing set (15 env DATABASE_URL unset: stripe/xendit webhooks 9,
  payment-flows 5, project webhook 1 + 2 calendar flakes in balance.test.ts);
  typecheck 0 errors; lint 0 errors / 40 warnings (== D-17 baseline).

## Your work: Q6 then Q7 (serial)

### Q6 — 8 mutation checks

For EACH: temporarily break ONE gate in prod code, run the named tests, assert
RED, FULLY REVERT, assert GREEN, then proceed to next. Residue grep must be 0
after all 8.

| # | Gate to break | Change | Expected RED |
|---|---|---|---|
| M1 | Partition predicate in `buildDirectory` | `customers.ts:282` — replace `readPartition(organizationId)` with all-tenants manual+overrides merge | U-1, U-8 |
| M2 | Export route guard | `exports/customers/route.ts` — replace `guardExport().organizationId` with `DEFAULT_DEMO_ORG` | route.tenant.test.ts (2-3 tests) |
| M3 | MCP `scoped` param | `domain-tools.ts` — remove scoped from customer tools / skip NO_TENANT refusal | customer-tools.tenant.test.ts |
| M4 | Quarantine prod-path guard | `server/actions/customers.ts` — add `import { legacyListCustomers } from "@/server/data/customers-unscoped"` | structural Q-2 |
| M5 | CSV vocab (no org column) | `customers.ts` customersToCsv — add `"organization_id"` to header | structural Q-4 |
| M6 | ctx-first contract | `customers.ts` createCustomer — remove `ctx: OrganizationContext` first param | structural Q-1 |
| M7 | Cross-tenant write check | `customers.ts` updateCustomer — remove customerOwnedByAnotherTenant + TenantIsolationError block | U-9 |
| M8 | Per-tenant email uniqueness | `customers.ts` createCustomer — replace `getCustomer(ctx,email)` dup-check with global cross-tenant email scan | U-6 |

7B lesson (record in report §4): if a mutation is UNOBSERVABLE, say so honestly
and add the missing pin (7B M8 needed new U-13b) — do not fake a red.

### Q7 — docs + commit

Templates: `WAVE_7B_IMPLEMENTATION_REPORT.md`,
`PAYOUTS_TENANT_ISOLATION_MATRIX.md`, `docs/adr/0042-payout-tenant-isolation.md`.

1. `CUSTOMERS_TENANT_ISOLATION_MATRIX.md` (16+ surfaces × A→A PASS / A→B BLOCKED
   × named test evidence + negative-path table + quarantine snapshot:
   LEGACY_CUSTOMER_SURFACES = reports, subscriptions).
2. `WAVE_7C_IMPLEMENTATION_REPORT.md` (§1 what changed, §2 security findings,
   §3 test table, §4 mutation summary, §5 gates table, §6 remaining debt).
3. `docs/adr/0043-customer-tenant-isolation.md` (MADR-lite: Context/Decision/
   Consequences/Alternatives/Verification; Status Accepted).
4. `PROGRESS.md` — flip Customer Tenant Isolation row to PASS, cite ADR-0043.
5. `CHANGELOG.md` — 7C entry (Keep a Changelog style, match 7B entry).
6. `KNOWN_DEBT_REGISTER.md` — update D-28 (quarantine surfaces; customers done).
7. Commit Q1+Q2+Q6+Q7 as ONE logical slice on this branch; do NOT push to main,
   do NOT open a PR unless asked.

## Commands (repo root; apps/web needs pnpm@9.12.0, node>=20.9.0)

```bash
pnpm --filter web test <paths...>   # targeted (Q1 files listed above)
pnpm --filter web test              # full suite (expect 1472+/17 pre-existing)
pnpm --filter web typecheck         # must be 0 errors (tsc --noEmit)
pnpm --filter web lint              # must be 0 errors / 40 warnings
```

## Constraints

- Design-system/token rules in AGENTS.md do not apply to this slice (no UI
  changes); server/data + server/actions + route + MCP only.
- Never invent tokens/permissions; never rewrite shadcn or layout/* components.
- `SCREENS.md` / `screens/` untouched. No `backend/` dir. No RLS, no Prisma changes.
- If a mutation reveals a REAL hole (not a test gap), stop, report, do not commit.
