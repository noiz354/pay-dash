# Wave 7G — Ingest & Integrity Tenant Isolation (Spec)

Date: 2026-09-13 · Branch: `wave-7d-derived-scoping` (main@a4b595a, Waves 7A/7B/7C PASS, 7D/7E/7F Proposed)
Predecessors: 7A Transactions, 7B Payouts+Refunds, 7C Customers (PASS) · 7D Billing, 7F Identity (Proposed). Runs **before** 7E — this wave clears `links`, `webhooks` and `risk` in `LEGACY_LEDGER_SURFACES`, which 7E's ES-6 deletion needs. Last wave permitted to create an `*-unscoped.ts` module (`WAVE_ROADMAP_7D_TO_11.md` §2.2–2.3, §4)
Status: **Q0 verified — execution NOT started** (2026-09-13, re-measured at HEAD `9e26876`, i.e. after 7D `f7cb1e2` and 7F `9e26876` landed). Every `file:line` citation in §3 was re-verified against this checkout; three gaps are **materially different from the draft** (P-1, P-3, P-6) and one planned quarantine is **not needed** while one unplanned one is (§4.1). One open decision needs an owner before Q1 — see §4.2. · Follows ADR-0041/0042/0043/0044/0046 · Reuses `domain/tenancy/organization-context.ts` unchanged

---

## 0. Runtime baseline (measured, not carried over)

| Gate | Result 2026-09-13 |
|---|---|
| Full suite | **1472 passed / 17 failed** (15 pre-existing env `DATABASE_URL` unset + 2 pre-existing calendar flakes) |
| Typecheck | clean · Lint 0 errors / 40 warnings (== D-17) |
| Probe matrix | 0 GAPs — Q1 *adds* ingest GAP pins, Q5 closes them |

> **Superseded — re-measured at HEAD `9e26876` (the row above predates 7D and 7F and counts `DATABASE_URL`
> failures this sandbox reproduces differently):**
>
> | Gate | Measured 2026-09-13 at `9e26876` |
> |---|---|
> | Full suite | **1681 passed / 2 failed / 3 failed files** — the 2 are pre-existing `balance.test.ts` trend expectations that drift with the wall clock; the 3rd failed file and one other are `server/mcp/customer-tools.tenant.test.ts` + `server/mcp/server.integration.test.ts`, which cannot collect because `@prisma/client` needs `prisma generate` and the engine binaries are unreachable here (BLOCKED_BY_ENVIRONMENT, pre-existing) |
> | Typecheck | clean (`tsc --noEmit`) |
> | Lint | **0 errors / 40 warnings** (== D-17 baseline) |
> | Probe matrix | 13/13 green, `gaps.length === 0` — Q1 *adds* ingest GAP pins, Q5 closes them |
> | Test count | 1683 total (7A 136 · 7B 56 · 7C 29 · 7D 78 · 7F 119 new tests already landed) |
>
> **These are the numbers 7G's deltas are measured against.** Any 7G failure outside
> `balance.test.ts` + the two prisma-env files is a wave failure.

## 1. Invariant

