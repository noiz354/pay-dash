# Identity & Access Tenant Isolation Matrix — Wave 7F

Measured 2026-09-13 on `arena/01a09b03-pay-dash`, Wave 7F slice (Q1–Q7). Every cell below is a **test that
runs**, not a claim: the `Evidence` column names the file, and `pnpm --filter web test` executes all of them.

Invariant under test (same contract as Wave 7A/7B/7C/7D, ADR-0041/0042/0043/0044, unchanged):

> Organization A cannot list, invite, re-role, deactivate, or read the secrets, profile and identity
> documents of Organization B — even knowing the member id exactly. **Roles are per tenant**: a role grant
> in A never authorises anything in B, and **API keys are tenant-bound secrets**, so listing another
> tenant's keys is a secret leak rather than a display bug. KYC documents are the highest-confidentiality
> rows in the slice: PII about a legal entity.

What makes this slice different from the four before it: the confidentiality classes are **heterogeneous**
(staff disclosure, secret metadata, legal identity, PII), and one surface (`onboarding`) owns no facts at
all — it derives a checklist from five stores, which turns any unscoped owner into an amplifier.

---

## The matrix — team (`server/data/team.ts`)

| Surface | Org A → A | Org A → B | Evidence |
|---|---|---|---|
| **List** (`listMembers`) | **PASS** — own roster only; `total`/`pageCount` exclude B | **BLOCKED** — the partition *is* the predicate, so B's members never enter the filter | `team.tenant-isolation.test.ts` F-1 |
| **Search / role / status / page** (`q`, `role`, `statuses`, `page`) | **PASS** — needles and filters match A's members | **BLOCKED** — a needle matching only B returns `rows: []`, `total: 0`; no filter widens | F-1 |
| **Seeded roster ownership** | **PASS** — the six prototype members are the *demo* tenant's | **BLOCKED** — `daniel@acmecorp.com` is not in A's page, CSV or role counts | F-1, F-12b |
| **Detail by id** (`getMember`) | **PASS** — own id resolves | **BLOCKED** — `null`, byte-identical to an unknown id (no enumeration oracle) | F-2 |
| **Invite** (`inviteMember`, spec P-10) | **PASS** — owner comes from the ctx, never the input | **BLOCKED** — no cross-org invite exists; the new row is invisible to B | F-3 |
| **Composite key** (`memberIdFromEmail` is a pure global hash) | **PASS** — the same email in two tenants is two memberships | **BLOCKED** — identical id *prefix*, different `organizationId`; a **forced exact id collision** still resolves each tenant's own row and role | F-3 (+ collision pin) |
| **Re-role** (`changeMemberRole`) — the escalation edge | **PASS** — own member's role changes | **BLOCKED** — audited `TenantIsolationError`; target keeps its role; nothing written in *any* partition | F-4 |
| **Order pin** (spec F-13a; 7B M8 / 7D B-13 precedent) | **PASS** — tenant → row → role, asserted in source (FS-2) and behaviour | **BLOCKED** — a *valid* role on a foreign id still answers with the isolation error, not a role-validation error | F-13a + FS-2 |
| **Lifecycle** (`deactivateMember`, `reactivateMember`, `resendInvite`) | **PASS** — own members transition | **BLOCKED** — each refuses a foreign id and leaves the target exactly as it was | F-5 |
| **Destructive write** (`revokeInvite`) | **PASS** — own invite revoked, honest boolean | **BLOCKED** — foreign invite refused (audited), not answered `false` | F-5 |
| **Role catalog aggregate** (`roleCatalog`) | **PASS** — counts A's active members per role | **BLOCKED** — A's invite does not move the demo tenant's counts | F-12b |
| **Probes** (`countTeamTenants`, `soleTeamOrganizationId`) | **PASS** — answer tenancy metadata, never a member | **BLOCKED** — reachable only from fail-closed infrastructure (FS-4 pins the consumer set) | F-12b + FS-4 |
| **No context, no tenant** | **PASS** — a valid ctx serves | **BLOCKED** — missing ctx rejects on the list read *and* the escalation edge; `{organizationId:"   "}` throws | F-12c + FS-1 |
| **CSV export** (`GET /api/exports/team`) | **PASS** — A's roster, frozen 8-column header | **BLOCKED** — no B row, no demo row; `?organizationId=<B>` flagged, session wins; unresolved org ⇒ 401 no body; `private, no-store` + `Vary: Cookie`; no `organization` column | `exports/team/route.tenant.test.ts` (6) |
| **MCP `list_team_members`** | **PASS** — bound to the request's tenant | **BLOCKED** — no tenant ⇒ refusal text pinned to `"not bound to an organization"` with **zero payload**; malformed tenant ⇒ same | `identity-tools.tenant.test.ts` (7) |
| **Actions** (invite, bulk re-role, bulk deactivate, reactivate, resend, revoke) | **PASS** — `requireIdentityOrganizationContext("team.manage")`; own rows mutate | **BLOCKED** — no session / no permission ⇒ fail closed *before* any store write; bulk actions scope per row and report the honest count; a foreign id answers with the *same string* as an unknown one | `actions/identity.tenant.test.ts` (19) |

