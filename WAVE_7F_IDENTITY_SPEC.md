# Wave 7F — Identity & Access Tenant Isolation (Spec)

Date: 2026-09-13 · Branch: `wave-7d-derived-scoping` (main@a4b595a, Waves 7A/7B/7C PASS, 7D/7E Proposed)
Predecessors: 7A Transactions, 7B Payouts+Refunds, 7C Customers (PASS) · 7D Billing (Proposed). Runs **before** 7E — this wave clears the `onboarding` entry in `LEGACY_LEDGER_SURFACES`, which 7E's ES-6 deletion needs (`WAVE_ROADMAP_7D_TO_11.md` §2.2–2.3)
Status: **Proposed** · Follows ADR-0041/0042/0043 · Reuses `domain/tenancy/organization-context.ts` unchanged

---

## 0. Runtime baseline (measured, not carried over)

| Gate | Result 2026-09-13 |
|---|---|
| Full suite | **1472 passed / 17 failed** (15 pre-existing env `DATABASE_URL` unset + 2 pre-existing calendar flakes) |
| Typecheck | clean · Lint 0 errors / 40 warnings (== D-17) |
| Probe matrix | 0 GAPs — Q1 *adds* identity GAP pins, Q5 closes them |

## 1. Invariant

> Organization A cannot list, invite, re-role, deactivate, or read the secrets,
> profile, and identity documents of Organization B — even knowing the member id
> exactly. Roles are per-tenant: a role grant in A never authorises anything in B,
> and API keys are tenant-bound secrets (listing another tenant's keys is a secret
> leak, not a display bug).

## 2. Contract reuse (C-1..C-7, unchanged)

`OrganizationContext` required-first, `parseOrganizationContext` only constructor, no defaults,
reads → null / writes → `TenantIsolationError` + denial audit, wire answers uniform not-found,
session-only resolution, fail-closed quarantine with surface-naming.

## 3. Gaps (file:line evidence, checkout `a4b595a`)

- **P-1** `server/data/team.ts:163,207` — `listMembers`/`getMember` unscoped (member
  roster + ids visible cross-tenant).
- **P-2** `team.ts:216,232,239,246` — `inviteMember`/`changeMemberRole`/
  `deactivateMember`/`reactivateMember` unscoped role mutations; cross-tenant role
  change is privilege escalation, tenant-before-role-check needs a pin (7B M8 precedent).
- **P-3** `server/data/settings.ts:220,226` — `getMerchantProfile`/`updateMerchantProfile`
  unscoped (profile overwrite cross-tenant).
- **P-4** `settings.ts:238,243,261,278` — notification settings + `listApiKeys`
  unscoped (API key enumeration is a secret leak; verify at Q2 whether values or only
  metadata are listed — values must never cross tenants even in the owning tenant's
  logs).
- **P-5** `server/data/kyc.ts:32,38,57,77` — `getKycSubmission`/`submitKycDocument`/
  `removeKycDocument`/`profileKycCompleteness` unscoped (identity documents are PII —
  highest confidentiality class in this wave).
- **P-6** `server/data/onboarding.ts:101` — `getOnboardingStatus` unscoped.
- **P-7** `app/api/exports/team/route.ts` — guard org handling unverified (7A shape #3);
  needs `private, no-store` + `Vary: Cookie`.
- **P-8** MCP team/settings tools (verify names at Q2 — `domain-tools.ts` imports
  `listMembers`) unscoped.
- **P-9** Pages/actions: team, settings, KYC, onboarding callers — session wiring vs
  quarantine per caller (verify full table at Q2).
- **P-10** Design decision — membership itself is the tenant edge: `inviteMember` creates
  a row binding a user to the *caller's* org only; there is no cross-org invite. A second
  tenant reusing the same email gets a separate membership row (composite key, 7C P-10
  precedent).

## 4. Quarantine design (one per DAL, established pattern)

`server/data/team-unscoped.ts` + `server/data/settings-unscoped.ts` (+ `kyc-unscoped.ts`
ONLY if a KYC caller cannot be wired in-wave — default = wire all four modules directly):
`LEGACY_TEAM_SURFACES` / `LEGACY_SETTINGS_SURFACES` (seed at Q2, frozen, shrink-only) +
surface-naming errors when > 1 tenant has rows. No CSV vocab changes (no org columns —
structural pins).

New seam: `server/services/identity-organization-context.ts` (resolve/require +
refuseMultiTenantDemo, shared slice seam). No change to `mcp/auth.ts`.

Deletion ownership (roadmap finding G-1): slice quarantines, outside Wave 7E's ES-6 (which
pins the three legacy paths by name). 7E P-10's criterion applies verbatim; deletion happens
at the Q7 of whichever wave empties the allowlist, and any survivor is recorded with its
remaining surfaces + owner in `WAVE_ROADMAP_7D_TO_11.md` §4. Shrink-only, never re-grow.
The conditional `kyc-unscoped.ts` is a *last resort*: if it is created at all, its creation
is itself recorded in the roadmap ledger with the caller that forced it.

## 5. Tests

- **F-1..F-12** isolation: member list/detail, invite lands in caller org + invisible to B,
  role change/deactivate/reactivate own-vs-foreign, profile read/update, notification
  settings, API key listing scope, KYC submit/read/remove/completeness, onboarding status,
  team export, MCP, quarantine-dynamic-import, invalid-ctx.
- **F-13** order pins: tenant-before-role-check in `changeMemberRole` AND tenant-before-write
  in `updateMerchantProfile` (same-actor cross-tenant throws `cross-tenant`, target untouched).
- **FS-1..FS-5** structural per DAL: ctx-first (team 6 fns; settings 5+ fns; kyc 4 fns;
  onboarding 1 fn), no-default, purity (no pure-impure drift), quarantine allowlists +
  prod-path guards + slot privacy + CSV vocabs.
- Probe: identity GAP tests added in Q1, flipped to PASS in Q5.

## 6. Plan Q0..Q7 (serial, same gates)

Q0 spec (this doc) → Q1 5 failing test files (40-ish tests, red for missing ctx + identity
GAPs) → Q2 scoped DALs + partitioned stores + seam + session wiring vs quarantine → Q3
(folded: legacy tests to demo ctx) → Q4 export route + MCP + action tests → Q5 probe
final + full gates → Q6 8 mutations (member predicate removal, global getMember,
hardcoded export org, MCP bypass, quarantine import in prod path, API key metadata leak,
role-before-tenant-check, KYC-doc cross-tenant read) → Q7 report + matrix + ADR-0046 + commit
one slice.
