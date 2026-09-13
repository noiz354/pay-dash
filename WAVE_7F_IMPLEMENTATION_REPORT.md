# Wave 7F Implementation Report — Identity & Access Tenant Isolation

Date: 2026-09-13 · Branch: `arena/01a09b03-pay-dash` · Base: `f7cb1e2` (Wave 7D PASS)
Spec: `WAVE_7F_IDENTITY_SPEC.md` · ADR: `docs/adr/0046-identity-tenant-isolation.md` · Evidence: `IDENTITY_TENANT_ISOLATION_MATRIX.md`
Slice: `server/data/team.ts`, `server/data/settings.ts`, `server/data/kyc.ts`, `server/data/onboarding.ts`
Verdict: **PASS** — Q0..Q7 complete, 119 new tests green, 8/8 mutations reddened, gates at the pre-existing baseline.

---

## 1. What changed (production code)

**DALs — 29 functions became ctx-first over three partitioned stores** (1302 insertions / 281 deletions
across 19 production files):

| Module | Before | After |
|---|---|---|
| `server/data/team.ts` (289 → 517 lines) | one process-wide `{ members }` roster; 9 unscoped functions | `Map<org, { members }>`; demo roster seeded eagerly; `Member.organizationId`; 9 ctx-first functions; `countTeamTenants` / `soleTeamOrganizationId` probes; exact-owner attribution + denial for foreign writes; `membersToCsv` still pure with no tenant column |
| `server/data/settings.ts` (445 → 715 lines) | one process-wide `{ merchant, notifications, keys, developer }` record; 15 unscoped functions | `Map<org, TenantSettingsState>`; `demoState()` (the Acme persona, 3 keys, 2 IP rules) vs **`freshState()`** (blank legal identity, shared topic catalog, no keys, no IP rules, `autoDebit: false`); partitions materialise on first *write* only; `ApiKey.organizationId`; 15 ctx-first functions; 2 probes; `defaultTopics()` extracted as product vocabulary; ids minted uniquely per mint |
| `server/data/kyc.ts` (92 → 139 lines) | one `{ submission }` slot; 4 unscoped functions | `Map<org, KycSubmission>` — presence *is* "submitted"; still unseeded (ADR-0019); 4 ctx-first functions; 2 probes |
| `server/data/onboarding.ts` (259 → 300 lines) | `getOnboardingStatus()` resolving a payout ctx internally, reading the ledger through the 7A quarantine | `getOnboardingStatus(ctx)`: one context feeds all six reads (profile, bank accounts, destination, keys, completeness, submission); ledger via scoped `getLedgerRows(ctx)`; webhook count degraded to `0` when 7G's unscoped store refuses (see §6) |

**New modules (4):**

- `server/services/identity-organization-context.ts` (165 lines) — the slice seam:
  `resolveIdentityOrganizationContext` (reads), `requireIdentityOrganizationContext(permission)` (writes),
  `identityAccessCan`, `identityAccessDeniedState`, `IDENTITY_NOT_FOUND_MESSAGE`, and
  `countIdentityTenants()` folding team ∪ settings ∪ KYC for the `refuseMultiTenantDemo` gate.
- `server/data/team-unscoped.ts` (100), `server/data/settings-unscoped.ts` (88), `server/data/kyc-unscoped.ts` (97)
  — read-only, `@deprecated`, surface-naming, fail closed above one tenant. Allowlists frozen at
  `["audit"]`, `["audit"]`, `["handoff"]`.

**Edges wired (15 paths):** 7 pages (`team`, `settings` + 4 children, `kyc`, `onboarding`,
`ai-journal/readiness-agent`), `components/dashboard/dashboard-header.tsx`, 3 action modules, the team CSV
export route, and 5 MCP tools (`list_team_members`, `get_merchant_profile`, `get_settings_overview`,
`get_kyc_submission`, `get_onboarding_status`).

**Cross-slice closures:**

