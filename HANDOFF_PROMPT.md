# Handoff prompt — pay-dash remediation (Phases 1.3 → 5)

Paste everything below the line into Claude Code. It is self-contained.

---

You are continuing remediation of `noiz354/pay-dash`, an enterprise payment-gateway
dashboard (Next.js App Router monorepo, `apps/web`). A full end-to-end production
audit was filed as **`AUDIT_REPORT.md`** (PR #18,
https://github.com/noiz354/pay-dash/pull/18). It scored the product **18/100 —
do not launch**, with **48 findings: 11 CRIT, 17 HIGH, 14 MED, 6 LOW**, and found
that **0 of 25 traced user journeys fully pass**.

Work on branch **`arena/01a09da9-pay-dash`**. The audit base commit is `a4b595a`.

## Read these first, in this order

1. `AUDIT_REPORT.md` §0 (evidence classes), §0.1 (remediation log), §1 (verdict).
2. `AUDIT_REPORT.md` §12 — the phased roadmap. It is the plan of record; each row
   names the finding it fixes and the file to change.
3. `AUDIT_REPORT.md` §13 — "if this launches tomorrow, where does it first fail?"
   Answer: **it fails at the second user, not the ten-thousandth.**
4. `apps/web/src/server/actions/authorization-coverage.test.ts` — the regression
   lock you must not break.
5. `docs/audit/patches/ci-ordering.patch` — a fix that is written but cannot be
   applied from this branch (see *Blocked work*).

## What is already done — do not redo it

| Commit | Closes |
|---|---|
| `4cf8797` | O-01 Sentry init, O-02 health/ready split, R-12, prod env gates |
| `a9ee33d` | **S-01** — edge gate validates the session, not cookie existence |
| `11039c5` | **S-03**, F-02 — self-approvable refund path **deleted** |
| `dd18b71` | **S-04** — global runtime switches behind new `platform.admin` |
| `791ce29` | F-01 — success copy states what actually happened |
| `038816f` | R-07, F-03 — seeded webhook rows labelled, DEMO DATA banner |
| `5c3e846` | S-02 — `team.ts` (6 actions) behind new `team.manage` |
| `26659d7` | S-02 — `settings.ts` (9 actions) behind new `settings.manage` |
| `21e523f` | S-02 — `risk.ts` (5 actions) behind new `risk.manage` |
| `36a2047` | **S-02 closed** — `invoices`, `links`, `blocklist`, `kyc`, `webhooks`, `balance` gated; coverage scanner added |

**S-02 is closed.** 62 of 64 exported Server Actions carry an authorization
construct; the 2 that do not (`setup.ts:getCompletedSteps`,
`setup.ts:toggleSetupStepAction`) read and write only the *caller's own* cookie
`kl.setup` and are recorded in a size-capped allowlist. The population was 65 at
audit time; it is 64 because `refundTransactionAction` was deleted for S-03.

114 behavioral assertions across ten `*.auth.test.ts` suites back this.

## Your task: §12 Phases 1.3 → 5, in this order

Roadmap rows **1.1, 1.2 and 1.5 are done** (marked ✅ in §12). Everything below
is open. Sequencing matters — do not parallelise these away.

### Next up: finish Phase 1

- **1.3 — S-05 (HIGH).** Make `organizationId` and `actor` **required** parameters
  on `resolveProviderWrite`, `tryProviderRefund`, `tryProviderPayout`,
  `tryProviderTransfer`, then let the compiler find every omission. Sites named in
  the report: `data/payouts.ts:862,876`, `actions/transactions.ts:214`. This is a
  small change with a large blast radius — do it alone, in one commit.
- **1.4 — S-09 (HIGH).** Make the export tenant predicate *structural*: have
  `guardExport` return a `TenantScope` that list functions must accept, so
  omitting it is a type error. Apply to the 7 unbound routes (`audit`, `balance`,
  `blocklist`, `invoices`, `invoices/[id]`, `subscriptions`, `team`). Delete the
  `report.export` OR-branch in `guardExport` — it is a universal override. Make
  non-enforcing mode return `ok: false` for tenant-data routes. Copy the existing
  `route.tenant.test.ts` to all 7.
- **1.6 — S-10 (HIGH).** `src/proxy.ts:34` accepts
  `request.nextUrl.searchParams.get("preview_bypass") === "1"` as an alternative to
  the `x-preview-bypass: 1` header. A query parameter is logged, cached, leaked in
  `Referer`, and pasteable into a URL — remove that branch so the header is the only
  form, and require a signed preview secret rather than the literal `"1"`.
- **1.7 — R-11 (MED).** Add a Playwright project that runs the full suite with
  `AUTH_ENFORCED=strict`. The existing E2E specs do not assert.

### Then Phase 2 — durability (the load-bearing phase)

Rows 2.1–2.9 in §12. The decision that gates everything else is **2.1: choose the
store of record.** The recommendation stands — Postgres via Prisma for everything
financial (already in `compose.yaml`, already migrated, 16 correctly-shaped
models), Firestore only for the AI Journal. Then 2.3 migrates the 8 tenant-less
stores one at a time behind the existing `PAYDASH_DATA_SOURCE` switch so each is
independently reversible: `balance` → `settings` → `team` → `links` → `webhooks` →
`risk` → `blocklist` → `kyc`.

**Phase 2 is what makes Phase 1's work mean anything.** Every gate shipped so far
narrows *who* may call an action, not *whose* data the action touches — all of
those stores are process-global with no `organizationId`. This is called out in
the doc comment of every guard already added. Do not let Phase 1 be described as
multi-tenancy; it is not.

### Then Phase 3 (multi-tenancy), Phase 4 (money), Phase 5 (business)

Rows 3.1–3.6, 4.1–4.9, 5.1–5.8 in §12. Phase 3 overlaps Phase 2. **3.1 (create a
real `Organization` + `OrganizationMember` on sign-up) unblocks the two-tenant
test that Phase 1's exit criterion still needs** — there is currently no second
tenant to test with.

Also read §12's **"What to delete rather than fix"** table. Deleting is cheaper
than completing, and this repo carries a lot of well-written code with no caller
(`src/server/dal/*`, `finance/ledger.ts`, `domain/observability/slo.ts`, the
`LedgerEntry` model).

## Blocked work — needs a human, not a patch

- **0.8 — R-10.** CI runs `pnpm test` before `prisma generate`. The fix is written
  at `docs/audit/patches/ci-ordering.patch` but **cannot be applied from this
  branch**: the GitHub App token lacks the `workflows` permission, so any change to
  `.github/workflows/ci.yml` is rejected on push. Apply it from an account that has
  that permission.
- **0.10 — S-02's rate limiting.** No rate limiter exists on `/api/auth/*`; the
  only limiter in the repo is an in-memory per-process counter for the AI Journal.
  This must be upstream (Upstash / Vercel WAF / Cloudflare) — an in-process limiter
  is not a limiter across replicas. Infrastructure work, outside the repository.

## Conventions established by the shipped work — follow them

**The guard pattern.** Each gated module has one file-local async helper wrapping
the seam, returning `ActionState<never> | null`, called as the *first statement* of
every action body:

```ts
const denied = await requireInvoiceWrite();
if (denied) return denied;
```

The helper maps `OrgContextError` to a human message, distinguishing
"Authentication required" (→ "Sign in to …") from a permission denial
(→ "You don't have permission to …"), and never leaks the raw error.

**Choosing a seam.** All five exist in `apps/web/src/server/services/`:
`requireOrgContext` (non-strict — allows the demo fallback),
`requireStrictOrgContext` (**throws** on `isDemoFallback`; use for any money,
compliance or fraud write), and the three resource seams
`requireTransactionOrganizationContext`, `requirePayoutOrganizationContext`,
`requireCustomerOrganizationContext` (resolve tenant from the resource id, with
anti-enumeration). Prefer strict. Prefer matching whatever the already-gated
actions in the same file use, so one resource cannot be split across privileges.

**Doc comments are mandatory.** Every guard carries a comment recording (a) the
defect in terms of business harm, (b) why *this* permission and not an easier one,
(c) what remains open. Match the existing ones — they are written for the next
person arguing about the decision, not for the linter.

**The test pattern.** For each gated module, `<module>.auth.test.ts` proves four
things: the permission demanded; a signed-out caller is refused with the store
byte-identical afterwards; an under-privileged caller likewise; and — critically —
**an authorized caller really does mutate it.** That last assertion is what makes a
denial attributable to the guard rather than to a bad id or a dead pipeline. Mock
`requireStrictOrgContext` via `vi.hoisted`, mock `next/cache`, and reset the store
global (`__kinetic<Name>Store`) in `beforeEach`.

**Never weaken `authorization-coverage.test.ts`.** If you add an action, gate it.
If you genuinely cannot, add it to the allowlist *with a reason a reviewer can
argue with* — and expect the "allowlist stays at two entries" test to make you
update it deliberately.

## Environment traps (all confirmed, do not rediscover them)

- `pnpm install` needs **pnpm 9.12.0** (`npm i -g pnpm@9.12.0`).
- **`prisma generate` fails**: `binaries.prisma.sh` is network-blocked. Consequence:
  `src/server/mcp/customer-tools.tenant.test.ts` and `server.integration.test.ts`
  **always fail to collect** in this environment. Expected — **2 failed files /
  1667 passing tests is the green baseline.** Do not chase them.
- **`pnpm --filter web build` fails**: `next/font/google` cannot reach
  `fonts.googleapis.com`. Environment restriction, not a code defect (but see R-09).
  Do not retry, and do not "fix" it by stubbing `layout.tsx`.
- Network is selectively blocked: `registry.npmjs.org` works, `fonts.googleapis.com`
  does not. No Postgres, no Docker, no apt egress → **no real-DB testing.**
- No browser binary → **Playwright cannot run here.** Write 1.7's specs, but state
  plainly that they are unverified locally rather than claiming they pass.
- `npx vitest run --reporter=basic` fails — "basic" is not a valid reporter in
  vitest 4.x. Use the default or `dot`.
- `bc` is not installed. Use `awk` for arithmetic in shell one-liners.
- **Do not patch server-action signatures with naive string search.** Signatures end
  in `): Promise<ActionState<…>> {` — the character before ` {` is `>`, not `)`.
  Searching for `') {'` skips the signature and matches an `if (...) {` *inside* the
  body, producing valid TypeScript that puts the guard in the wrong scope. It passes
  typecheck and lint. Match parentheses and track angle-bracket depth instead.

## Verify before every commit

```bash
cd /home/user/pay-dash
pnpm typecheck          # must be clean
pnpm lint               # 0 errors; 40 pre-existing warnings in components/ui are fine
cd apps/web && npx vitest run    # expect: 2 failed files (MCP), ~1667+ passing tests
```

Commit with a body that names the finding ID, states the business harm, justifies
the design choice, and says what remains open. Push only to
`arena/01a09da9-pay-dash`.

## Standing constraints from the maintainer — these are not negotiable

- Base every claim on **actual repository implementation**, never documentation,
  ADRs, or assumption.
- **Do not** call a feature working because a button, page, DTO, schema or endpoint
  exists. **Do not** call the backend secure because the frontend hides an action.
- Differentiate **verified / inferred / unverified** explicitly, with evidence
  classes as in §0.
- Cite file paths, symbols, functions, endpoints, schema or tests as evidence.
- Prioritise business flow, user outcome, revenue, data integrity, security,
  reliability and operability **over code quality**.
- If you cannot verify something in this environment, say so and mark it **[U]**
  with the reason. Never imply a test passed that you did not run.

## Where to start

**Row 1.3 (S-05).** It is the smallest change with the clearest compiler-verified
exit criterion: make the tenant parameters required, fix every call site the
compiler reports, and add a test proving a provider write carries the resolved
`organizationId` rather than silently substituting `org_demo`.