## The matrix — settings (`server/data/settings.ts`)

| Surface | Org A → A | Org A → B | Evidence |
|---|---|---|---|
| **Merchant profile read** (`getMerchantProfile`) | **PASS** — the demo persona belongs to the demo tenant | **BLOCKED** — a non-demo tenant reads its own **blank** profile, never Acme's legal name / tax id | `settings.tenant-isolation.test.ts` F-6 |
| **Merchant profile write** (`updateMerchantProfile`, spec F-13b) | **PASS** — the caller's own record changes | **BLOCKED** — the patch carries no tenant field, so B's profile is not *addressable*; B stays byte-identical | F-6 + F-13b |
| **Returned rows are copies** | **PASS** — mutating the answer does not reach the store | **BLOCKED** — no write-through handle on a neighbour's record | F-6 |
| **Notification channels** (`setNotificationChannel`) | **PASS** — A's toggle changes A | **BLOCKED** — B and the demo tenant keep their own delivery preferences | F-7 |
| **Notification topics** (`updateNotificationTopic`) | **PASS** — the catalog is shared *vocabulary*; the preference is per tenant | **BLOCKED** — a seeded topic id is a composite key: muting A's `successful_charges` leaves B's `daily`; the critical-topic guard still fires inside a tenant | F-7 |
| **Settings hub aggregate** (`getSettingsOverview`) | **PASS** — muted-topic / live-key / IP-rule counts are A's | **BLOCKED** — B's card reads "All topics active", "0 live keys active", and never names A | F-7 |
| **Key ring list** (`listApiKeys`) — the secret surface | **PASS** — own keys, sorted, environment filter narrows inside the tenant | **BLOCKED** — serialized answer contains no foreign key id, name, scope or mask; a plaintext secret never resurfaces anywhere | F-8 |
| **Key detail** (`getApiKey`) | **PASS** — own id resolves | **BLOCKED** — `null` for a foreign id, identical to an unknown one | F-8 |
| **Key mint** (`createApiKey`) | **PASS** — bound to the caller's partition; secret revealed **once** | **BLOCKED** — the input carries no tenant; the new key is invisible to every other tenant | F-8 |
| **Key lifecycle** (`revokeApiKey`, `rollApiKey`) | **PASS** — own key revokes / rolls, replacement carries `rolledFrom` | **BLOCKED** — foreign id ⇒ audited `TenantIsolationError`; the victim's key stays `ACTIVE` and **no replacement is minted in the attacker's partition** | F-8 |
| **Developer toggle** (`setDeveloperToggle`) | **PASS** — A's sandbox mode is A's | **BLOCKED** — B's stays `true` | F-8b |
| **IP allowlist** (`addIpAllowEntry`, `removeIpAllowEntry`) | **PASS** — same IP may be allowlisted in two tenants (uniqueness is per tenant); duplicates inside one tenant still refused | **BLOCKED** — removing a foreign rule is refused and removes nothing | F-8b |
| **Probes** (`countSettingsTenants`, `soleSettingsOrganizationId`) | **PASS** — count partitions, never values; demo is tenant #1 (eager seed), reads do not materialise | **BLOCKED** — two tenants ⇒ `null`, the condition the quarantine gate refuses to guess about | F-12d |
| **No context, no tenant** | **PASS** — a valid ctx serves | **BLOCKED** — missing ctx rejects on the profile read, the secret surface and the identity write | F-12d + FS-1 |
| **MCP `get_merchant_profile` / `get_settings_overview`** | **PASS** — the bound tenant's profile and its own aggregates ("1 live key active") | **BLOCKED** — no foreign legal name, tax id or key name; no tenant ⇒ refusal text, zero payload | `identity-tools.tenant.test.ts` (7) |
| **Actions** (profile, notifications, keys, IP allowlist, developer toggle) | **PASS** — `requireIdentityOrganizationContext("settings.manage")`; validation runs first | **BLOCKED** — no session ⇒ fail closed with the profile byte-identical; a foreign key/entry answers with the *same string* as an unknown one | `actions/identity.tenant.test.ts` (19) |