- `server/data/invoices.ts` — `getBillingSummary(ctx)` now reads `getMerchantProfile(ctx)`, closing the
  dependency 7D recorded at the call site ("settings is unscoped until Wave 7F"). The `autoDebit` boolean
  is now *this* merchant's mandate.
- `server/data/audit.ts` → `legacyListApiKeys("audit")` + `legacyListMembers("audit", …)`.
- `server/data/handoff.ts` → `legacyKycSubmission("handoff")`.
- `server/data/transactions-unscoped.ts` — `LEGACY_LEDGER_SURFACES` **11 → 10** (`onboarding` retired).
- `transactions-structural.test.ts` S-2 `ALLOWED_UNSCOPED_CONSUMERS` **10 → 9** (`server/data/onboarding.ts`).

## 2. Security findings

1. **Privilege escalation (P-2, closed).** `changeMemberRole(id, role)` re-roled *any* member in the
   process by id. Any caller could promote itself in another organization. Now tenant → row → role, with
   the refusal attributed, audited and thrown; FS-2 pins the order in source and M7 reddens the behaviour.
2. **Secret enumeration (P-4, closed).** `listApiKeys()` returned every tenant's key ring — names,
   environments, scopes, masks and creation times. Now partition-bound *before* the environment filter.
   The plaintext secret is still revealed exactly once at creation and is never stored (FS-3 asserts no
   `secret` field on the row and no plaintext in any list/get/revoke path).
3. **No authorization at all (found at Q2, not in the spec — closed).** All six team actions, all nine
   settings actions and `removeKycDocumentAction` ran for anybody who could POST a form: invite members,
   change roles, deactivate staff, rewrite a legal identity, mint/roll/revoke API keys, edit the IP
   allowlist, destroy a compliance record. Each now resolves the tenant *and* asserts `team.manage` /
   `settings.manage` / `kyc.submit` through the seam, validation-first.
4. **Resolved-then-dropped context (closed).** `submitKycDocumentAction` called
   `requireOrgContext("kyc.submit")`, used the org id for the provider call, and then stored the document
   in a process-wide slot — the same defect 7D found in `createSubscriptionAction`. The context now reaches
   the DAL.
5. **PII disclosure (P-5, closed).** One KYC slot meant merchant A's incorporation document (filename,
   jurisdiction, submission time) was merchant B's. Unseeded + partitioned, "nothing submitted" and
   "submitted by somebody else" are now the same `null`, so there is no oracle to probe.
6. **Legal-identity overwrite (P-3, closed).** `updateMerchantProfile(patch)` rewrote one shared record,
   so any caller's edit changed every merchant's legal name and tax id. The patch carries no tenant field
   and the write lands only in the caller's partition (F-13b pin).
7. **Default-as-leak (found at Q2, closed).** Seeding the prototype persona process-wide meant every new
   tenant "started as" Acme Corporation LLC with its tax id, three API keys (two live) and two allowlisted
   IPs. `freshState()` gives a non-demo tenant a blank identity and no secrets instead; the settings hub
   card honestly reads `Incomplete`.
8. **Roster export (P-7, closed).** The CSV route discarded `guardExport()`'s organization and listed
   every member in the process, with `Cache-Control: no-store` but no `private` and no `Vary: Cookie` — a
   shared cache could hold one tenant's staff list. Now guard-org-as-predicate, `?organizationId=`
   normalized and flagged, unresolved org ⇒ 401 with no body, `private, no-store` + `Vary: Cookie`.
9. **MCP token ≠ tenant (P-8, closed).** Five identity tools ran tenant-free behind one shared bearer
   token. They now use the existing `registerDomainTools(server, organization)` seam (no change to
   `mcp/auth.ts`) and refuse with the shared `NO_TENANT` payload — pinned to the refusal *text* plus zero
   identity payload, per the 7D M4 lesson.
10. **Id minting collided within a millisecond (found by the new tests, fixed).** `Date.now().toString(36)`
    alone produced the same id for two mints in one tick. Inside a partition that meant two rows answering
    the same `find`: `rollApiKey` left the *new* key answering for the old id, so the revoked key read
    `ACTIVE`. Keys, IP rules and invites now carry a monotonic sequence plus entropy. Isolation never
    depended on id secrecy, but a duplicate id inside one partition is a correctness bug in its own right.