> A webhook, link payment, or idempotency record belonging to Organization B is never
> readable, replayable, or attributable to Organization A. Ingress is attributed at the
> door: an event whose connection resolves to a tenant is stored under that tenant, never
> `"unresolved"` — and an unattributable event stays unattributable (it must not degrade
> into everyone's event).

## 2. Contract reuse (C-1..C-7, unchanged)

`OrganizationContext` required-first, `parseOrganizationContext` only constructor, no defaults,
reads → null / writes → `TenantIsolationError` + denial audit, wire answers uniform not-found,
session-only resolution, fail-closed quarantine with surface-naming.

## 3. Gaps (file:line evidence, checkout `a4b595a`)

- **P-1** `server/data/webhooks.ts:292,313` — `recordInbound`/`rejectInbound` write ingress
  as `"unresolved"` (no tenant attribution at the door; verify connection→org mapping
  availability at Q2 — if the mapping doesn't exist yet, attribution lands as scoped tech
  debt with a quarantine, not as silent global reads).
- **P-2** `webhooks.ts:205,237,254` — `listWebhooks`/`getWebhookEvent`/
  `getSystemWebhookSummary` unscoped reads over the unattributed store.
- **P-3** `server/data/idempotency.ts:92,119,137,170` — `storeIdempotencyResult`/
  `checkIdempotency`/`executeWithIdempotency`/`checkConflict` (ADR-0036 keys are
  `hash(orgId+…)` by contract — verify the orgId is *enforced* at these entry points
  rather than trusted from the caller; key generators `generateIdempotencyKey`/
  `generateSimpleIdempotencyKey` stay pure).
- **P-4** `server/data/links.ts:201,230,243,260,278` — `listLinks`/`getLink`/`createLink`/
  `expireLink`/`recordLinkPayment` unscoped (payment links are money-adjacent: expiring or
  paying a foreign link is a mutation on B's money path; `totalOf`/`deriveLinkStatus` stay pure).
- **P-5** `server/data/blocklist.ts:130,154,158` — `listBlocklist`/`getBlocklistEntry`/
  `blocklistSummary` unscoped (validators `isValidIp`/`maskCardNumber`/`isValidEmailDomain`
  stay pure); blocklist export route `app/api/exports/blocklist/route.ts` guard unverified.
- **P-6** `server/data/risk.ts:171` — `deriveAlerts` is already pure-over-rows (takes settings
  + rows); verify-only: pin that it never reads a store (structural purity test), no ctx needed.
- **P-7** `server/data/timeline.ts:91-182` — all builders pure (`timelineKey`,
  `dedupeTimeline`, `sortTimeline`, `buildTimeline`, `actionForLabel`, timeline-from-events);
  verify-only: structural purity pins, no ctx needed. (If any builder reads a store, it moves
  into the scoped set with ctx-first — verify at Q2.)
- **P-8** MCP webhook/link tools (verify names at Q2) unscoped.
- **P-9** Pages/actions: webhooks, links, blocklist, risk callers — session wiring vs
  quarantine per caller (verify full table at Q2).
- **P-10** Design decision — idempotency keys are already org-bound by construction
  (ADR-0036); 7G pins enforcement, it does not redesign the key. Webhook attribution uses
  the provider-connection mapping; events that cannot be attributed are quarantined
  (visible to no tenant), never defaulted to demo.

### 3.1 Q0 verification of §3 (re-measured at HEAD `9e26876`)

All cited line numbers are **still exact** — none of these six modules was touched by 7D or 7F. Three gaps
are materially different from the draft, and two are worse than described.

| Gap | Draft claim | Verified at `9e26876` |
|---|---|---|
| **P-1** | `webhooks.ts:292,313` write ingress as `"unresolved"` | **Different shape, and the draft points at the wrong file.** `recordInbound` (`:292`) and `rejectInbound` (`:313`) exist at those lines, but `WebhookEvent` (`:22-45`) has **no `organizationId` field at all** — the in-memory UI log is not "attributed as unresolved", it is *unattributable by construction*. The `"unresolved"` literal lives one layer up, in the **durable** store: `server/webhooks/store-delivery.ts:34` (`organizationId: input.organizationId ?? "unresolved"`), and it is reached because **neither ingress route passes an org or a connection**: `app/api/webhooks/xendit/route.ts:66-71` and `app/api/webhooks/stripe/route.ts:71-76` call `recordWebhookDelivery({ provider, eventId, type, payload })` only. So 7G has **two** attribution gaps, not one: the durable row says `"unresolved"`, and the UI-log row says nothing. |
| **P-1 (open question)** | "verify connection→org mapping availability at Q2" | **Answered at Q0: the mapping exists, but is keyed by `connectionId`, which ingress does not have.** `RuntimeConnection.organizationId` (`server/repositories/runtime-connection-resolver.ts:23-25`), `resolveForConnection(connectionId)` (`:104`), `InMemoryRuntimeConnectionDb.findFirstActive(organizationId)` (`:208-215`), Prisma `PaymentProviderConnection.organizationId` (`prisma/schema.prisma:133-135`). There is one shared `/api/webhooks/xendit` URL for all tenants, so neither (a) a per-tenant endpoint/secret nor (b) a payload-derived resource→org lookup exists today. Per the draft's own fallback this lands as **named scoped tech debt** (a quarantine surface + `"unresolved"` staying honest), never a silent global read and never a demo default. |
| **P-2** | `webhooks.ts:205,237,254` unscoped reads | **Confirmed** — `listWebhooks` (`:205`), `getWebhookEvent` (`:237`), `getSystemWebhookSummary` (`:254`) over the process-wide `__kineticWebhooksStore` (`:63-70`), which `seed()` populates from `legacyLedgerRows("webhooks")` (`:78`) — the reason `webhooks` sits in `LEGACY_LEDGER_SURFACES` and the reason 7F's onboarding webhook count had to degrade to `0` (D-29). |
| **P-3** | 4 idempotency entry points | **Five, and the draft missed the leaking one.** `storeIdempotencyResult` (`:92`), `checkIdempotency` (`:119`), `executeWithIdempotency` (`:137`), `checkConflict` (`:170`) — plus **`checkForConflict` (`:203`)**, which takes `orgId` as a **trusted parameter** and returns `existingRecord`: the *full* record including `result`, i.e. another organization's stored money-movement payload, for any `orgId` the caller passes. The store is one process-wide `Map<string, IdempotencyRecord>` (`:44`); `orgId` is stored but **never enforced** against a context, and `checkConflict`'s prefix scan (`:170-181`) is an existence oracle over other tenants' in-flight operations. Pure, keep as-is: `generateIdempotencyKey` (`:65`), `generateSimpleIdempotencyKey` (`:79`), `generateKeyPrefix` (`:183`), `hashPayload` (`:48`). **Mitigating fact for honest reporting: `idempotency.ts` has ZERO non-test production consumers** (verified by import scan) — so this leak is *latent*, not live. It is still an exported API surface and still gets pinned. |
| **P-4** | `links.ts:201,230,243,260,278` unscoped | **Confirmed, and worse than a read leak.** `listLinks` (`:201`), `getLink` (`:230`), `createLink` (`:243`), `expireLink` (`:260`) run over the process-wide `__kineticLinksStore` (`:168-173`); `paidReferenceIds()` (`:193-198`) reads `legacyLedgerRows("links")`. `recordLinkPayment` (`:278`) **is already ctx-first (Wave 7A)** — but it resolves the link from the *global* store at `:282` **before** using `ctx`, so tenant A can pay tenant B's link and the credit lands in **A's** ledger. That is a live money-path bug and the exact shape of the G-13 order pin. Pure, keep: `totalOf` (`:175`), `deriveLinkStatus` (`:186`). |
| **P-5** | `blocklist.ts:130,154,158` unscoped; export guard unverified | **Confirmed + two writers the draft missed.** Readers `listBlocklist` (`:130`), `getBlocklistEntry` (`:154`), `blocklistSummary` (`:158`) over `__kineticBlocklistStore` (`:99-102`); writers **`addBlocklist` (`:184`)** — whose duplicate check (`:203-206`, "Already on the blocklist.") is *global*, leaking another tenant's entry existence — and **`removeBlocklist(id)` (`:219`)**, which deletes by id alone ⇒ cross-tenant delete. `entryId(type, value)` (`:47`) is a pure djb2 hash, so the same `(type, value)` in two tenants mints the **same id**: isolation must be the composite key `(organizationId, id)`, exactly as 7C/7F. **Export guard verified: `app/api/exports/blocklist/route.ts` calls `guardExport(request, "audit.read")` but discards `guard.organizationId`, and sets `Cache-Control: no-store` with no `private` and no `Vary: Cookie`** — the same shape 7A and 7F fixed. Pure, keep: `isValidIp` (`:107`), `maskCardNumber` (`:117`), `isValidEmailDomain` (`:123`), `blocklistToCsv` (`:229`). |
| **P-6** | `risk.ts:171` `deriveAlerts` pure — **verify-only, no ctx needed** | **Wrong at HEAD; risk must join the scoped set.** `deriveAlerts` (`:171`) *is* pure-over-rows ✓ (keep the purity pin). But `getRiskOverview()` (`:203`) reads `legacyLedgerRows("risk")` (`:205`) and aggregates volume/distribution/alerts over the **whole** ledger; and the risk store is a process-wide singleton `__kineticRiskStore` (`:152-155`) holding `deployed` + `draft` + `deployedAt`, so `patchDraft` (`:245`), `deployRiskSettings` (`:261`) and `discardDraft` (`:270`) are **shared-policy writes**: tenant A deploying velocity limits silently changes B's effective limits, and A can discard B's pending draft. Risk therefore needs a partitioned store + 4 ctx-first functions (1 read, 3 mutations) — which is also what clears the `risk` entry this wave already promised to clear. |
| **P-7** | `timeline.ts:91-182` builders pure — verify-only | **Confirmed ✓** — all 7 exports are pure (`timelineKey` `:91`, `dedupeTimeline` `:100`, `sortTimeline` `:113`, `buildTimeline` `:123`, `actionForLabel` `:159`, `timelineFromTransactionEvents` `:164`, `timelineFromPayoutEvents` `:182`); the module imports no store and has exactly one consumer (`components/timeline/timeline.tsx`). Structural purity pins only, no ctx. |
| **P-8** | MCP webhook/link tools, names to verify | **Verified — 5 unscoped tools, by name**, all in `server/mcp/domain-tools.ts`: `list_links` (`:254`), `get_risk_overview` (`:273`), `list_webhooks` (`:278`), `get_webhook_event` (`:284`), `list_blocklist` (`:289`). None carries the `if (!scoped) return textResult(NO_TENANT)` guard that 7D and 7F added to theirs. No change to `mcp/auth.ts`. |
| **P-9** | Pages/actions caller table to verify at Q2 | **Verified at Q0 — full table in §3.2.** Headline: **11 of the 12 exported ingest actions have no authorization at all** (the 12th, `payPaymentLinkAction`, gained `requireTransactionOrganizationContext("money_in.create")` in 7A). Same finding class as 7F's 16. |
| **P-10** | Design decision (keys already org-bound; attribution via connection mapping) | **Half confirmed.** ADR-0036 keys *are* `hash(orgId+…)` by construction, so 7G pins enforcement rather than redesigning the key ✓. But "webhook attribution uses the provider-connection mapping" is **not available at ingress** (see P-1 above) — attribution lands as named debt, and unattributable events stay invisible to every tenant rather than defaulting to demo ✓. |

### 3.2 Verified caller table (P-9, at HEAD `9e26876`)

| DAL | Pages | Components (type-only) | Actions | Routes | MCP | **Derived `server/data/*` consumers (7E-owned)** |
|---|---|---|---|---|---|---|
| `webhooks.ts` | `webhooks/page.tsx`, `webhooks/[id]/page.tsx`, `system/page.tsx`, `ai-journal/ops-copilot/page.tsx`, `ai-journal/readiness-agent/page.tsx` | `components/webhooks/webhooks-table.tsx` | `server/actions/webhooks.ts` — 2 (`simulateWebhookAction`, `replayWebhookAction`), **no auth** | `api/webhooks/xendit/route.ts`, `api/webhooks/stripe/route.ts`, `server/webhooks/store-delivery.ts` | `list_webhooks`, `get_webhook_event` | **`audit.ts:13`, `command-center.ts:17`, `handoff.ts:9`, `onboarding.ts`** (4) |
| `links.ts` | `payments/links/page.tsx`, `payments/links/[id]/page.tsx` (already ctx-aware from 7A) | `components/links/links-table.tsx`, `links-kind-tabs.tsx` | `server/actions/links.ts` — 3 (`createPaymentLinkAction`, `expirePaymentLinkAction` **no auth**; `payPaymentLinkAction` has 7A auth) | — | `list_links` | **none** |
| `blocklist.ts` | `fraud/page.tsx`, `fraud/blocklist/page.tsx` | `components/blocklist/blocklist-panel.tsx`, `fraud-summary-cards.tsx` | `server/actions/blocklist.ts` — 2 (`addBlocklistAction`, `removeBlocklistAction`), **no auth** | `api/exports/blocklist/route.ts` (guard discards org) | `list_blocklist` | **`audit.ts:7`** (1) |
| `risk.ts` | `risk/page.tsx`, `ai-journal/ops-copilot/page.tsx`, `ai-journal/readiness-agent/page.tsx` | `components/risk/alerts-bento.tsx`, `risk-profile-panel.tsx`, `rules-table.tsx`, `volume-limits-card.tsx` | `server/actions/risk.ts` — 5 (`saveVolumeDraftAction`, `setVolumeEnabledAction`, `toggleRuleAction`, `deployRiskAction`, `discardDraftAction`), **no auth** | — | `get_risk_overview` | **`audit.ts:9`, `handoff.ts:7`** (2) |
| `timeline.ts` | — | `components/timeline/timeline.tsx` | — | — | — | none (pure) |
| `idempotency.ts` | — | — | — | — | — | **none — zero production consumers** |

Wiring total: **10 pages** (8 ingest + 2 ai-journal), **1 export route**, **2 ingress routes** +
`store-delivery.ts`, **5 MCP tools**, **12 actions across 4 modules**. Components are type-only imports
and stay presentational — no ctx.

## 4. Quarantine design (one per DAL that needs it, established pattern)

### 4.1 Q0 verification — which quarantine modules this slice actually needs

The draft planned `webhooks-unscoped.ts` + `links-unscoped.ts` (+ conditional `blocklist-unscoped.ts`).
Verified against the §3.2 caller table, **the plan is wrong in both directions**: one planned module is
unnecessary, one conditional module is earned, and one *unplanned* module is implied by the corrected P-6.

| Module | Draft | Verified need | Allowlist (frozen at Q2, shrink-only) | Why |
|---|---|---|---|---|
| `server/data/webhooks-unscoped.ts` | planned | **NEEDED** | `LEGACY_WEBHOOK_SURFACES = ["audit", "command-center", "handoff"]` (3) | Those three are 7E derived surfaces. **`onboarding.ts` is deliberately NOT in this list**: 7F degraded its webhook count to `0` because `listWebhooks()` was process-wide; 7G wires it to the scoped read instead, which closes that half of D-29 rather than quarantining it. |
| `server/data/links-unscoped.ts` | planned | **NOT NEEDED — do not create** | — | `links.ts` has **zero** derived `server/data/*` consumers: 2 pages, 3 actions, 2 type-only components, 1 MCP tool — all wireable in-wave. `ingest-structural.test.ts` GS-4 should *forbid* the file (the 7D R-4 shape) so it can never appear later. |
| `server/data/blocklist-unscoped.ts` | conditional | **EARNED** | `LEGACY_BLOCKLIST_SURFACES = ["audit"]` (1) | `audit.ts:7` reads `listBlocklist()` to render blocklist events; audit is 7E's. Creation must be recorded in `WAVE_ROADMAP_7D_TO_11.md` §4.2 with `audit.ts` as the forcing caller, per the last-resort rule. |
| `server/data/risk-unscoped.ts` | **not planned** | **IMPLIED by the corrected P-6 — needs a decision (§4.2)** | would be `LEGACY_RISK_SURFACES = ["audit", "handoff"]` (2) | `audit.ts:9` and `handoff.ts:7` both call `getRiskOverview()`. If risk joins the scoped set (it must — see P-6), those two consumers need somewhere to read from. |
| `server/data/idempotency-unscoped.ts` | not planned | **NOT NEEDED** | — | Zero production consumers; scoping it breaks nothing. |
| `server/data/timeline-unscoped.ts` | not planned | **NOT NEEDED** | — | Pure builders, no store (P-7 confirmed). |

Ratchet moves this slice earns (all monotone-decreasing):

| Ratchet | Now (`9e26876`) | After 7G | Entries removed |
|---|---|---|---|
| `LEGACY_LEDGER_SURFACES` | 10 | **7** | `links` (scoped `getLedgerRows(ctx)` in `paidReferenceIds`), `webhooks` (scoped seed), `risk` (scoped `getRiskOverview`) — exactly the three this spec's header promised |
| S-2 `ALLOWED_UNSCOPED_CONSUMERS` | 9 | **6** | `server/data/links.ts`, `server/data/risk.ts`, `server/data/webhooks.ts` |
| Unscoped `server/data/*` modules (D-09/D-28 count) | 11 | **6** | `webhooks`, `links`, `blocklist`, `risk`, `idempotency` scoped; `timeline` confirmed pure |

**That leaves Wave 7E precisely the five derived surfaces it was chartered for** — `audit.ts`,
`balance.ts`, `command-center.ts`, `handoff.ts`, `handoff-store.ts` — plus pure `timeline.ts`. No ingest
module survives into 7E's scope, which is the cleanest possible handoff.

### 4.2 OPEN DECISION (needs an owner before Q1) — the risk quarantine vs the roadmap's "may create" column

Corrected P-6 makes `risk.ts` a scoped module with two 7E-owned consumers. Three ways out, and they are
not equivalent:

| Option | What it does | Cost | Verdict |
|---|---|---|---|
| **(a) Create `risk-unscoped.ts` in 7G** with `LEGACY_RISK_SURFACES = ["audit", "handoff"]`, recorded in roadmap §4.2 | Risk is scoped now; the `risk` ledger entry clears as promised; audit/handoff keep reading through a fail-closed quarantine | A **4th** slice quarantine for 7E to delete, and one module *not listed* in the roadmap's §4.2 "planned by 7G" table — though 7G is still the **last** wave permitted to create one, so this is within its authority, just not pre-declared | **RECOMMENDED.** The gap being closed is a *write* gap (deploy/discard another tenant's risk policy), which is the loudest class in this programme, and deferring it means another wave runs with tenant A able to change tenant B's live velocity limits |
| (b) Scope risk **and** wire `audit.ts` + `handoff.ts` in-wave | No new quarantine | Pulls 7E's derived-surface retrofit into 7G — audit and handoff also read the ledger, payouts, webhooks and identity, so this is 7E's whole scope inside one slice | **REJECTED by precedent**: this is exactly why 7F created three quarantines instead of wiring audit (7F report §7.1) |
| (c) Defer risk to 7E entirely | 7G covers webhooks + links + blocklist + idempotency only | The spec's header promise ("clears `links`, `webhooks` **and `risk`") becomes 2/3; `LEGACY_LEDGER_SURFACES` only reaches 8; the shared-policy write gap survives another wave and needs its own debt row | Acceptable fallback if the quarantine count is the binding constraint, but it defers a cross-tenant **write** |

Whichever is chosen must be recorded in `WAVE_ROADMAP_7D_TO_11.md` §4.2 in the same commit (the update
protocol in §4.3 there: a survivor without a named owner means Q7 is not finished).


`server/data/webhooks-unscoped.ts` + `server/data/links-unscoped.ts` (+ `blocklist-unscoped.ts`
ONLY if a caller cannot be wired in-wave): `LEGACY_WEBHOOK_SURFACES` / `LEGACY_LINK_SURFACES`
(seed at Q2, frozen, shrink-only) + surface-naming errors when > 1 tenant has rows.
Ingress-attribution debt (if the connection mapping is missing) gets its own named surface,
not a silent pass. No CSV vocab changes (structural pins).

New seam: `server/services/ingest-organization-context.ts` (resolve/require +
refuseMultiTenantDemo, shared slice seam). No change to `mcp/auth.ts`.

Deletion ownership (roadmap finding G-1): slice quarantines, outside Wave 7E's ES-6 (which
pins the three legacy paths by name). 7E P-10's criterion applies verbatim; deletion happens
at the Q7 of whichever wave empties the allowlist, and any survivor is recorded with its
remaining surfaces + owner in `WAVE_ROADMAP_7D_TO_11.md` §4. Shrink-only, never re-grow.
7G is the **last** wave permitted to create an `*-unscoped.ts` module (conditional
`blocklist-unscoped.ts` included): after 7G's Q7 the roadmap ledger's "may create" column is
closed, so Waves 8–11 can only shrink what exists. Ingress-attribution debt that cannot be
resolved in-wave keeps a *named surface* in the ledger — never a silent global read.