## The matrix — KYC (`server/data/kyc.ts`)

| Surface | Org A → A | Org A → B | Evidence |
|---|---|---|---|
| **Unseeded by design** (ADR-0019) | **PASS** — nothing is submitted anywhere until a tenant submits | **BLOCKED** — no fabricated document for any tenant, including demo | `kyc.tenant-isolation.test.ts` F-9 |
| **Read** (`getKycSubmission`) | **PASS** — own document, as a copy | **BLOCKED** — `null`, byte-identical to "nothing submitted": the anti-enumeration contract for free | F-9 |
| **Two tenants at once** | **PASS** — A's and B's documents coexist (different files, jurisdictions) | **BLOCKED** — neither resolves in the other | F-9 |
| **Resubmit** (`submitKycDocument`) | **PASS** — replaces the caller's own document | **BLOCKED** — B's document is untouched by A's resubmission | F-9 |
| **Clear** (`removeKycDocument`) | **PASS** — own slot cleared, honest boolean | **BLOCKED** — a foreign clear is not *expressible*: the slot is addressed by the context, not by an id | F-9 |
| **Completeness derivation** (`profileKycCompleteness`) | **PASS** — the demo profile is complete; a tenant's own saved profile drives its own checklist | **BLOCKED** — an empty tenant reports its own gaps and never displays a neighbour's tax id | F-9b |
| **Probes** (`countKycTenants`, `soleKycOrganizationId`) | **PASS** — start at 0 / `null`; count submitting tenants only | **BLOCKED** — answer metadata, never a filename | F-9c |
| **No context, no tenant** | **PASS** — a valid ctx serves | **BLOCKED** — missing ctx throws on the read, the write and the clear | F-9c |
| **MCP `get_kyc_submission`** | **PASS** — the bound tenant's document | **BLOCKED** — A's call never names B's file, and vice versa; no tenant ⇒ refusal, zero payload | `identity-tools.tenant.test.ts` (7) |
| **Actions** (`submitKycDocumentAction`, `removeKycDocumentAction`) | **PASS** — the resolved tenant now **reaches the DAL** (it was resolved and dropped before); removal is authorized | **BLOCKED** — no session ⇒ fail closed, nothing stored, B's record intact; validation still runs before authorization | `actions/identity.tenant.test.ts` (19) |

## The matrix — onboarding (`server/data/onboarding.ts`, derived)