11. **Derived-surface amplification (P-6, closed).** `getOnboardingStatus()` folded five stores into one
    answer, so it printed another merchant's legal name in the header, counted everybody's keys and settled
    transactions, and named another tenant's KYC document — with no row-level access anywhere.

## 3. Tests (119 new across 8 files, all green; 2 probe GAP rows flipped)

| File | Count | Covers |
|---|---|---|
| `server/data/team.tenant-isolation.test.ts` | 20 | F-1 list/filters/seed ownership, F-2 detail ⇒ ∅, F-3 invite binds to ctx + composite key + **forced exact id collision**, F-4 role change (own/foreign/unknown + denial contents), F-5 lifecycle + destructive revoke, F-13a order pin incl. raw-store partition sweep, F-12b role catalog + probes + slot privacy + CSV purity, F-12c no-ctx |
| `server/data/settings.tenant-isolation.test.ts` | 18 | F-6 profile per tenant + F-13b order pin + copies, F-7 channels/topics/overview aggregates, F-8 key ring (no metadata leak, env filter, detail ⇒ ∅, revoke/roll refusal with no replacement minted, reveal-once), F-8b developer toggle + per-tenant IP uniqueness + foreign removal, F-12d probes/slot privacy/no-ctx |
| `server/data/kyc.tenant-isolation.test.ts` | 11 | F-9 unseeded, read ⇒ ∅, two tenants at once, resubmit, clear (own vs inexpressible foreign), copies, F-9b completeness from the caller's own profile, F-9c probes/slot/no-ctx |
| `server/data/onboarding.tenant-isolation.test.ts` | 7 | F-10 header/profile, compliance row, technical (keys + own settled ledger), bank section, progress arithmetic, **two-tenant availability** (D-28 retired for this surface), no-ctx |
| `server/data/identity-structural.test.ts` | 31 | FS-1 ctx-first + no-default + no other exported store reader + `server-only`, FS-2 both order pins in source + invite owner from ctx, FS-3 secret hygiene (mask not secret, reveal-once, listing cannot widen), FS-4 quarantine existence/deprecation/read-only/frozen allowlists/prod-path scan/consumer-set pin/ledger-allowlist shrink/probe reachability, FS-5 CSV vocabulary + purity + slot privacy + owner columns |
| `app/api/exports/team/route.tenant.test.ts` | 6 | F-11 scoped CSV, filters narrow inside the tenant, `?organizationId=` never wins, header vocabulary with no org column, `private, no-store` + `Vary: Cookie`, unresolved org ⇒ 401 no body |
| `server/mcp/identity-tools.tenant.test.ts` | 7 | F-12 five tools bound to the request tenant, key inventory never crosses (incl. the aggregate count), KYC per binding, onboarding derived per binding, **no tenant ⇒ refusal text with zero payload**, malformed tenant ⇒ same |
| `server/actions/identity.tenant.test.ts` | 19 | team (invite binds, no session ⇒ fail closed before any write, no permission ⇒ refused, validation-first, bulk re-role/deactivate scope per row with honest counts, foreign id ⇒ same string as unknown, own lifecycle end to end), settings (profile write isolation, no session ⇒ byte-identical profile, key mint + reveal-once, revoke/roll uniform answers, IP allowlist), KYC (ctx reaches the DAL, removal authorized and per tenant, validation before authorization) |
| `server/finance/tenant-isolation.probe.test.ts` | 13 (+2 flipped) | the two Wave 7F `CURRENT GAP` rows rewritten as CLOSED rows; matrix `gaps.length === 0` |

Legacy migrations (Q3, folded): `team.test.ts` 7, `settings.test.ts` 20, `kyc.test.ts` 5,
`onboarding.test.ts` 7 moved onto an explicit demo context, plus 3 call sites in `invoices.test.ts`
(the auto-debit summary) and `audit.test.ts` (a key mint). No legacy assertion was weakened; the demo
tenant is where the prototype values live, so the expectations are unchanged.