## 5. Tests

### 5.1 Q0 test plan (concrete files, verified against what already exists)

10 new files, **≈137 tests** (the draft's "40-ish" was an undercount by the same factor 7F was: the
action and structural suites dominate once the caller table in §3.2 is known).

| # | File (new) | ≈ | Covers |
|---|---|---|---|
| 1 | `server/data/webhooks.tenant-isolation.test.ts` | 18 | G-1 list/detail/summary own-vs-foreign; **inbound attribution** (attributable ⇒ stored under the owner; unattributable ⇒ invisible to *every* tenant, never demo); provider-scoped dedupe is per tenant (same `eventId` in two tenants = two rows, since the durable key is global but the log is not); reject path; seed ownership (the 7 seeded events are the demo tenant's); probes; no-ctx; slot privacy |
| 2 | `server/data/links.tenant-isolation.test.ts` | 16 | list/detail/create/expire own-vs-foreign; **G-13b order pin** — a foreign link payment throws `cross-tenant` and writes nothing into *either* partition (the raw-store sweep, per the 7D M8 / 7F M7 lesson); `paidReferenceIds` scoped (a SUCCEEDED row in A must not flip B's link to PAID); composite key `(organizationId, id)` + **forced exact id collision**; probes; no-ctx |
| 3 | `server/data/blocklist.tenant-isolation.test.ts` | 14 | list/detail/summary; `addBlocklist` duplicate check is **per tenant** (the same `(type, value)` in two tenants = two entries, and A's add must not answer "Already on the blocklist." because of B's row); `removeBlocklist` foreign ⇒ audited refusal, **not** `false`; composite key over the pure djb2 `entryId`; probes; no-ctx |
| 4 | `server/data/risk.tenant-isolation.test.ts` | 12 | overview per tenant (own ledger only: 24h/30d volume, distribution, alerts, scanned); **draft lifecycle isolation** — A's `deployRiskSettings` does not change B's effective limits and A cannot discard B's draft; `deriveAlerts` purity; probes; no-ctx |
| 5 | `server/data/idempotency.tenant-isolation.test.ts` | 10 | same key in a different org ⇒ **miss, never hit**; `checkForConflict` never returns a foreign `existingRecord` (the P-3 leak); the prefix scan cannot see another org's in-flight operation; the stored `orgId` comes from the ctx, not the parameter; pure generators pinned (`generateIdempotencyKey`, `generateSimpleIdempotencyKey`, `generateKeyPrefix`, `hashPayload`) |
| 6 | `server/data/ingest-structural.test.ts` | 28 | **GS-1** ctx-first per DAL (webhooks 5, links 5, blocklist 5, risk 4, idempotency 5) + no-default + no other exported store reader + `server-only`; **GS-2** both order pins in source (`recordInbound` attribution, `recordLinkPayment` tenant-before-payment); **GS-3** purity (`deriveAlerts`, 7 timeline builders, 3 blocklist validators, 4 idempotency generators, `totalOf`/`deriveLinkStatus`, `blocklistToCsv`); **GS-4** quarantine existence / `@deprecated` / read-only / frozen allowlists / prod-path scan / consumer-set pin + **forbid `links-unscoped.ts`** (7D R-4 shape) + `LEGACY_LEDGER_SURFACES` 10 → 7 + S-2 9 → 6; **GS-5** CSV vocab (blocklist 4 columns, no org column) + slot privacy + the **ingress named-debt pin**: `"unresolved"` appears only at the documented site and never resolves to `DEFAULT_DEMO_ORG` |
| 7 | `app/api/exports/blocklist/route.tenant.test.ts` | 6 | `guardExport()`'s org *is* the predicate (today it is discarded); `?organizationId=` normalized and flagged; unresolved org ⇒ 401 no body; `private, no-store` + `Vary: Cookie` (today `no-store` only); frozen header, no org column; filters narrow inside the tenant |
| 8 | `app/api/webhooks/ingress.tenant.test.ts` | 6 | both routes (xendit + stripe): an unattributable event stays unattributable and is invisible to every tenant; **never defaults to demo**; provider-scoped dedupe key `<provider>:<eventId>`; the rejection path records without inventing a tenant |
| 9 | `server/mcp/ingest-tools.tenant.test.ts` | 7 | the 5 tools bound to the request tenant; no tenant ⇒ refusal text pinned to the exact `NO_TENANT` phrase **plus zero payload** (the 7D M4 lesson); malformed tenant ⇒ same; aggregates (`getSystemWebhookSummary`, `blocklistSummary`, `getRiskOverview`) never cross |
| 10 | `server/actions/ingest.tenant.test.ts` | 20 | all 12 actions: no session / no permission ⇒ fail closed **before any store write**; foreign id ⇒ the same string as an unknown one; validation-first so field errors stay honest; `simulateWebhookAction` / `replayWebhookAction` attribute to the caller's tenant; risk mutations require the caller's own draft |

**Probe:** Q1 adds ~5 ingest GAP rows (webhooks, links, blocklist, risk, idempotency). The matrix asserts
`gaps.length === 0`, so the probe is **expected red between Q1 and Q5** and green again at Q5 — acceptable
because the slice lands as one commit at Q7 (no intermediate commit is red).

**Legacy migration (Q3):** 49 existing product-behaviour tests move onto an explicit demo context —
`webhooks.test.ts` 18, `links.test.ts` 19, `blocklist.test.ts` 7, `risk.test.ts` 5. `timeline.test.ts` (22)
needs **no** migration (pure, P-7). The 4 existing ingress route tests (`xendit/route.test.ts`,
`xendit/route.auth.test.ts`, `stripe/route.test.ts`, `stripe/route.auth.test.ts`) must stay green
unchanged — attribution is added, signature verification is not touched. `idempotency.ts` has no legacy
test file, consistent with having zero production consumers.


- **G-1..G-12** isolation: webhook list/detail/summary own-vs-foreign, inbound attribution
  (attributable ⇒ owner's tenant; unattributable ⇒ invisible to all), idempotency
  cross-tenant replay refused (same key different org ⇒ miss, never hit), link
  list/detail/create/expire/payment own-vs-foreign, blocklist list/detail/summary, export,
  MCP, quarantine-dynamic-import, invalid-ctx.
- **G-13** order pins: tenant-before-attribution-write in `recordInbound` AND
  tenant-before-payment in `recordLinkPayment` (foreign link payment throws `cross-tenant`,
  ledger untouched).
- **GS-1..GS-5** structural per DAL: ctx-first (webhooks 5 fns; idempotency 4 fns;
  links 5 fns; blocklist 3 fns), no-default, purity (`risk`/`timeline`/validators/generators
  never touch a store), quarantine allowlists + prod-path guards + slot privacy + CSV vocabs.
- Probe: ingest GAP tests added in Q1, flipped to PASS in Q5.

## 6. Plan Q0..Q7 (serial, same gates)

### 6.1 Q0 outcome and the concrete Q1..Q7 plan

**Q0 is complete** (this annotation). Execution has **not** started; no production file was touched. One
decision is outstanding (§4.2 — the risk quarantine).

| Q | Work | Exit criterion |
|---|---|---|
| **Q1** | Write the 10 test files from §5.1 **red** (missing ctx params + the ~5 probe GAP rows). No production code yet | All 10 files fail for the *expected* reason (compile error on missing ctx / isolation assertion), probe reports the new GAPs; the RED baseline is recorded before Q2 starts |
| **Q2** | Partition the five stores (`Map<org, …>` for webhooks, links, blocklist, risk, idempotency); make 24 functions ctx-first (5+5+5+4+5); demo seeds into `DEFAULT_DEMO_ORG` only; a `freshState()`-equivalent blank for non-demo tenants (7F's lesson — do **not** inherit the prototype persona); `organizationId` on `WebhookEvent`/`PaymentLink`/`BlocklistEntry`/`IdempotencyRecord`; **G-13a/G-13b order pins**; new seam `server/services/ingest-organization-context.ts`; create `webhooks-unscoped.ts` (+ `blocklist-unscoped.ts`, + `risk-unscoped.ts` per §4.2) and **forbid** `links-unscoped.ts`; wire `onboarding.ts` to the scoped webhook read (closes D-29's degradation) | §5.1 files 1-6 green; `LEGACY_LEDGER_SURFACES` 10 → 7; S-2 9 → 6 |
| **Q3** (folded) | Migrate the 49 legacy tests onto an explicit demo context; keep `timeline.test.ts` and the 4 ingress route tests untouched | Legacy suites green with no assertion weakened |
| **Q4** | Wire the edges: 10 pages (incl. `ai-journal/ops-copilot`, which 7F did not touch), the blocklist export route (guard org as predicate + `private, no-store` + `Vary: Cookie`), both ingress routes + `store-delivery.ts` (attribution or honest named debt), 5 MCP tools via the existing `registerDomainTools` org param, 12 actions with `requireIngestOrganizationContext(permission)` — permissions taken from `roles.ts`, never invented | §5.1 files 7-10 green |
| **Q5** | Flip the probe GAP rows to CLOSED; run all three gates | Full suite back to **1681+ passed / 2 failed / 3 failed files** (the §0 baseline), typecheck clean, lint 0 errors / ≤40 warnings, probe `gaps.length === 0` |
| **Q6** | 10 deliberate mutations (below), each reddened then reverted, residue grep 0 | 10/10 RED, no survivors |
| **Q7** | `WAVE_7G_IMPLEMENTATION_REPORT.md` + `INGEST_TENANT_ISOLATION_MATRIX.md` + **ADR-0047** (+ README index row); roadmap §1/§4.1/§4.2/§5; `TENANT_ISOLATION_REPORT`, `PROGRESS`, `CHANGELOG`, debt register (D-09/D-28 counts, D-29 closed for onboarding, new rows for the ingress attribution debt + any survivor); spec → Implemented; **one commit** | Working tree clean, gates green, pushed |

**Q6 mutations (the draft's 8, plus 2 earned by Q0 verification):**

| # | Gate to break | Change | Must be caught by |
|---|---|---|---|
| M1 | Webhook predicate | `listWebhooks`: `readPartition(org).events` → all-partition `flatMap` | file 1 + GS-1 |
| M2 | Unattributed-default | ingress attributes an unattributable event to `DEFAULT_DEMO_ORG` | file 8 + GS-5 named-debt pin |
| M3 | Idempotency key without org | `checkForConflict` returns the foreign `existingRecord` (or the store trusts the `orgId` parameter over the ctx) | file 5 |
| M4 | Global `getLink` | search every partition | file 2 (+ collision pin) |
| M5 | Foreign link payment | `recordLinkPayment` resolves the link before the tenant check | file 2 G-13b + raw-store sweep |
| M6 | Hardcoded export org | blocklist route: `guard.organizationId` → `DEFAULT_DEMO_ORG` | file 7 |
| M7 | MCP bypass | `list_webhooks`: `if (!scoped) return NO_TENANT` → demo fallback | file 9 (refusal text + zero payload) |
| M8 | Quarantine in a prod path | `webhooks/page.tsx` imports `legacyListWebhooks` | GS-4 prod-path scan + consumer-set pin |
| **M9** *(new)* | **Risk shared-policy write** | `deployRiskSettings` writes the process-wide singleton instead of the caller's partition | file 4 + GS-2 |
| **M10** *(new)* | **Blocklist cross-tenant remove** | `removeBlocklist(id)` searches every partition before refusing | file 3 |

M9/M10 exist because Q0 found gaps the draft did not list (P-6 corrected, P-5 writers). A mutation list
that only covers the drafted gaps would leave the two newly-found write paths unproven.


Q0 spec (this doc) → Q1 5 failing test files (40-ish tests, red for missing ctx + ingest
GAPs) → Q2 scoped DALs + ingress attribution + seam + session wiring vs quarantine → Q3
(folded: legacy tests to demo ctx) → Q4 export route + MCP + action tests → Q5 probe
final + full gates → Q6 8 mutations (webhook predicate removal, unattributed-default,
idempotency key without org, global getLink, expire foreign link, hardcoded export org,
MCP bypass, quarantine import in prod path) → Q7 report + matrix + ADR-0047 + commit one slice.
