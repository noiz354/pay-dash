# ADR-0046: Identity & access tenant isolation on the Wave 7A contract

Date: 2026-09-13
Status: **Accepted** (Wave 7F, Identity & Access slice — team, settings, KYC, onboarding)

## Context

ADR-0041 proved the canonical tenant-scoping contract on one vertical slice (Transactions); ADR-0042
reused it on payouts+refunds, ADR-0043 on the derived customer directory, ADR-0044 on billing
(subscriptions + invoices). Wave 7F applies it to **identity & access** — the slice where the
confidentiality classes stop being uniform. A roster discloses *who works for a merchant and which of
them holds Admin*; an API-key list discloses *secrets metadata*; a KYC submission is *PII about a legal
entity*; a merchant profile is *somebody's legal name and tax id*. The pre-existing gaps
(`WAVE_7F_IDENTITY_SPEC.md` §3):

- **P-1/P-2** `server/data/team.ts` — `listMembers(filters)`, `getMember(id)`, `inviteMember(input)`,
  `changeMemberRole(id, role)`, `deactivateMember`, `reactivateMember`, `resendInvite`, `revokeInvite`,
  `roleCatalog` unscoped over one process-wide `{ members }` roster. A cross-tenant `changeMemberRole`
  is **privilege escalation**, not a display bug.
- **P-3/P-4** `server/data/settings.ts` — 15 functions over one process-wide
  `{ merchant, notifications, keys, developer }` record: any caller's profile edit rewrote *every*
  merchant's legal identity, and `listApiKeys()` handed out every tenant's key ring.
- **P-5** `server/data/kyc.ts` — 4 functions over one `{ submission }` slot, so one merchant's
  compliance document became every merchant's.
- **P-6** `server/data/onboarding.ts` — `getOnboardingStatus()` derives four checklist sections from
  five stores, which made it a cross-slice leak *amplifier*; it also read the ledger through the 7A
  quarantine, so a two-tenant process served **nobody** (the D-28 fail-closed shape).
- **P-7** the team CSV export discarded `guardExport()`'s org id and answered `Cache-Control: no-store`
  without `private` or `Vary: Cookie`. **P-8** five MCP tools unscoped. **P-9** 7 pages, 3 action
  modules and the dashboard header unwired. **P-10** membership is the tenant edge: no cross-org invite.

One finding was not in the spec and was measured at Q2: **all six team actions, all nine settings
actions and `removeKycDocumentAction` had no authorization at all**, and `submitKycDocumentAction`
resolved an org context for the provider call and then *dropped* it, storing unscoped — the same defect
7D found in `createSubscriptionAction`.

## Decision

1. **Reuse `domain/tenancy/organization-context.ts` unchanged** and partition the three identity
   stores: `Map<org, { members }>`, `Map<org, { merchant, notifications, keys, developer }>` and
   `Map<org, KycSubmission>`. All 29 repository functions become ctx-first (team 9, settings 15, KYC 4,
   onboarding 1); `membersToCsv` stays pure and gains no tenant column.
2. **Two kinds of default, and the difference is the point.** The prototype persona (Acme Corporation
   LLC, its tax id, its three API keys, its two allowlisted IPs, its six-member roster) is *one
   tenant's data*, seeded into `DEFAULT_DEMO_ORG` only. Every other tenant starts from `freshState()`:
   a **blank** legal identity, the product's notification *catalog* (vocabulary, not data), no keys, no
   IP rules, `autoDebit: false`. Inheriting the demo persona would have handed every new merchant
   somebody else's legal name, tax id and live secrets — a leak dressed up as a default. KYC stays
   **unseeded** (ADR-0019), which makes "nothing submitted" and "submitted by somebody else" the same
   answer for free.
3. **Pin the two order edges** (spec F-13, 7B M8 / 7D B-13 precedent): `changeMemberRole` resolves the
   tenant → finds the row *inside* it → refuses a foreign id → only then examines or writes the role;
   `updateMerchantProfile` resolves the tenant → writes into its own partition, and the patch carries no
   tenant field, so there is no way to *address* another merchant's identity. FS-2 asserts both orders in
   source, not only in behaviour.