## 4. Mutation checks (Q6 — 8/8 reddened, all reverted, residue grep 0)

`scripts/wave-7f-q6-mutations.py` applies each mutation, runs the tests that must catch it, restores from
backup.

| # | Gate to break | Change | Observed |
|---|---|---|---|
| M1 | Member predicate | `team.ts` `listMembers`: `readPartition(org).members` → all-partition `flatMap` | **RED** (6 failed) |
| M2 | Global lookup | `team.ts` `getMember`: search every partition | **RED** (4 failed — F-2 detail, F-3 composite key, the forced-collision pin, FS-1 store-reader scan) |
| M3 | Hardcoded export org | `exports/team/route.ts`: `guard.organizationId` → `DEFAULT_DEMO_ORG` | **RED** (3 failed) |
| M4 | MCP bypass | `domain-tools.ts` `list_team_members`: `if (!scoped) return NO_TENANT` → demo fallback | **RED** (2 failed). The no-tenant assertions were pre-pinned to the refusal text plus "no identity payload at all", so the 7D M4 lesson (a loose `/organization\|tenant/i` regex that a *successful* payload also satisfies) did not recur |
| M5 | Quarantine back in a prod path | `app/[locale]/team/page.tsx`: import `legacyListMembers` and read through it | **RED** (2 failed — FS-4 prod-path scan + consumer-set pin) |
| M6 | API key metadata leak | `settings.ts` `listApiKeys`: `readState(org).keys` → all-partition `flatMap` | **RED** (3 failed, across the settings and MCP suites) |
| M7 | Role before tenant check | `team.ts` `changeMemberRole`: re-role the id in *any* partition before `scopeOf(ctx)` | **RED** (4 failed — F-4, F-13a raw-store sweep, FS-2 source order, bulk action counts) |
| M8 | KYC cross-tenant read | `kyc.ts` `getKycSubmission`: fall back to any tenant's document | **RED** (2 failed) |

No survivors. Two design notes from this pass: M7 is caught by *both* a source-order pin and a behaviour
pin, because a write-before-check leaves a stray role change in a partition the victim's view never
inspects (the 7D M8 lesson); and M2/M7 are additionally caught by the forced id-collision test added this
wave, which asserts each tenant resolves and writes its own row when two partitions hold the same id
(the 7D M7 lesson).

## 5. Gates (measured 2026-09-13, this sandbox)

| Gate | Result |
|---|---|
| Full suite | **1681 passed / 2 failed / 3 failed files** (Wave 7D baseline at `f7cb1e2`: 1560 / 2 / 3). The 2 failures are the pre-existing `balance.test.ts` trend expectations that drift with the wall clock; the 3rd failed file and one of the other two are `server/mcp/customer-tools.tenant.test.ts` and `server/mcp/server.integration.test.ts`, which cannot collect because `@prisma/client` needs `prisma generate` and the engine binaries are unreachable in this sandbox (BLOCKED_BY_ENVIRONMENT, pre-existing). **Zero identity failures.** |
| Typecheck | clean (`tsc --noEmit`) |
| Lint | **0 errors** / 40 warnings (== D-17 baseline; none in a file this wave touched) |
| Tenant-isolation probe | 13/13 green; both Wave 7F GAP rows CLOSED; matrix `gaps.length === 0` |
| Identity suite in isolation | 8 new files / 119 tests green; plus 6 migrated legacy files (team 7, settings 20, kyc 5, onboarding 7, audit 8, invoices 16) and `handoff.test.ts` 19 green through the new KYC quarantine |
| Test delta vs 7D | **+121 tests** (119 new + 2 probe rows rewritten in place) |

## 6. What stays CONDITIONAL / recorded debt (next)