| Surface | Org A → A | Org A → B | Evidence |
|---|---|---|---|
| **Header + profile section** | **PASS** — A's legal name, address and tax id | **BLOCKED** — B's name appears nowhere in A's serialized sections | `onboarding.tenant-isolation.test.ts` F-10 |
| **Compliance row** | **PASS** — names A's document | **BLOCKED** — B reads "Not yet submitted"; A's filename never appears in B's answer | F-10 |
| **Technical section** (keys + settled ledger) | **PASS** — A's key count and A's own succeeded transactions | **BLOCKED** — B reads "No keys generated yet" / "No successful transactions yet"; no foreign key name | F-10 |
| **Bank section** (payout accounts) | **PASS** — the demo tenant keeps its seeded destination; a fresh tenant has none | **BLOCKED** — neither sees the other's account | F-10 |
| **Progress arithmetic** | **PASS** — three tracked sections; compliance shown but never counted (ADR-0019) | **BLOCKED** — progress is computed from the caller's own sections only | F-10 |
| **Availability in a multi-tenant process** (retires D-28 for this surface) | **PASS** — A, B *and* demo are all served | **PASS** — the scoped `getLedgerRows(ctx)` replaced `legacyLedgerRows("onboarding")`, which threw as soon as a second tenant had rows | F-10 |
| **MCP `get_onboarding_status`** | **PASS** — derived from the bound tenant | **BLOCKED** — no foreign profile or document; no tenant ⇒ refusal, zero payload | `identity-tools.tenant.test.ts` (7) |
| **No context, no tenant** | **PASS** — a valid ctx serves | **BLOCKED** — missing ctx rejects | F-10 |

## Negative-path detail (what "BLOCKED" means per surface)

| Attack | Result | Why it is safe rather than merely denied |
|---|---|---|
| Re-role another tenant's Admin by id | Audited `TenantIsolationError`, target unchanged | Privilege escalation is a *write*, so it is attributed and loud (C-4) — not a quiet `null` |
| Bulk action with a foreign id mixed in | That row is skipped, the honest count is reported, the denial is audited | No silent success and no aborted batch for rows the actor does own |
| Read another tenant's member / key / document | `null` — identical to an unknown id | Read paths never disclose existence, so there is no enumeration oracle (C-5) |
| Revoke or roll another tenant's API key | Audited refusal; victim stays `ACTIVE`; **no replacement minted anywhere** | Refusing before minting means the attacker cannot clone a secret they do not own |
| Remove another tenant's IP allowlist rule | Audited refusal, nothing removed | `false` is reserved for "you had nothing to remove" |
| Overwrite another merchant's legal name / tax id | Not expressible | The patch carries no tenant field; the context does |
| Read a new tenant's settings | Blank profile, empty key ring, empty allowlist | A default that inherits the demo persona would be a leak dressed as a default |
| Guess a member/key/IP id | Same answer as a real foreign id | Ids are unique per mint (sequence + entropy), and isolation does not depend on id secrecy — the composite key `(organizationId, id)` is the control |
| Force an exact id collision across partitions | Each tenant still resolves, and writes, its own row | Pinned by test, per the Wave 7D M7/M8 lesson |
| `?organizationId=org_beta` on the export | A's roster; the attempt is flagged via `normalizeRequestedOrganization` | Session scope always wins |
| Export with an unresolved org | 401 `Unauthorized`, `Cache-Control: no-store`, no body | `UNRESOLVED_ORGANIZATION_ID` sentinel refused before any store read |
| A shared cache holding one tenant's roster | Impossible | `private, no-store` + `Vary: Cookie` |
| MCP call with no bound tenant | `NO_TENANT` refusal text, zero identity payload | A shared MCP token authorizes the agent, not a tenant |
| Any of the 16 previously unauthenticated actions | Fail closed on no session or no permission, **before** any store access | Authorization is now part of the seam, and validation-first keeps field errors honest |
| A write that happens before the tenant check | CI red | FS-2 asserts the source order for both pinned edges; M7 reddens the behaviour |
| New exported identity function without ctx | CI red | FS-1 ctx-first scan; only the pure CSV formatter and the row-free probes are exempt |
| A wired page/action/route/MCP tool importing a quarantine | CI red | FS-4 prod-path scan over 15 identity paths + the consumer-set pin (`audit.ts`, `handoff.ts` only) |
| A quarantine growing a writer, or its allowlist re-growing | CI red | FS-4 forbids exported writers and freezes each allowlist to exactly its earned surfaces |