4. **Authorize the actions, validation first.** Each action validates its payload, then resolves the
   tenant *and* the permission through the new seam (`team.manage`, `settings.manage`, `kyc.submit`),
   then writes. Permissions are picked from `roles.ts`, never invented. Validation stays first so a
   malformed email is a field error rather than an auth error — answering it as an auth error would leak
   which of the two a caller hit. Bulk actions scope **per row** and report the honest count
   (`"Role updated for 1 member; 1 not in your team."`), so a multi-select containing a foreign id
   neither silently succeeds nor aborts the rows the actor owns.
5. **Attribute exactly, because here we can.** Unlike 7D's ledger-derived invoices, these stores are
   their module's own, so a foreign id is attributed to its real owner: reads answer `null`
   (indistinguishable from an unknown id, C-5) while writes record a denial naming both org ids and
   throw `TenantIsolationError("CROSS_TENANT_WRITE")`. Denial records carry ids only — never a name,
   email, role, key mask or filename.
6. **Three quarantine modules, each earned by a named caller.** `team-unscoped.ts` and
   `settings-unscoped.ts` (allowlist `["audit"]`) and — the spec's *conditional* module —
   `kyc-unscoped.ts` (allowlist `["handoff"]`), forced by `server/data/handoff.ts` deriving its
   `kyc_review` lane. Audit and handoff are Wave 7E derived surfaces over four unscoped owners;
   scoping either in-wave would drag 7E's whole retrofit into this slice, which the no-mega-diff rule
   forbids. All three are read-only by construction (FS-4 fails CI on an exported writer) and fail
   closed the moment more than one tenant holds rows. The KYC one additionally answers `null` when
   *zero* tenants have submitted, because for a deliberately unseeded store that is the normal state,
   not an ambiguity.
7. **One seam for the slice**: `server/services/identity-organization-context.ts`
   (`resolveIdentityOrganizationContext` for reads, `requireIdentityOrganizationContext(permission)` for
   writes, `refuseMultiTenantDemo` gated on `countIdentityTenants()`, which folds the team ∪ settings ∪
   KYC probes). It gates on *these* stores because a tenant's first fact may be an invited teammate, a
   saved legal name or a KYC document — with no transactions, payouts or customers at all. No change to
   `mcp/auth.ts`.
8. **Bind the edges**: the CSV export makes `guardExport().organizationId` the query predicate
   (unresolved org ⇒ 401 with no body; `private, no-store` + `Vary: Cookie`; client `?organizationId=`
   normalized and flagged); the five MCP tools reuse the existing `registerDomainTools` organization
   param and refuse with the shared `NO_TENANT` payload; onboarding derives every section from the
   caller's partition and reads the ledger through the scoped `getLedgerRows(ctx)`, which **retires the
   D-28 refusal for this surface** and shrinks `LEGACY_LEDGER_SURFACES` 12 → 11 (the entry 7E's ES-6
   deletion gate needs cleared) plus S-2's `ALLOWED_UNSCOPED_CONSUMERS`.
9. **Mint ids uniquely per mint, not per millisecond.** Measured, not theoretical: `Date.now().toString(36)`
   alone collided for two mints in the same tick, and inside one partition that means two rows answering
   the same `find` — a rolled API key left the *new* key answering for the old id, so the revoked key
   looked active. Keys, IP rules and invites now carry a monotonic sequence plus entropy.

## Consequences

- Good: the fifth slice proves the contract generalises to **heterogeneous confidentiality classes** —
  staff disclosure, secret metadata, legal identity and PII in one wave — and to a *derived* surface
  (onboarding) that reads five owners. The privilege-escalation edge (`changeMemberRole`) and the secret
  surface (`listApiKeys`) are closed; 16 previously unauthenticated actions now resolve a tenant and a
  permission; onboarding serves a multi-tenant process instead of refusing everybody; one ledger
  allowlist shrank and one ratchet list shrank with it.
- Good: attribution is exact in this slice, so every cross-tenant write is audited with the real owner
  — the narrow-audit caveat 7D had to record does not apply here.