1. **`kyc-unscoped.ts` was created — the spec's conditional module.** Forced by `server/data/handoff.ts`
   (`kyc_review` lane). Recorded in `WAVE_ROADMAP_7D_TO_11.md` §4.2 with the caller that forced it, per
   the spec's last-resort rule. Owner: Wave 7E.
2. **`audit.ts` and `handoff.ts` ride three quarantines** that fail closed above one tenant, so the audit
   log and handoff queue are single-tenant-demo-only until 7E's derived-surface retrofit. Loud, not leaky.
3. **Onboarding's webhook count is still cross-slice (7G).** `listWebhooks` is process-wide *and* its store
   seeds itself from the 7A ledger quarantine, so in a multi-tenant ledger process the read refuses.
   `callbackEventCount()` degrades to `0` — the conservative answer, since substituting another tenant's
   count would be the leak — and matches the refusal by error *name* rather than by import, so
   `onboarding.ts` does not become a quarantine consumer (FS-4 would rightly fail). Recorded at the call
   site; owner: Wave 7G.
4. **The webhook count in the Technical Setup item is not tenant-attributable until 7G.** One integer, no
   tenant-attributable content, so no assertion in this wave depends on it.
5. **D-28 narrows but does not close.** The `onboarding` refusal is retired (12 → 11 → 10 surfaces), but
   the fail-closed shape remains for the other ten ledger surfaces plus the payout and customer
   quarantines. Owner: 7E (deletion criterion) / 7G (webhooks).
6. **Persistence is still the missing second enforcer.** All three identity stores are in-memory maps; a
   real `organizationId` column plus RLS (Wave 7H, D-26/D-27) is what makes these predicates enforced
   twice rather than once.

## 7. Deviations from the drafted plan (recorded per instruction)

1. **Three quarantine modules instead of two** — the spec's default was "wire all four modules directly",
   with `kyc-unscoped.ts` conditional. `team-unscoped.ts` and `settings-unscoped.ts` were also needed, for
   the same reason: their only un-scopable consumer is `audit.ts`, a 7E derived surface. Wiring audit
   in-wave would have meant scoping the ledger, payout and webhook reads it also makes — 7E's whole
   retrofit inside 7F.
2. **The authorization finding was not in the spec.** §3 lists scoping gaps (P-1..P-10); the absence of any
   permission check on 16 actions was measured at Q2 and fixed in-wave, because a ctx-first DAL behind an
   unauthenticated action is still an unauthenticated write. Permissions were taken from `roles.ts`
   (`team.manage`, `settings.manage`, `kyc.submit`), never invented.
3. **Bulk action messages changed shape.** `"Role updated."` → `"Role updated for 1 member; 1 not in your
   team."` (and the deactivate equivalent). A per-row scoped batch has three possible outcomes, and the old
   strings could only express two — the honest count is the point. No legacy test asserted the old strings.
4. **The settings hub merchant card leads with the legal name.** `merchant.updatedAt ? "Saved just now" :
   legalName` → `legalName (+ " · Saved just now")`, `Incomplete` when blank. An aggregate that says only
   "Saved just now" hides *whose* profile the card summarises, and the MCP overview test rightly expects
   the tenant's own name. No test asserted the old string.
5. **`freshState()` rather than a shared default.** The spec did not specify what a non-demo tenant's
   settings start as; inheriting the prototype persona would have been a leak, so the wave introduced an
   explicit blank state and kept the notification *catalog* shared (vocabulary, not data).
6. **Id minting changed** (§2.10). Not in the spec; found by the new tests and fixed in-wave because a
   duplicate id inside one partition breaks `find`-based reads regardless of tenancy.
7. **Q5's probe flip landed during Q3** rather than after it, because the two Q1 GAP rows could not
   typecheck against ctx-first DALs. The Q1 RED baseline was already captured before any production code
   changed, so the flip destroyed no evidence.
8. **Baseline numbers are the measured ones.** The spec's §0 baseline (1472 passed / 17 failed) predates
   7D and counts `DATABASE_URL` failures that this sandbox reproduces differently; every number in §5 is
   measured at `f7cb1e2` and after, in this environment.
