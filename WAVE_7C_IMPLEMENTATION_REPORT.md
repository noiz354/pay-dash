# Wave 7C Implementation Report — Customers Tenant Isolation

Date: 2026-09-13 · Branch: `wave-7c-q6-q7` · Predecessors: Wave 7A (Transactions, PASS), Wave 7B (Payouts, PASS)
Spec: `WAVE_7C_CUSTOMERS_SPEC.md` (Proposed → Implemented by this report)
Matrix: `CUSTOMERS_TENANT_ISOLATION_MATRIX.md` · ADR: `docs/adr/0043-customer-tenant-isolation.md`
Commit: Q1–Q7 as one logical slice (follows 290ca99, which carried Q1–Q5; this report covers Q6–Q7)

Invariant proved on the third vertical slice:

> Organization A cannot list, search, open, export, or mutate a customer record of
> Organization B — even knowing the id or email exactly. The directory is *derived*,
> so the invariant composes: scoped ledger in, scoped directory out.

---

## 1. What changed (production code)

- `server/data/customers.ts` — `Customer` + `ManualRecord` gain `organizationId`;
  store is `Map<org, { manual, overrides }>` with the demo partition **eagerly**
  seeded from `PROTOTYPE_SEED` (every other tenant starts empty). **All** reads
  and writes are ctx-first: `listCustomers`, `getCustomer`, `getCustomerTransactions`,
  `getCustomerMetrics`, `createCustomer` (per-tenant duplicate check), `updateCustomer`
  (own→apply, foreign→`TenantIsolationError` `CROSS_TENANT_WRITE` + denial audit,
  unknown→`null`). `buildDirectory(ctx)` pages through the scoped 7A
  `listTransactions(ctx)` and merges the caller's partition under the composite
  key `(organizationId, id)` (spec P-10: same email in two tenants ⇒ two rows).
  `countCustomerTenants` / `soleCustomerOrganizationId` are tenancy *probes* —
  store-touching but row-free by design, composing on the 7A probes. `customersToCsv`
  + `customerIdFromEmail` stay pure (frozen header, no org columns).
- `server/data/customers-unscoped.ts` (new) — quarantine for the 2 remaining derived
  readers (`reports`, `subscriptions`). Hard-fails with `UnscopedCustomerAccessError`
  naming the surface once > 1 tenant has rows. `legacyListCustomers` is deliberately
  non-async so the gate throws synchronously. **Seeded at 2, shrink-only.**
- `server/services/customer-organization-context.ts` (new) — session→tenant seam
  (`resolve`/`require` + `refuseMultiTenantDemo`), mirrors the payout seam.
- Session wiring: `server/actions/customers.ts` (ctx + `TenantIsolationError`→not-found;
  keeps the pre-existing `customer.read` permission — no `customer.create`/`update`
  permission exists in `roles.ts`), `customers/page.tsx`, `customers/[id]/page.tsx`,
  `customer-transactions-panel.tsx` (self-resolves ctx), `recovery-agent/page.tsx`
  (own customer context); `subscriptions/page.tsx` + `reports/builder/page.tsx` via
  the quarantine.
- `app/api/exports/customers/route.ts` (Q2, verified in Q4) — `guardExport().organizationId` →
  `parseOrganizationContext` → `normalizeRequestedOrganization` (client `?organizationId=`
  flagged, never honoured) → `listCustomers(ctx)`; unresolved org → 401 with no body;
  `Cache-Control: private, no-store` + `Vary: Cookie`.
- `server/mcp/domain-tools.ts` (Q2, verified in Q4) — customer tools use the existing
  `scoped` param + `NO_TENANT` refusal (mirrors the transaction pattern; 7B user
  decision stands: reuse, no separate resolver). No change to `mcp/auth.ts`.
- Q2 fixes recorded as invariants: eager demo seeding (a lazy `readPartition` never
  persisted seeds); Q-1b `PROBE_EXPORTS` exemption (probes answer *about* the store,
  never a row — 7B formatter-exemption precedent); S-1c amended (7A test pinned
  `soleLedgerOrganizationId` to exactly `transactions-unscoped` — now exactly
  `[customers.ts, transactions-unscoped.ts]`, justified in-file: a sibling scoped DAL
  composing its own fail-closed gate, no rows flow through the probes, and no
  page/action/route/MCP may import them).

