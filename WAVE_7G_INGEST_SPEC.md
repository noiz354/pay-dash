# Wave 7G — Ingest & Integrity Tenant Isolation (Spec)

Date: 2026-09-13 · Branch: `wave-7d-derived-scoping` (main@a4b595a, Waves 7A/7B/7C PASS, 7D/7E/7F Proposed)
Predecessors: 7A Transactions, 7B Payouts+Refunds, 7C Customers, 7D Billing, 7E Derived, 7F Identity (Proposed where noted)
Status: **Proposed** · Follows ADR-0041/0042/0043 · Reuses `domain/tenancy/organization-context.ts` unchanged

---

## 0. Runtime baseline (measured, not carried over)

| Gate | Result 2026-09-13 |
|---|---|
| Full suite | **1472 passed / 17 failed** (15 pre-existing env `DATABASE_URL` unset + 2 pre-existing calendar flakes) |
| Typecheck | clean · Lint 0 errors / 40 warnings (== D-17) |
| Probe matrix | 0 GAPs — Q1 *adds* ingest GAP pins, Q5 closes them |

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

## 4. Quarantine design (one per DAL that needs it, established pattern)

`server/data/webhooks-unscoped.ts` + `server/data/links-unscoped.ts` (+ `blocklist-unscoped.ts`
ONLY if a caller cannot be wired in-wave): `LEGACY_WEBHOOK_SURFACES` / `LEGACY_LINK_SURFACES`
(seed at Q2, frozen, shrink-only) + surface-naming errors when > 1 tenant has rows.
Ingress-attribution debt (if the connection mapping is missing) gets its own named surface,
not a silent pass. No CSV vocab changes (structural pins).

New seam: `server/services/ingest-organization-context.ts` (resolve/require +
refuseMultiTenantDemo, shared slice seam). No change to `mcp/auth.ts`.

## 5. Tests

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

Q0 spec (this doc) → Q1 5 failing test files (40-ish tests, red for missing ctx + ingest
GAPs) → Q2 scoped DALs + ingress attribution + seam + session wiring vs quarantine → Q3
(folded: legacy tests to demo ctx) → Q4 export route + MCP + action tests → Q5 probe
final + full gates → Q6 8 mutations (webhook predicate removal, unattributed-default,
idempotency key without org, global getLink, expire foreign link, hardcoded export org,
MCP bypass, quarantine import in prod path) → Q7 report + matrix + ADR + commit one slice.
