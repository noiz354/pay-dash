# Changelog

All notable changes. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: SemVer once `apps/web` ships (prototype is `0.x`).

## [Unreleased]

### Added
- **Wave 7F — Identity & access tenant isolation (team, settings, KYC, onboarding)** (ADR-0046). 29 DAL functions across four modules became ctx-first over three partitioned stores: `server/data/team.ts` (`Member.organizationId`, `Map<org, { members }>`, prototype roster seeded into `DEFAULT_DEMO_ORG` only, 9 ctx-first functions, composite key `(organizationId, id)` over the pure `memberIdFromEmail` hash, **roles per tenant**, `changeMemberRole` pinned tenant → row → role, `membersToCsv` still pure with no tenancy column), `server/data/settings.ts` (`Map<org, TenantSettingsState>`, 15 ctx-first functions, `demoState()` vs a new **`freshState()`**, partitions materialised on first write only, `ApiKey.organizationId`, `listApiKeys` partitioned before its environment filter, `updateMerchantProfile` pinned tenant → read → patch → write, per-tenant IP allowlist uniqueness, row-free probes), `server/data/kyc.ts` (`Map<org, KycSubmission>`, presence *is* "submitted", 4 ctx-first functions, still unseeded per ADR-0019 so "nothing submitted" and "submitted elsewhere" are the same `null`) and `server/data/onboarding.ts` (`getOnboardingStatus(ctx)` — one context feeds all six reads, ledger via the scoped 7A `getLedgerRows(ctx)`). New seam `server/services/identity-organization-context.ts` (`resolveIdentityOrganizationContext` for reads, `requireIdentityOrganizationContext(permission)` for writes, `identityAccessCan`/`identityAccessDeniedState`, uniform `IDENTITY_NOT_FOUND_MESSAGE`, `countIdentityTenants()` for the `refuseMultiTenantDemo` gate). **Three quarantine modules earned** (deviation from the drafted §4, report §7.1): `server/data/team-unscoped.ts` (`LEGACY_TEAM_SURFACES = ["audit"]`), `server/data/settings-unscoped.ts` (`LEGACY_SETTINGS_SURFACES = ["audit"]`), `server/data/kyc-unscoped.ts` (`LEGACY_KYC_SURFACES = ["handoff"]` — the spec's conditional module) — read-only, `@deprecated`, surface-naming, fail closed above one tenant. Legacy allowlist shrank in the same commit: `LEGACY_LEDGER_SURFACES` **11 → 10** (`onboarding`) and S-2's `ALLOWED_UNSCOPED_CONSUMERS` 10 → 9, the clearance Wave 7E's ES-6 gate needed. Edges wired: 7 pages (`team`, `settings` + 4 children, `kyc`, `onboarding`, `ai-journal/readiness-agent`) + `components/dashboard/dashboard-header.tsx`, the team CSV export (`guardExport()` org *is* the predicate, `?organizationId=` normalized and flagged, unresolved org ⇒ 401 no body, `private, no-store` + `Vary: Cookie`), 5 MCP tools (`list_team_members`, `get_merchant_profile`, `get_settings_overview`, `get_kyc_submission`, `get_onboarding_status`) bound to the existing `registerDomainTools` organization param with the shared `NO_TENANT` refusal (no change to `mcp/auth.ts`), and 3 action modules (16 actions). `server/data/invoices.ts#getBillingSummary` now reads `getMerchantProfile(ctx)`, closing the dependency Wave 7D recorded at its call site. 119 new tests (team 20, settings 18, KYC 11, onboarding 7, structural 31, export route 6, MCP 7, actions 19) + 2 probe GAP rows flipped to CLOSED + 8/8 mutation checks reddened (`scripts/wave-7f-q6-mutations.py`).
- `WAVE_7F_IMPLEMENTATION_REPORT.md`, `IDENTITY_TENANT_ISOLATION_MATRIX.md`; debt **D-28** narrowed (`onboarding` refusal retired), **D-09** count corrected (11 modules unscoped, was 15), new **D-29** (identity quarantines ride 7E/7G derived surfaces).
- **Wave 7D — Billing tenant isolation (subscriptions + invoices)** (ADR-0044). Tenant-partitioned billing DALs: `server/data/subscriptions.ts` (`organizationId`, `Map<org, { plans }>`, ctx-first `listSubscriptions`/`getSubscription`/`createSubscription`, composite key `(organizationId, id)` over the pure `subscriptionIdFrom` hash, prototype plans seeded into `DEFAULT_DEMO_ORG` only) and `server/data/invoices.ts` (`organizationId`, `Map<org, { payments }>`, ctx-first `listInvoices`/`getInvoice`/`getInvoiceTransactions`/`getInvoiceLineItems`/`getInvoiceTimeline`/`getBillingSummary`/`invoiceStatementCsv`/`payInvoice`, **derivation scoped and paged** through `listTransactions(ctx, …)` — which also removes the pre-existing 100-row cap that silently understated fees). `payInvoice` is a money mutation with a pinned order: scope → read → attribute → `recordTenantDenial` + `TenantIsolationError` → write into the caller's partition only, so a colliding month key (`INV-2026-03-LEDGER` held by two tenants) settles one bill. **No quarantine module was created** (deviation from the drafted §4: every caller was wireable in-wave, and `billing-structural.test.ts` R-4 now forbids a billing `*-unscoped` file); the two legacy allowlists shrank instead — `LEGACY_LEDGER_SURFACES` 12 → 11 (`invoices`) and `LEGACY_CUSTOMER_SURFACES` 2 → 1 (`subscriptions`) — plus S-2's `ALLOWED_UNSCOPED_CONSUMERS` dropped `server/data/invoices.ts`. New seam `server/services/billing-organization-context.ts` (resolve/require + `refuseMultiTenantDemo` over `countBillingTenants()`); 3 export routes bound to `guardExport().organizationId` (`private, no-store` + `Vary: Cookie`, unresolved org ⇒ 401, client `?organizationId=` flagged); 3 MCP tools (`list_invoices`, `get_invoice`, `list_subscriptions`) bound to the `registerDomainTools` org param with the shared `NO_TENANT` refusal; 4 actions tenant-bound (`payInvoiceAction`, bulk `payInvoicesAction` — per-row scoping with an honest `{paid, failed}` count, `createInvoiceAction`, `createSubscriptionAction`) mapping `TenantIsolationError` to the uniform not-found string; 3 pages wired. 78 new tests (isolation 12+16, structural 17, routes 6+6+6, MCP 5, actions 10) + 2 probe GAPs flipped to CLOSED + 8/8 mutation checks reddened (`scripts/wave-7d-q6-mutations.py`).
- `WAVE_7D_IMPLEMENTATION_REPORT.md`, `BILLING_TENANT_ISOLATION_MATRIX.md`; debt **D-28**/**D-09** updated (15 modules unscoped, was 17).
- **Wave 7C — Customers tenant isolation** (ADR-0043). Tenant-partitioned customer DAL (`server/data/customers.ts`: `organizationId`, `Map<org, { manual, overrides }>`, ctx-first reads/writes + derived composition scoped ledger in → scoped directory out, composite key `(organizationId, id)` with pure `customerIdFromEmail`, per-tenant email uniqueness, `TenantIsolationError`+audit on foreign update, `customersToCsv` frozen without org columns), fail-closed quarantine for the 2 remaining derived readers (`server/data/customers-unscoped.ts`, `LEGACY_CUSTOMER_SURFACES = ["reports","subscriptions"]`, `legacyListCustomers` NOT async so gate throws synchronously), session→tenant seam (`server/services/customer-organization-context.ts`), scoped CSV export route (`private, no-store` + `Vary: Cookie`, client `?organizationId=` flagged) and tenant-bound MCP customer tools (reuse `registerDomainTools` org param). 29 new tests (isolation 14, structural 8, route 4, MCP 3 + probe flip) + 8 mutation checks; probe customers PASS.
- `WAVE_7C_IMPLEMENTATION_REPORT.md`, `CUSTOMERS_TENANT_ISOLATION_MATRIX.md`; debt **D-28** updated (customers done, 2+6 readers quarantined fail-closed).
- **Wave 7B — Payouts + Refunds tenant isolation** (ADR-0042). Tenant-partitioned payout DAL
  (`server/data/payouts.ts`: `organizationId` + `createdBy`, ctx-first reads/writes/mutations,
  per-org settings/bank, dual-control after the tenant check), fail-closed quarantine for the 6
  remaining derived readers (`server/data/payouts-unscoped.ts`, allowlist shrunk 8 → 6),
  session→tenant seam (`server/services/payout-organization-context.ts`), scoped CSV export routes
  (`private, no-store` + `Vary: Cookie`) and tenant-bound MCP payout tools. 56 new tests
  (isolation, structural, route, MCP, actions, probe) + 8 mutation checks; probe payouts PASS,
  GAP moves to `customers.listCustomers` (Wave 7C).
- `WAVE_7B_IMPLEMENTATION_REPORT.md`, `PAYOUTS_TENANT_ISOLATION_MATRIX.md`; debt **D-28**
  (remaining unscoped payout readers).

### Fixed
- **Sixteen identity actions had no authorization at all** (found during the Wave 7F retrofit, not listed in the spec's P-1..P-10): every team action (invite, bulk re-role, bulk deactivate, reactivate, resend, revoke), every settings action (merchant profile, notification channels/topics, key mint/revoke/roll, IP allowlist add/remove, developer toggle) and `removeKycDocumentAction` ran for anybody who could POST a form. Each now resolves the tenant *and* asserts `team.manage` / `settings.manage` / `kyc.submit` through `identity-organization-context.ts`, validation-first so field errors stay honest, and fails closed **before** any store access. Reported as a security finding, not cleanup.
- **`submitKycDocumentAction` resolved its context and then dropped it** (Wave 7F): it called `requireOrgContext("kyc.submit")`, used the org id for the provider call, and stored the document in a process-wide slot — the same defect Wave 7D found in `createSubscriptionAction`. The resolved tenant now reaches the DAL, so merchant A's incorporation document (filename, jurisdiction, submission time) is no longer merchant B's.
- **A non-demo tenant used to start life as the demo persona** (Wave 7F): the prototype merchant profile, three API keys (two live) and two allowlisted IPs were seeded process-wide, so every tenant's settings hub answered "Acme Corporation LLC" with its tax id and a populated secret ring. `freshState()` gives any other tenant a blank legal identity, no keys and no IP rules; the notification *catalog* stays shared because it is vocabulary, not data.
- **Duplicate ids inside one partition** (Wave 7F): `Date.now().toString(36)` alone minted the same id twice in one millisecond, so a `find`-based read answered the wrong row — `rollApiKey` left the *new* key answering for the old id and the revoked key read `ACTIVE`. Keys, IP rules and invites now carry a monotonic sequence plus entropy. Isolation never depended on id secrecy; a duplicate id inside a partition is a correctness bug regardless.
- **Unauthenticated money movement closed** (found during the Wave 7B retrofit):
  `withdrawBalanceAction` previously required no session. It now requires authentication and a
  tenant-scoped account (cross-tenant ⇒ same not-found as an unknown account), locked by
  action-level regression tests. Reported as a security finding, not cleanup.
- **Wave 7A — Transactions tenant isolation** (`arena/01a095f2-pay-dash`, ADR-0041). `domain/tenancy/organization-context.ts`
  (`OrganizationContext`: required, no default organization) + tenant-scoped transaction DAL
  (`server/data/transactions.ts`, store partitioned by `(organizationId, id)`), fail-closed quarantine for
  the 11 not-yet-scoped readers (`server/data/transactions-unscoped.ts`), session→tenant seam
  (`server/services/transaction-organization-context.ts`), and a `TENANT_ISOLATION_DENIED` audit action
  with a bounded denial sink. 136 new tests (isolation, structural, route, MCP, seam) and 1 more in the Wave 6 probe — plus 10 mutation checks proving each gate can fail; the Wave 6
  isolation probe now prints 5 PASS / 1 GAP. Gates: list/search/detail/mutation/export/IDOR all PASS.
- `WAVE_7A_TENANT_ISOLATION_SPEC.md`, `TRANSACTIONS_TENANT_ISOLATION_MATRIX.md`,
  `WAVE_7A_IMPLEMENTATION_REPORT.md`; debt **D-26** (no tenant column on `LedgerEntry` → Postgres
  transaction reads refused) and **D-27** (analytics tenant dimension).

### Fixed
- **Cross-tenant exposure closed on the transaction slice** (Wave 7A): ledger list/search/detail, retry,
  refund request/approve/reject/execute, create, CSV export, dashboard/AI-journal aggregates, and the MCP
  `list_transactions`/`get_transaction`/`refund_transaction` tools now all require the caller's
  organization. `guardExport()`'s resolved organization is finally used as the CSV query predicate; the
  provider transaction read no longer defaults to the demo organization; the unscoped Postgres ledger
  readers (`pg-stores`, `server/dal/ledger.ts`) are deleted or refused pending D-26.
- Console triage (2026-09-02): locale-strip for `/_next/static` in `proxy.ts`, `eslint` ignores for `.next`, `PAYMENT_METHODS` client-safe boundary, `web-vitals` guard, `/api/vitals` 204, Sentry dedupe, support `nativeButton` — 286 tests pass, lint 0 errors, `PROGRESS.md` Milestone 7 → ✅.

### Added
- `docs/adr/` with 5 accepted ADRs (0001 App Router, 0002 Tailwind+shadcn, 0003 Postgres+Prisma, 0004 Auth, 0005 Observability).
- `docs/STACK.md` (golden-path deps/commands) and `docs/ARCHITECTURE.md` (layout + boundaries).
- `docs/STORYBOOK.md`, `docs/SEARCH.md`, `docs/QUEUES.md` (previously deferred — now unskipped).
- `CONTRIBUTING.md`, `CHANGELOG.md`.
- `SCREENS.md` Migrated Route column; `PROGRESS.md` phased tracker (0 Scaffold → 6 Testing/CI).

### Changed
- `AGENTS.md` → compact structure + Docs + Tooling note (`codegraph init` for `apps/web`).
- `README.md` → Production Migration section.

## [0.1.0] - 2026-08-29

- Reorganized into `design-system/` and `screens/{mobile,desktop}`; added `README.md`, `AGENTS.md`, `PROGRESS.md`, `SCREENS.md` (14 mobile + 19 desktop prototypes).