## 2. Security bugs found during the retrofit

**None.** Unlike 7B (which found an unauthenticated money-movement entry point),
the customer slice surfaced no pre-existing auth gap: every mutation already sat
behind a session action, and the retrofit only had to thread the tenant through.
The one design risk — the global email-hash id (spec P-10) — was closed by the
composite key, pinned by U-9.

## 3. Tests (29 new, all green)

| File | Count | Covers |
|---|---|---|
| `server/data/customers.tenant-isolation.test.ts` | 14 | U-1..U-12 (U-2/U-12 ×2 tests) + quarantine dynamic-import + invalid-ctx |
| `server/data/customers-structural.test.ts` | 8 | ctx-first (all 6 fns), no-default, probe exemptions, formatter purity, quarantine allowlist + prod-path guard + slot privacy + CSV vocab + owner column |
| `app/api/exports/customers/route.tenant.test.ts` | 4 | scoped CSV, `?organizationId=` override flag, 401, header stability |
| `server/mcp/customer-tools.tenant.test.ts` | 3 | tenant-bound + foreign-not-found + null-refusal |
| `server/finance/tenant-isolation.probe.test.ts` | ±0 (1 rewritten) | GAP test → PASS (scoped composition proof) + gaps assertion `0` |
| Legacy updates (not new) | 3 files | `customers.test.ts`, `report-options.test.ts`, `subscriptions.test.ts` → demo ctx |

Route + MCP went green **in Q2, not Q4**: the Q-2 prod-path guard forbids wired
paths from touching the quarantine, so Q4 became shrink/verify (quarantine holds
only `subscriptions` + `reports`).

## 4. Mutation checks (Q6 — 8/8 reddened, all reverted, residue grep 0)

M1 partition-bypass → 9 isolation fails (U-1, U-2×2, U-3, U-4, U-6, U-7, U-8, U-9 —
the partition IS the predicate for manual records; the scoped ledger is the second
layer). M2 hardcoded export org → 2 route fails (scoped CSV + override flag; 401 and
headers unaffected — correct). M3 MCP demo-fallback → 1 fail (NO_TENANT refusal; the
2 bound tests unaffected — correct). M4 quarantine import in a wired action → 2
structural fails (consumer set + prod-path guard). M5 `organization_id` in CSV body →
2 fails (Q-3 purity + Q-4 vocab — the string trips both gates). M6 ctx removal from
`createCustomer` → Q-1 fails. M7 foreign-write-check removal → exactly U-8 fails
(surgical). M8 global email uniqueness → exactly U-9 fails (surgical, the P-10 pin).

No mutation was unobservable — every gate proved it can go red, including the two
surgical single-test pins. (7B's lesson stands: an order/uniqueness claim without a
dedicated test is untested; U-8 and U-9 are those tests here.)

## 5. Gates (measured 2026-09-13)

| Gate | Result |
|---|---|
| Full suite | **1472 passed / 17 failed** — 15 pre-existing env (`DATABASE_URL` unset: stripe/xendit webhooks 9, payment-flows 5, project webhook 1) + 2 pre-existing calendar flakes (balance trend, fail identically on clean main). **Zero customer failures.** Delta vs spec baseline (1443/17): **+29 passed, +0 failed.** |
| Typecheck | clean (`tsc --noEmit`) |
| Lint | 0 errors / 40 warnings (== D-17 baseline) |
| Probe | customers PASS (was GAP); **measured gaps = 0** (transactions, payouts, customers all PASS) |

## 6. What stays CONDITIONAL (next: Wave 7D+)

16 modules unscoped (was 18 — customers done); webhook ingress still writes
`"unresolved"`; no RLS; analytics carry no tenant dimension (D-27); `LedgerEntry`
still has no `organizationId` (D-26, P0). Quarantine debt: **D-28** (2 remaining
customer readers — subscriptions, reports — plus the 6 payout readers; fail-closed
today, scope in 7D+).