## Quarantine snapshot (Wave 7F, shrink-only)

Unlike Wave 7D (which needed none), this slice **earned three** modules — one per DAL, each with a named
forcing caller from another wave. Recorded in `WAVE_ROADMAP_7D_TO_11.md` §4 per the G-1 finding; deletion
belongs to the Q7 of whichever wave empties the allowlist (7E's P-10 criterion applies verbatim).

| Module | Allowlist | Forcing caller | Why it could not be wired in-wave |
|---|---|---|---|
| `server/data/team-unscoped.ts` | `LEGACY_TEAM_SURFACES = ["audit"]` | `server/data/audit.ts` | Audit is a Wave 7E derived surface over four unscoped owners (ledger, payouts, webhooks, identity) |
| `server/data/settings-unscoped.ts` | `LEGACY_SETTINGS_SURFACES = ["audit"]` | `server/data/audit.ts` | Same — the "API key created" events come from the key ring |
| `server/data/kyc-unscoped.ts` | `LEGACY_KYC_SURFACES = ["handoff"]` | `server/data/handoff.ts` | **The spec's conditional module, earned:** handoff derives its `kyc_review` lane from the submission slot; also a 7E derived surface |

All three: read-only by construction, `@deprecated`, surface-naming refusals, fail closed above one tenant
(the KYC one answers `null` at *zero* tenants, which for an unseeded store is the normal state).

Legacy allowlists moved in the same commit:

| Module | Before 7F | After 7F | Removed by 7F |
|---|---|---|---|
| `server/data/transactions-unscoped.ts` | `LEGACY_LEDGER_SURFACES` 11 | **10** | `onboarding` — the checklist now reads the scoped `getLedgerRows(ctx)`, retiring the D-28 refusal for that surface (the entry 7E's ES-6 gate needs cleared) |
| `transactions-structural.test.ts` S-2 | `ALLOWED_UNSCOPED_CONSUMERS` 10 | **9** | `server/data/onboarding.ts` |

## Evidence files

- `apps/web/src/server/data/team.tenant-isolation.test.ts` — 20 tests (F-1..F-5, F-13a, F-12b/c)
- `apps/web/src/server/data/settings.tenant-isolation.test.ts` — 18 tests (F-6..F-8b, F-13b, F-12d)
- `apps/web/src/server/data/kyc.tenant-isolation.test.ts` — 11 tests (F-9..F-9c)
- `apps/web/src/server/data/onboarding.tenant-isolation.test.ts` — 7 tests (F-10)
- `apps/web/src/server/data/identity-structural.test.ts` — 31 tests (FS-1..FS-5)
- `apps/web/src/app/api/exports/team/route.tenant.test.ts` — 6 tests (F-11)
- `apps/web/src/server/mcp/identity-tools.tenant.test.ts` — 7 tests (F-12)
- `apps/web/src/server/actions/identity.tenant.test.ts` — 19 tests (Q4.3)
- `apps/web/src/server/finance/tenant-isolation.probe.test.ts` — the two Wave 7F GAP rows now CLOSED (13/13)
- `scripts/wave-7f-q6-mutations.py` — the 8-mutation harness, 8/8 reddened then reverted

Total new in this slice: **119 tests**, all green. Alongside them: 2 probe rows flipped to CLOSED, the
39 legacy identity product-behaviour tests moved onto the demo context (team 7, settings 20, KYC 5,
onboarding 7) with 3 further call sites in `invoices.test.ts` and `audit.test.ts`, and the 19 `handoff.test.ts`
tests kept green through the new KYC quarantine.