- Bad: `getOnboardingStatus` still reads the webhook callback count from the unscoped `listWebhooks`
  (Wave 7G's slice). Because that store seeds itself from the 7A ledger quarantine, the read *refuses*
  in a multi-tenant ledger process; onboarding degrades to zero callback events rather than taking the
  whole checklist down with an unrelated slice's gate. Matched by error name, not by import, so this
  file does not become a quarantine consumer. Recorded as 7G debt at the call site.
- Bad: `audit.ts` and `handoff.ts` now ride three quarantines that fail closed above one tenant, so the
  audit log and the handoff queue are single-tenant-demo-only until Wave 7E. That is the honest interim
  state (loud, not leaky), and it is why the three modules exist.
- Cost: a non-demo tenant's settings hub now reads "Incomplete" and its merchant form opens blank. That
  is the intended behaviour change — the alternative was rendering Acme's tax id to everybody.
- Cost: 7 pages, 1 route, 3 action modules, 1 component and 5 MCP tools now resolve a context.

## Alternatives

- Seed the demo persona for every tenant (so a new merchant "has" a profile): rejected — it is a
  disclosure of one tenant's legal identity and live API keys to every other tenant.
- Filter after reading (keep one roster/key ring, filter by org at the end): rejected — the aggregate is
  the leak (`roleCatalog`, `getSettingsOverview`), and a filter that can be widened by a query param is
  not a boundary.
- Answer a foreign write with `null`/`false` like a foreign read: rejected for the *destructive* and
  *escalating* mutations — `false` would mean "somebody else's key/invite/member is safe", and the
  probing signal would disappear. Reads stay uniform (C-5); writes are attributed and loud (C-4).
- Wire `audit.ts` and `handoff.ts` in-wave and create no quarantine: rejected — they read four unscoped
  owners each (ledger, payouts, webhooks, identity); scoping them is Wave 7E's derived-surface retrofit.
- Skip `kyc-unscoped.ts` and let `handoff.ts` read KYC unscoped: rejected — that is precisely the leak
  this wave exists to remove; the module is conditional in the spec and was earned, so its creation is
  recorded in `WAVE_ROADMAP_7D_TO_11.md` §4 with the caller that forced it.
- `getOnboardingStatus(ctx?)` optional during migration: rejected — optional context is no context.
- Default to `DEFAULT_DEMO_ORG` for unscoped callers: rejected — makes the demo tenant a global
  namespace, and the seam now refuses that fallback once two tenants hold identity rows.

## Verification

- `team.tenant-isolation.test.ts` 20 (F-1..F-5, F-13a order pin incl. a forced id collision, F-12b/c),
  `settings.tenant-isolation.test.ts` 18 (F-6..F-8b, F-13b, F-12d), `kyc.tenant-isolation.test.ts` 11
  (F-9..F-9c), `onboarding.tenant-isolation.test.ts` 7 (F-10), `identity-structural.test.ts` 31
  (FS-1..FS-5), `exports/team/route.tenant.test.ts` 6 (F-11), `identity-tools.tenant.test.ts` 7 (F-12),
  `actions/identity.tenant.test.ts` 19 — **119 new, all green**; `tenant-isolation.probe.test.ts` 13/13
  with both Wave 7F GAP rows flipped to CLOSED and `gaps.length === 0`.
- 8/8 Q6 mutations reddened then reverted (`scripts/wave-7f-q6-mutations.py`), residue grep 0: member
  predicate removal, global `getMember`, hardcoded export org, MCP bypass, quarantine import in a wired
  page, API-key metadata leak, role-before-tenant-check, KYC cross-tenant read.
- Full suite **1681 passed / 2 failed / 3 failed files** — the 2 failures are the pre-existing
  `balance.test.ts` clock-drift expectations and the other 2 files are the `@prisma/client`-blocked MCP
  suites (engine binaries cannot be fetched in this sandbox); identical to the 7D baseline shape.
  Typecheck clean; lint 0 errors / 40 pre-existing warnings. Evidence:
  `IDENTITY_TENANT_ISOLATION_MATRIX.md`, `WAVE_7F_IMPLEMENTATION_REPORT.md`.
