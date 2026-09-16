# Kinetic Ledger / pay-dash — End-to-End Production Audit

**Repo:** `noiz354/pay-dash` · **Branch audited:** `arena/01a09da9-pay-dash` (base `a4b595a`)
**Audit date:** 2026-09-14 · **Method:** static code-path tracing + live runtime probing of a booted dev server
**Auditor scope:** user, business, frontend, backend, data, security, reliability, observability, operations

---

## 0. How to read this report

Every finding carries an evidence class. Nothing here is assumed from UI presence, docs, DTOs, or ADRs.

| Tag | Meaning |
|---|---|
| **[V-RUNTIME]** | Reproduced by executing the app and observing the response / log / state change. Command + output recorded in Appendix A. |
| **[V-CODE]** | Traced end-to-end through source. Caller → callee → persistence → render all read. Cannot be disputed by reading the files. |
| **[V-TEST]** | Proven by running the repo's own test suite (`vitest`, 1482 tests). |
| **[I]** | Inferred from strong indirect evidence (naming, absence of any caller, config defaults). Marked so you can challenge it. |
| **[U]** | Could not be verified in this environment. Reason stated. |

**Environment limits (material, disclosed up front):**
- `prisma generate` cannot run — `binaries.prisma.sh` is network-blocked. The Prisma Client is absent, so 2 test suites fail here and no Postgres-backed path could be executed. **[U]**
- No PostgreSQL binary and no apt egress → the entire audit ran against the app's *default* `PAYDASH_DATA_SOURCE=memory` configuration. This is the same configuration `compose.yaml` ships. **[V-CODE]**
- `pnpm --filter web build` fails: `next/font/google` cannot reach `fonts.googleapis.com`. This is an environment restriction, **not** a code defect — but see R-09, because it is also a real build-time single point of failure.
- No browser binary → Playwright E2E could not be executed. E2E findings are **[V-CODE]** from reading the specs.
- To boot the app at all, `src/app/layout.tsx` was temporarily patched to stub `next/font/google`, then **restored**. `git status --porcelain` is empty. No code was changed by this audit.

---

## 0.1 Remediation log (this branch)

The audit itself changed no code. Remediation began after it was filed and is
tracked here so the report and the branch cannot drift apart. Every entry is a
commit on `arena/01a09da9-pay-dash`; the findings it closes are still described
in full below, in the tense they were found in.

| Commit | Closes | What changed |
|---|---|---|
| `4cf8797` | O-01, O-02, R-12, S-11 (part) | Sentry actually initialises; `/api/health` split from `/api/ready` and returns 503 when the DB is down; compose healthcheck parses JSON; `SENTRY_DSN`, `BETTER_AUTH_SECRET` and both webhook secrets required with no defaults when `APP_ENV=production` |
| `a9ee33d` | **S-01** | The edge gate validates the *session*, not cookie existence; `isPublic()` uses exact + prefix matching instead of `includes()`; `/ai-journal`'s double classification resolved |
| `11039c5` | **S-03**, F-02 | `refundTransactionAction` and `refund-dialog.tsx` deleted — the self-approvable refund path no longer exists |
| `dd18b71` | **S-04** | The six global `runtime.ts` switches gated behind a new `platform.admin` permission (OWNER only) |
| `791ce29` | F-01 | Four success strings now state what actually happened instead of claiming money moved |
| `038816f` | R-07, F-03 | Seeded webhook rows are labelled and both operational pages carry a DEMO DATA banner |
| `5c3e846` | S-02 (6 of 32) | `team.ts` — invites, role changes, deactivation gated behind a new `team.manage` |
| `26659d7` | S-02 (15 of 32) | `settings.ts` — merchant profile, notification channels, API keys, IP allowlist gated behind a new `settings.manage` |
| `21e523f` | S-02 (20 of 32) | `risk.ts` — all five fraud-rule actions gated behind a new `risk.manage` (OWNER + RISK_ANALYST) |
| `36a2047` | **S-02 (closed)** | `invoices.ts`, `links.ts`, `blocklist.ts`, `kyc.ts`, `webhooks.ts`, `balance.ts` gated; static coverage scanner added so a new ungated action fails CI |

**S-02 is closed as of `36a2047`** — see the note at the head of that finding for
the two deviations from §12's plan 1.1/1.2 (one module reclassified as not an
authorization defect; the permission catalogue extended by three permissions
rather than eight).

Phase 0 items **0.8** (CI ordering) and **0.10** (upstream rate limiting on
`/api/auth/*`) are **not** done. 0.8 is blocked mechanically — the GitHub App
token on this branch lacks the `workflows` permission — and is preserved as
`docs/audit/patches/ci-ordering.patch`. 0.10 is infrastructure, outside the
repository.

Everything else in §12 — Phases 1.3 through 5 — is untouched. The verdict in §1
and the failure analysis in §13 stand unchanged: gating *who* may call an action
does not make the data behind it durable or tenant-scoped.

---

## 1. Executive verdict

> ### **DO NOT LAUNCH. This is a high-fidelity interactive prototype wearing the clothes of a production payments platform.**

The engineering *craft* is genuinely above average: 1,482 passing unit tests, a typed environment schema, a real RBAC catalogue (8 roles / 26 permissions), a fail-closed tenant-isolation design, constant-time webhook token comparison, dual-control refund workflows, ADRs, and a self-authored `KNOWN_DEBT_REGISTER.md` with 28 entries. Whoever built this understands what a payments system *should* look like.

But almost none of that machinery is connected to anything. The audit's central finding is a **three-layer disconnection**:

1. **The data layer is not a database.** Every business object — transactions, payouts, customers, balances, invoices, subscriptions, API keys, team members, KYC, webhooks, risk rules, blocklists — lives in `globalThis` Maps seeded by deterministic functions. **Verified at runtime:** I injected two webhook events, restarted the process, and they were gone while the seven seeds (`whk_seed_1`…`whk_seed_7`) reappeared. Prisma/Postgres is used only by Better Auth and by a set of Wave-0 provider tables that **no code path ever writes to**.

2. **The provider layer is permanently unreachable.** `grep` for `paymentProviderConnection.create` and `secretRecord.create` across the whole repo returns **zero results**. There is no UI, action, route, seed, or migration that can create a provider connection or store a provider secret. Therefore `resolveProviderWrite()` returns `{ connected: false }` forever, and every Xendit/Stripe adapter, the capability registry, the KMS activation gate, `AuditEvent`, and `DurableOperation` are **dead code**. The product can never touch real money.

3. **The authorization layer is decorative at the edges.** The edge gate (`src/proxy.ts:161,192`) checks only that a cookie *named* `better-auth.session_token` **exists** — it never validates it. When the (unvalidated) session lookup fails or returns null, `resolveSessionOrgContext()` returns `demoOrgContext()`: **role `OWNER`, organization `org_demo`, `isDemoFallback: true`**. Reads are permitted against that context. **Verified at runtime:** a request carrying the literal cookie value `GARBAGE_NOT_A_REAL_TOKEN` received HTTP 200 and the full seeded ledger on `/dashboard`, `/transactions`, `/customers`, `/audit`, `/team`, `/settings/api-keys`, `/balance`, `/payouts`, `/billing`, `/webhooks`, `/system`, `/onboarding`, `/kyc`, and on row-level detail pages. Server Actions in `team.ts` **executed their bodies** for that same request — they crashed only on my malformed argument encoding, not on any auth check, because they contain none.

Applying the stated definition of PASS (*user action → backend state changes correctly → data persists → UI reflects result → failure diagnosable → business outcome achieved*):

**Of 25 traced end-to-end journeys, 0 fully PASS.** Every one of them fails at "data persists" at the latest. 15 fail earlier — at "backend state changes correctly" or "business outcome achieved". The best-performing journey, refund dual-control (J14/J15), resolves its actor from the session, enforces separation of duties server-side, and collapses cross-tenant probes into a uniform not-found — then moves no money and tells the user it did.

### Verdict by perspective

| Perspective | Grade | One line |
|---|---|---|
| **User** | D | Every screen renders and responds; nothing a user does survives a refresh of the *process*. No external payer surface exists. |
| **Business** | F | No revenue model is implemented at all. Zero references to MDR, take-rate, platform fee, plans, entitlements, metering, or dunning. |
| **Frontend** | B | Genuinely strong: 42 pages, 28 `loading.tsx`, 11 `not-found.tsx`, `SectionBoundary`, 29 `useActionState` forms, 123 toasts, real skeletons. |
| **Backend** | D | Correct patterns wrapped around absent infrastructure. Async work is fire-and-forget; the durable path is unreachable. |
| **Data** | F | In-memory, non-durable, single-process, un-scoped at the store layer. This is the load-bearing failure. |
| **Security** | F | Cookie-*existence* auth, 30+ unauthenticated mutating Server Actions, a global runtime-config action, tenant-less link/KYC stores. |
| **Reliability** | F | No queue, no retry, no scheduler, no cache, no idempotency (the idempotency module has 0 importers). Restart = data loss. |
| **Observability** | D | Sentry server/edge init **never executes** (verified via SDK warnings). Pino is used in exactly one file. `/api/health` returns 200 `"ok"` while reporting `db: "error"`. Product analytics is a 204 no-op. |
| **Operations** | F | No runbook path to create a tenant, connect a provider, or recover state. `compose.yaml` references an `apps/web/.env.prod` that does not exist in the repo. |

**Production readiness score: 18 / 100.** (Scorecard in §10.)

### The single sentence for a non-technical stakeholder

*You have built an extremely detailed simulation of a payment gateway — including a simulation of the parts that would make it a business — and the simulation is honest about itself in its own debt register, but it is one deploy away from being indistinguishable from a working product to a user, while being unable to move a single rupiah.*

---

## 2. As-built architecture (what actually runs)

This is the architecture as **executed**, not as documented. Where it differs from `docs/ARCHITECTURE.md` and the ADRs, the difference is noted.

```
                                  ┌─────────────────────────────────────────┐
   Browser                        │  Next.js 15 App Router (node runtime)   │
      │                           │                                         │
      │  GET /dashboard           │  middleware.ts → src/proxy.ts           │
      ├──────────────────────────►│   • AUTH_ENFORCED = strict (default)    │
      │   Cookie: better-auth     │   • checks cookies.has(session_token)   │◄── BYPASS: existence only,
      │   .session_token=ANYTHING │   • NO signature / NO session lookup    │    value never validated
      │                           │                                         │
      │   200 + full ledger       │  app/[locale]/**/page.tsx (42 pages)    │
      │◄──────────────────────────┤   force-dynamic, Suspense + skeletons   │
      │                           │                                         │
      │                           │  server/services/session-org-context.ts │
      │                           │   resolveSessionOrgContext()            │
      │                           │     auth.api.getSession()               │
      │                           │        ├─ throws (DB down) ──┐          │
      │                           │        └─ returns null ──────┤          │
      │                           │                              ▼          │
      │                           │        demoOrgContext()  ◄── ALWAYS     │
      │                           │        { orgId: "org_demo",             │
      │                           │          roles: [OWNER],                │
      │                           │          isDemoFallback: true }         │
      │                           │                                         │
      │                           │  ┌───────────────────────────────────┐  │
      │                           │  │  server/data/*.ts                 │  │
      │                           │  │  globalThis Maps + deterministic  │  │◄── ALL business state.
      │                           │  │  seeds. NO orgId column on most.  │  │    Lost on restart.
      │                           │  │  transactions.ts (1275 lines)     │  │    Fragments per replica.
      │                           │  │  payouts.ts (1159), customers.ts  │  │
      │                           │  │  balance.ts, invoices.ts, links.ts│  │
      │                           │  │  team.ts, kyc.ts, settings.ts ... │  │
      │                           │  └───────────────────────────────────┘  │
      │                           │                 │                       │
      │                           │  server/payment-flows/                  │
      │                           │  execute-provider-write.ts              │
      │                           │    resolveProviderWrite()               │
      │                           │      └─► { connected: false }  ◄── ALWAYS
      │                           │            (no PaymentProviderConnection│
      │                           │             row can ever be created)    │
      │                           │                 │                       │
      │                           │      ┌──────────┴──────────┐            │
      │                           │      ▼                     ▼            │
      │                           │  in-memory demo write   DEAD: providers/│
      │                           │  (mock settlement)      xendit, stripe, │
      │                           │                         KMS gate,       │
      │                           │                         AuditEvent,     │
      │                           │                         DurableOperation│
      │                           └─────────────────────────────────────────┘
      │
      │  Postgres (compose.yaml) ──► Prisma ──► Better Auth users/sessions ONLY
      │                                  └──► Wave-0 provider tables: NEVER WRITTEN
      │
      │  Firebase ──► /ai-journal: SEPARATE auth (Firebase), SEPARATE store (Firestore),
      │               SEPARATE rate limit (in-memory 10/10min). Not part of the tenancy model.
      │
      └  Umami / sendBeacon ──► /api/vitals ──► 204 no-op. All product analytics discarded.
```

**Documented vs. as-built — the five divergences that matter:**

| Docs / ADR claim | As-built reality | Evidence |
|---|---|---|
| ADR-0014: "every callback is persisted to the webhook log" | Persisted to an in-memory Map; the Prisma `WebhookDelivery` write is in the unreachable durable path | `src/server/webhooks/store-delivery.ts`, `audit-event-store.ts` fallback |
| ADR-0012: balance "derived from the same overview as `/balance`, so the two cannot disagree" | True *within one process*. Across replicas or a restart they disagree absolutely | `src/server/data/balance.ts` |
| Wave 7A/7B/7C "fail-closed tenant isolation" | The seam exists and is well written, but resolves to `org_demo` for every caller because no `OrganizationMember` row is ever created | `src/server/services/*-organization-context.ts` |
| "Verify → dedupe → 200 fast → queue" | There is no queue. `void processWebhookAsync(...)` fires after the 200 and can be killed | `src/app/api/webhooks/xendit/route.ts:75` |
| `PAYMENTS_PUBLIC_ORIGIN` (`.env.example`) drives callback/redirect URLs | Declared in `src/lib/env.ts:22,46` and **referenced nowhere else**. Share URLs are hardcoded to `https://pay.kinetic.test/` | `src/lib/link-status.ts:28` |

---

## 3. Flow maps — traced code paths

### 3.1 Money IN: Payment Link (the product's core revenue journey)

```
Merchant clicks "Create link"
  └─ app/[locale]/payments/links/page.tsx
      └─ createPaymentLinkAction(prev, formData)         src/server/actions/links.ts
          └─ createLink({...})                           src/server/data/links.ts:243
              ├─ NO orgId parameter. NO org context resolved. NO auth check.
              ├─ writes to a process-global Map → links are shared across ALL tenants  [V-CODE]
              └─ shareUrlOf(id) → `https://pay.kinetic.test/${id}`   src/lib/link-status.ts:28
                                        ▲
                                        └── This domain does not exist. There is no
                                            public checkout route anywhere in app/.
                                            grep for a payer-facing page → none.

Payer opens the link
  └─ DNS failure. The journey ENDS HERE.                                 ✗ BROKEN

The only way a link becomes "paid":
  └─ merchant clicks "Simulate payment" inside their own dashboard
      └─ payPaymentLinkAction → recordLinkPayment()
          └─ DOES write a tenant-scoped transaction (org context resolved here)
             → the ledger is tenant-scoped but the link store is not.  Split-brain.  [V-CODE]

Expiry:
  └─ expirePaymentLinkAction — NO auth, NO org check. Any caller can expire any link. [V-CODE]
```

**Verdict:** The primary money-in journey has **no external payer surface**. It is a dashboard-internal state toggle. Business outcome: **not achievable**.

### 3.2 Money IN: Webhook from a real provider

```
Xendit POSTs /api/webhooks/xendit                        src/app/api/webhooks/xendit/route.ts
  ├─ 1. verify x-callback-token (constant-time, verify.ts)   ✓ correct
  │     • env.XENDIT_WEBHOOK_TOKEN is z.optional() → no build/startup failure if unset
  │     • NODE_ENV=production & unset → 500 fail-closed        ✓ correct
  │     • NODE_ENV≠production & unset → ACCEPTS UNSIGNED       [V-RUNTIME]
  │         probe: POST {"id":"evt_AUDIT_PROBE_UNAUTH_999",...} → 200 {"received":true}
  │         probe: same on /api/webhooks/stripe → 200, appeared in /webhooks UI
  ├─ 2. Zod parse + dedupe via recordWebhookDelivery()
  │     • Prisma WebhookDelivery write is in the unreachable durable path → in-memory
  ├─ 3. return 200 immediately
  └─ 4. void processWebhookAsync(event, payload)         route.ts:75  ◄── FIRE AND FORGET
        • no await, no waitUntil, no queue, no retry, no DLQ
        • on Vercel/Cloud Run the isolate freezes after the 200 → projection never runs
        • provider saw 200 → will NOT retry
        • failure path is console.error only → invisible
        RESULT: silent money-state divergence.                              ✗ [V-CODE]
```

**Verdict:** Signature verification is correctly implemented (rare and commendable), but the *processing* half is unreliable by construction and the *persistence* half is volatile.

### 3.3 Money OUT: Payout batch approval

```
/app/[locale]/payouts → approveBatchAction                src/server/actions/payouts.ts:133
  ├─ requirePayoutOrganizationContext("payout.release")   ✓ CORRECT — strict seam + RBAC
  ├─ BatchConfirmSchema.safeParse                          ✓ confirm-before-release
  ├─ catch TenantIsolationError → "That batch no longer exists."  ✓ anti-enumeration
  └─ approveBatch(access.context, id, { actorId: access.actorId })   ✓ context + actor passed
      │                                                     src/server/data/payouts.ts:834
      ├─ writableBatch(ctx, id, "payouts.approve", actorId) ✓ tenant + permission re-check
      ├─ creator-may-not-approve dual control               ✓ data/payouts.ts:845
      │
      ├─ resolveProviderWrite()          ← NO ARGUMENT      ✗ data/payouts.ts:862
      │     `ctx.organizationId` IS IN SCOPE AND IS NOT USED.
      │     → resolveFirstActive(organizationId ?? DEFAULT_DEMO_ORG)  → probes "org_demo"
      │     → a batch belonging to tenant B is probed against tenant A's connections
      │
      └─ tryProviderPayout({ recipientId, channelCode, accountNumber,
                             accountHolderName, amountMinor, currency })
                                          ← NO organizationId, NO actor   ✗ data/payouts.ts:876
            → resolveProviderWrite(undefined) → "org_demo" again
            → the durable audit/op record is attributed to the wrong tenant
              and to no human actor at all

      fallback settlement (the path that actually runs today) is a MOCK:
            account numbers ending "0000" are rejected; everything else "succeeds"
```

**Verdict:** The *authorization* half of this journey is genuinely well built — strict seam, RBAC, dual control, anti-enumeration. The *execution* half is broken twice over: the provider probe and the provider write both discard the correctly-resolved tenant context and silently substitute `org_demo`, and the settlement outcome that users actually see is decided by whether a bank account number ends in `0000`. Business outcome: **not achievable**; audit attribution: **actively wrong**.

### 3.4 Refunds — two implementations, one live, one dead-but-exposed

There are **two** refund code paths in this repository. Distinguishing them is essential; conflating them produces a false report in either direction.

**Path A — LIVE and correctly built.** `app/[locale]/transactions/[id]/page.tsx:132` renders `<RefundWorkflow>` + `<RefundDecisionPanel>` (`components/transactions/refund-workflow.tsx`):

```
Role A (refund.prepare)  requestRefundAction   actions/transactions.ts:336
  └─ requireTransactionOrganizationContext("refund.prepare")     ✓ STRICT seam
  └─ → refundState = AWAITING_APPROVAL + handoff + notification

Role B (refund.execute)  approveRefundAction   actions/transactions.ts:383
  └─ requireTransactionOrganizationContext("refund.execute")     ✓ STRICT seam
  └─ approveRefund(ctx.context, { transactionId, approvedBy: ctx.actorId })
      └─ data/transactions.ts:1064 resolveForWrite(...)          ✓ tenant + permission
      └─ :1070  tx.refundRequest.requestedBy === input.approvedBy → SAME_ACTOR
                ✓ dual control enforced against the SESSION actor, not the form
      └─ :1078  tx.refundedAmount / status / refundState mutated IN MEMORY
      └─ :1083  appendEvent("Refund issued", ...)
  └─ returns { status: "success", message: "Refund approved and issued." }
                                        ▲
       NO provider call. grep for tryProviderRefund call sites → exactly one,
       at actions/transactions.ts:214, which is inside Path B.
       Nothing is issued anywhere. The message is false.          ✗ [V-CODE]
```

**Path B — DEAD IN THE UI, LIVE ON THE NETWORK.** `refundTransactionAction` (`actions/transactions.ts:114`, 132 lines):

```
Its only importer is components/transactions/refund-dialog.tsx:23,65
  └─ grep for RefundDialog / refund-dialog across src/ → ZERO importers. DEAD COMPONENT.
  └─ but the action is still `"use server"`-exported → still an invokable HTTP endpoint.

Two defects inside it:
 (a) It is the ONLY money-movement action in the repo that uses the READ seam:
       line 137:  access = await resolveTransactionOrganizationContext()
     Every sibling uses the strict WRITE seam:
       :68   createTransactionAction   requireTransactionOrganizationContext("money_in.create")
       :254  retryTransactionAction    requireTransactionOrganizationContext("money_in.create")
       :342  requestRefundAction       requireTransactionOrganizationContext("refund.prepare")
       :389  approveRefundAction       requireTransactionOrganizationContext("refund.execute")
       :417  rejectRefundAction        requireTransactionOrganizationContext("refund.execute")
     It re-implements permission + demo-fallback denial inline (:167-179) instead of
     inheriting the seam's fail-closed guarantee.

 (b) DUAL CONTROL IS CLIENT-SUPPLIED.                       actions/transactions.ts:184,193
       const approverId  = String(formData.get("approverId") ?? "").trim() || null;
       const requesterId = ctx.userId ?? "unknown";
       if (!isApproverDistinct(requesterId, approverId)) → error
     and `isApproverDistinct` is literally `requesterId !== approverId`
     (src/domain/security/step-up.ts:173-175).
     → Any string other than your own user id satisfies the control. No check that the
       approver exists, holds `refund.execute`, belongs to the organization, or consented.
       No approval record is created by that person.
     AND: `approverId` appears in ZERO .tsx files under src/components or src/app.
       No UI ever sends it. So through the shipped dialog the branch can only ever
       return "This refund requires a separate approval — provide an approver."
```

Dual-control thresholds that trigger this (`src/domain/security/step-up.ts:119`, `DEFAULT_DUAL_CONTROL_POLICY`, never overridden by any caller):

| Kind | Threshold | Applies in TEST mode? |
|---|---|---|
| `refund.amount` | ≥ IDR 10,000,000 | yes (`mode` only gates `platform.transfer` / `split.activation`) |
| `refund.pct` | > 50% of the original payment | yes |
| `payout.recipient` | ≥ IDR 25,000,000 | yes |
| `payout.batch` | ≥ IDR 100,000,000 | yes |

**Verdict:** Path A is authorized correctly and moves no money while telling the user it did. Path B is unreachable from the UI, uses the wrong seam, and gates a money-out dual control on a value the client chooses. Path B should be deleted, not fixed — but until it is, it is an exposed endpoint.

### 3.5 Tenant onboarding (the journey that makes the product a SaaS)

```
Visitor → /sign-up → Better Auth signUp.email
  └─ POST /api/auth/sign-up/email
      • creates a `User` row. NOTHING ELSE.                        [V-CODE]
      • NO Organization created
      • NO OrganizationMember created
      • NO default role assigned
      • NO provider connection scaffolded
      • NO welcome email (grep nodemailer|resend|sendgrid|createTransport → ZERO)
      • requireEmailVerification: false  → account live immediately
      [V-RUNTIME] with DB unreachable: HTTP 500 + an HTML error page, not JSON.

First request after sign-in
  └─ resolveSessionOrgContext()
      └─ organizationMember.findFirst({ where: { userId } }) → null
          └─ demoOrgContext() → org_demo / OWNER / isDemoFallback=true

Consequence A (default mode): user sees the SEEDED DEMO LEDGER as their own,
  with OWNER authority over org_demo. Their data is everybody's data.
Consequence B (strict mode): requireStrictOrgContext() denies isDemoFallback →
  EVERY money-movement action throws FORBIDDEN. A real, correctly-authenticated
  customer literally cannot transact.                                 ✗ [V-CODE]
Consequence C: if a second tenant ever DOES exist, the Wave-7A/7C quarantine
  (transactions-unscoped.ts LEGACY_LEDGER_SURFACES = 12 surfaces,
   customers-unscoped.ts LEGACY_CUSTOMER_SURFACES) throws
  UnscopedLedgerAccessError → those pages hard-error for EVERYONE.      ✗ [V-CODE]
```

**Verdict:** There is no path from "person signs up" to "person has a working, isolated merchant account". The three possible outcomes are: shared demo data, total lockout, or a hard crash for all tenants. This is the single most important finding in the report.

### 3.6 KYC / merchant verification

```
/kyc → kyc-upload.tsx                                  src/components/kyc/kyc-upload.tsx
  └─ the selected file is NEVER UPLOADED.
     Only `fileName` and `sizeBytes` are carried as hidden <input>s.   [V-CODE]
     → the "document" is two spoofable strings.
  └─ submitKycAction (authenticated ✓)
      └─ src/server/data/kyc.ts holds ONE GLOBAL submission — not per tenant. [V-CODE]
         deliberately unseeded, so /kyc renders empty until someone submits,
         and then shows ONE merchant's submission to EVERY merchant.
  └─ removeKycDocumentAction — NO auth at all.                            [V-CODE]
  └─ review outcome is explicitly not modelled ("compliance team owns it")
```

**Verdict:** A regulated onboarding control rendered as a form that discards its own payload. Compliance outcome: **not achievable**. Also a cross-tenant disclosure vector.

---

## 4. Journey matrix

PASS requires all six: **(1)** user action → **(2)** backend state changes correctly → **(3)** data persists → **(4)** UI reflects result → **(5)** failure is diagnosable → **(6)** business outcome achieved.

| # | Journey | 1 Act | 2 Backend | 3 Persist | 4 UI | 5 Diagnosable | 6 Outcome | Result | Blocking defect |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| J1 | Sign up | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | **FAIL** | No Organization/Member created; 500 HTML on DB error |
| J2 | Sign in | ✓ | ~ | ✗ | ~ | ✗ | ✗ | **FAIL** | Session valid but resolves to `org_demo` OWNER |
| J3 | View dashboard | ✓ | ✗ | n/a | ✓ | ~ | ✗ | **FAIL** | Shows seeded demo data as the user's own |
| J4 | View transaction detail | ✓ | ✗ | n/a | ✓ | ~ | ✗ | **FAIL** | Same; reachable unauthenticated with a garbage cookie **[V-RUNTIME]** |
| J5 | Export transactions CSV | ✓ | ✓ | n/a | ✓ | ✓ | ✗ | **FAIL** | Guard correctly 401s on demo fallback → real users can't export **[V-RUNTIME]** |
| J6 | Export team / subscriptions CSV | ✓ | ✗ | n/a | ✓ | ✗ | ✗ | **FAIL** | Route **ignores** the returned `organizationId` → global export |
| J7 | Create payment link | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | **FAIL** | No org context; no payer surface; fake share domain |
| J8 | Payer pays a link | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **FAIL** | Route does not exist |
| J9 | Simulate link payment | ✓ | ~ | ✗ | ✓ | ~ | ✗ | **FAIL** | In-memory only; not a real payment |
| J10 | Create customer | ✓ | ~ | ✗ | ✓ | ~ | ✗ | **FAIL** | In-memory |
| J11 | Create invoice | ✓ | ~ | ✗ | ✓ | ~ | ✗ | **FAIL** | In-memory |
| J12 | Customer pays invoice | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | **FAIL** | `payInvoiceAction` has NO org-context check — anyone pays any invoice |
| J13 | Top up balance | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | **FAIL** | `topUpBalanceAction` has NO auth |
| J14 | Request refund | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | **FAIL** | Correctly authorized (`refund.prepare`, strict seam); state is in-memory only |
| J15 | Approve / reject refund | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | **FAIL** | Best-authorized journey in the app — but no provider call at all, and the UI reports **"Refund approved and issued."** when nothing was issued |
| J15b | Legacy single-step refund (`refundTransactionAction`) | ✓ | ✗ | ✗ | n/a | ✗ | ✗ | **FAIL** | Dead in the UI (0 importers of `RefundDialog`) but still an exposed Server Action; uses the **read** seam; dual-control `approverId` is **client-supplied** |
| J16 | Create + approve payout batch | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | **FAIL** | Attributed to `org_demo`/`system`; mock settlement |
| J17 | Bulk payout upload | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | **FAIL** | Same |
| J18 | Invite team member / change role | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | **FAIL** | **Zero auth** **[V-RUNTIME: action body executed unauthenticated]**; store disconnected from `OrganizationMember` |
| J19 | Submit KYC | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | **FAIL** | File never uploaded; one global submission |
| J20 | Create / revoke API key | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | **FAIL** | **Zero auth**; key is a string in a Map, not a usable credential |
| J21 | Receive + process webhook | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | **FAIL** | Fire-and-forget; no queue/retry; volatile store |
| J22 | Replay webhook | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | **FAIL** | Zero auth; operates on seeded fake events |
| J23 | Investigate in audit log | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | **FAIL** | Derived in-memory; no actor, no IP, no tenant |
| J24 | Ask the AI Journal | ✓ | ✓ | ✓ | ✓ | ~ | ~ | **PARTIAL** | Only journey with real external persistence (Firestore) — but a *separate auth system*, separate tenancy, public route |

**0 / 25 PASS. 1 / 25 PARTIAL.**

Legend: ✓ achieved · ~ partial/qualified · ✗ failed · n/a not applicable to this journey.

### Funnel analysis (J1–J9 as an activation funnel)

```
Visit /sign-up                     100%
  └─ complete sign-up                0%   ← HTTP 500 without a DB; with a DB, succeeds
  └─ receive any confirmation        0%   ← no email infrastructure exists at all
  └─ land on an account that is THEIRS 0%  ← resolves to org_demo, shared with everyone
  └─ complete onboarding checklist     —   ← checklist state lives in a CLIENT COOKIE
  └─ connect a payment provider      0%   ← no code path can create a connection
  └─ create a payment link           —    ← possible, but tenant-less
  └─ share it with a real payer      0%   ← pay.kinetic.test does not resolve
  └─ receive first real payment      0%
  └─ receive first real payout       0%
  └─ be billed by the platform       0%   ← no billing model exists
```

**Activation rate: 0%.** There is no funnel to optimise; the first step terminates.

---

## 5. Security findings

Severity scale: **CRIT** (exploitable now, money/data/authority impact) · **HIGH** · **MED** · **LOW**.

### S-01 — CRIT · The edge gate validates cookie *existence*, not the session **[V-RUNTIME + V-CODE]**

`src/proxy.ts` is the only request-level authentication gate. Three call sites, all identical:

```ts
// src/proxy.ts:82  (protected /api/*)
// src/proxy.ts:161 (bare app routes)
// src/proxy.ts:192 (locale-prefixed app routes)
const hasSession = request.cookies.has("better-auth.session_token")
                || request.cookies.has("__Secure-better-auth.session_token");
```

`cookies.has()` tests for the presence of the name. The value is never parsed, never signature-checked, never round-tripped to Better Auth. When the request then reaches a page, `resolveSessionOrgContext()` calls `auth.api.getSession()`, which either throws (DB unreachable) or returns `null` (invalid token) — and **both branches land on the same `demoOrgContext()`**: `orgId: "org_demo"`, `roles: [OWNER]`, `isDemoFallback: true`.

Reproduced with a literal garbage value:

```
$ curl -H 'Cookie: better-auth.session_token=GARBAGE_NOT_A_REAL_TOKEN' http://127.0.0.1:3000/dashboard
200   334,801 bytes   contains "Total Volume", "TEST MODE", txn_2cd9_4rsmxrj2, txn_2cd9_8224ejx0
```

| Route | Status | Bytes | Route | Status | Bytes |
|---|---|---|---|---|---|
| `/dashboard` | 200 | 334,801 | `/balance` | 200 | 326,813 |
| `/transactions` | 200 | 350,512 | `/payouts` | 200 | 306,984 |
| `/transactions/txn_2cd9_4rsmxrj2` | 200 | 281,976 | `/billing` | 200 | 302,512 |
| `/customers` | 200 | 381,115 | `/webhooks` | 200 | 262,263 |
| `/audit` | 200 | 205,084 | `/system` | 200 | 176,336 |
| `/team` | 200 | 150,349 | `/onboarding` | 200 | 144,658 |
| `/settings/api-keys` | 200 | 163,456 | `/kyc` | 200 | 122,937 |
| `/en/dashboard` | 200 | 335,012 | `/definitely-not-a-route` | 404 | — |

The same request against the API routes was correctly refused — the *route* guards do real work even though the middleware does not:

```
/api/exports/transactions   401 {"error":"Unauthorized"}     /api/exports/team     401
/api/exports/customers      401                              /api/exports/audit    401
/api/dashboard/command-center 401                            /api/mcp              401
```

`guardExport` rejects `isDemoFallback`. So the product's posture is **inconsistent by accident**: exports are protected, the screens that render the same data are not. An attacker does not need the CSV endpoint when the HTML contains everything.

Two further weaknesses in the same file:
- `isPublic()` uses `pathname.includes(p)` — a **substring** test on an authentication allowlist. Any path containing `/sign-in`, `/sign-up`, `/api/health`, `/_next`, `/favicon`, or `/static` is treated as public. Allowlists must be prefix- or exact-match.
- `/ai-journal` appears in **both** `PUBLIC_PATHS` and `APP_ROUTE_PREFIXES`. Because the bare-route branch runs first, `/ai-journal` requires a cookie while `/id/ai-journal` does not. The same resource has two different access rules depending on URL shape.

**Fix:** delete the cookie-existence check. Call `auth.api.getSession({ headers })` in the middleware (Better Auth supports this on the edge with the JWT cookie cache) and redirect on `null`. Replace `includes()` with exact/prefix matching. Resolve `/ai-journal`'s classification once.

### S-02 — CRIT · 32 of 65 Server Actions have no authorization whatsoever **[V-CODE, one instance V-RUNTIME]** · **RESOLVED `36a2047`**

> **Resolution note.** All 32 are now closed, with two deliberate deviations from
> §12's plan:
>
> 1. **`setup.ts` (2 actions) is reclassified, not gated.** `getCompletedSteps`
>    and `toggleSetupStepAction` read and write the *caller's own* cookie
>    (`kl.setup`). There is no shared state and no other principal's data, so
>    there is nothing to authorize — a caller can only falsify their own progress
>    indicator. Gating it would add a failure mode without removing one. The real
>    defect stands and is unchanged: onboarding completion lives in a client
>    cookie rather than a `merchant.setup` column (B-03). These two are recorded
>    in a size-capped allowlist in `authorization-coverage.test.ts`, and a test
>    fails if that list grows.
> 2. **Three permissions were added, not eight.** Plan 1.2 proposed
>    `settings.apikeys.write`, `team.invite`, `team.role.change`,
>    `risk.rules.deploy`, `fraud.blocklist.write`, `webhooks.replay`,
>    `balance.topup` and `invoice.mark_paid`. Shipped instead: `team.manage`,
>    `settings.manage`, `risk.manage` — plus reuse of the existing
>    `money_in.create`, `kyc.submit` and `provider.connect.test`. One permission
>    per resource, matching what the already-gated actions in each file demanded,
>    so issuing and settling an invoice (or creating, paying and expiring a link)
>    cannot be split across different privileges. The finer split remains a
>    reasonable later decision; it was not required to close the hole and would
>    have made the catalogue harder to reason about.
>
> `balance.ts:topUpBalanceAction` — the first row of the table — was still
> ungated after the other six modules were fixed, and was caught by the coverage
> scanner on its first run. That is the argument for plan 1.5 existing at all.

Detection method: each `export async function` block in `src/server/actions/*.ts` (tests excluded) was scanned for any of 21 authorization constructs — `requireOrgContext`, `requireStrictOrgContext`, `resolveSessionOrgContext`, `require{Transaction,Customer,Payout}OrganizationContext`, `auth.api`, `getSession`, `requireSession`, `OrgContextError`, `access.context`, `ctx.organizationId`, `organizationId`, `hasPermission`, `TenantScope`. 33 actions matched; **32 did not**.

| Module | Line | Server Action | What an unauthenticated caller can do |
|---|---|---|---|
| `actions/balance.ts` | 40 | `topUpBalanceAction` | Increases the merchant's available balance — creates money from nothing |
| `actions/blocklist.ts` | 19 | `addBlocklistAction` | Adds an arbitrary card/email/IP to the fraud blocklist — can block legitimate customers |
| `actions/blocklist.ts` | 34 | `removeBlocklistAction` | Removes a fraud blocklist entry — can un-block a known fraudster |
| `actions/invoices.ts` | 36 | `payInvoiceAction` | Marks ANY invoice paid with no org check — fabricates revenue |
| `actions/invoices.ts` | 75 | `payInvoicesAction` | Bulk version of the above |
| `actions/kyc.ts` | 76 | `removeKycDocumentAction` | Deletes the single global KYC submission — destroys a compliance record |
| `actions/links.ts` | 72 | `createPaymentLinkAction` | Creates a payment link in the process-global store — no tenant attribution |
| `actions/links.ts` | 148 | `expirePaymentLinkAction` | Expires ANY tenant's live payment link — revenue denial |
| `actions/risk.ts` | 22 | `saveVolumeDraftAction` | Edits draft velocity/volume risk rules |
| `actions/risk.ts` | 46 | `setVolumeEnabledAction` | Enables/disables volume risk screening |
| `actions/risk.ts` | 64 | `toggleRuleAction` | Toggles a fraud rule on or off |
| `actions/risk.ts` | 82 | `deployRiskAction` | Deploys draft risk rules to the live ruleset |
| `actions/risk.ts` | 93 | `discardDraftAction` | Discards pending risk configuration |
| `actions/settings.ts` | 70 | `updateMerchantProfileAction` | Rewrites the merchant's legal/business profile |
| `actions/settings.ts` | 109 | `updateNotificationChannelAction` | Rewrites alerting destinations — can blind the ops team |
| `actions/settings.ts` | 140 | `updateNotificationPreferenceAction` | Disables notifications |
| `actions/settings.ts` | 174 | `createApiKeyAction` | Mints a new API credential and displays it once |
| `actions/settings.ts` | 211 | `revokeApiKeyAction` | Revokes a live API credential — outage |
| `actions/settings.ts` | 229 | `rollApiKeyAction` | Rotates a live API credential — outage |
| `actions/settings.ts` | 258 | `addIpAllowAction` | Edits the API IP allowlist — can lock out or open up access |
| `actions/settings.ts` | 275 | `removeIpAllowAction` | Edits the API IP allowlist |
| `actions/settings.ts` | 292 | `updateDeveloperToggleAction` | Flips developer/platform feature switches |
| `actions/setup.ts` | 14 | `getCompletedSteps` | Reads onboarding state (low) |
| `actions/setup.ts` | 22 | `toggleSetupStepAction` | Falsifies onboarding completion — a client cookie, not server state |
| `actions/team.ts` | 37 | `inviteMemberAction` | Invites a member with ANY role, incl. ADMIN/OWNER |
| `actions/team.ts` | 57 | `changeRoleAction` | Privilege escalation: rewrites member roles in bulk |
| `actions/team.ts` | 78 | `deactivateAction` | Deactivates members in bulk — denial of service to the org |
| `actions/team.ts` | 96 | `reactivateAction` | Reactivates a deactivated member |
| `actions/team.ts` | 107 | `resendInviteAction` | Re-sends an invite |
| `actions/team.ts` | 118 | `revokeInviteAction` | Revokes a pending invite |
| `actions/webhooks.ts` | 33 | `simulateWebhookAction` | Injects a synthetic webhook event into the operational log |
| `actions/webhooks.ts` | 72 | `replayWebhookAction` | Replays a logged webhook event — can re-trigger projections |

**32 of 65 exported Server Actions contain no authorization construct of any kind.**

**Runtime confirmation.** POSTing to `/team` with the garbage cookie caused the action *bodies* to execute. They crashed only because my hand-rolled request passed `formData` in the wrong argument position — not because anything rejected the caller:

```
⨯ TypeError: Cannot read properties of undefined (reading 'get')
    at inviteMemberAction (src/server/actions/team.ts:41:32)
⨯ TypeError: Cannot read properties of undefined (reading 'getAll')
    at idsOf (src/server/actions/team.ts:32:19)  at changeRoleAction (team.ts:61:15)
⨯ TypeError: Cannot read properties of undefined (reading 'getAll')
    at idsOf (src/server/actions/team.ts:32:19)  at deactivateAction (team.ts:82:15)
⨯ TypeError: Cannot read properties of undefined (reading 'get')
    at resendInviteAction (src/server/actions/team.ts:111:30)
POST /team 500   (×4 distinct actions, all reached their bodies)
```

Four separate mutating actions ran to the point of touching their arguments, for a request with no valid session. There is no `return unauthorized` anywhere in those functions to have hit first.

**Note the asymmetry that makes this worse:** the modules that *do* enforce are the money modules (`payouts`, `transactions`, `customers`, `platform`, `subscriptions`, `payment-methods`). The modules that *don't* are the ones that control **credentials, people, and detection**: API keys, IP allowlists, team roles, risk rules, the fraud blocklist, notification channels, and webhook replay. An attacker who cannot move money directly can instead mint an API key, promote themselves to ADMIN, disable volume screening, delete a blocklist entry, and blind the alerting — then move money through the front door.

**Also: no rate limiting anywhere.** The only limiter in the repository is `assertWithinAiJournalRateLimit` (`src/server/ai-journal/rate-limit.ts:28`) — an in-memory 10-messages-per-10-minutes-per-uid counter for the AI Journal, which is per-process and therefore not a limiter in a multi-replica deployment. There is no limiter on `/api/auth/*`, so credential stuffing and password spraying are unthrottled. Corroborated by the team's own `KNOWN_DEBT_REGISTER.md` D-05/D-06.

### S-03 — CRIT · Refund dual control can be satisfied with a client-supplied string **[V-CODE]**

Detailed in §3.4 Path B. `src/server/actions/transactions.ts:184`:

```ts
const approverId = String(formData.get("approverId") ?? "").trim() || null;
...
const requesterId = ctx.userId ?? "unknown";
if (!isApproverDistinct(requesterId, approverId)) { /* reject */ }
```

`isApproverDistinct` (`src/domain/security/step-up.ts:173`) is `requesterId !== approverId`. The approver is whoever the request body says it is. No existence check, no role check, no membership check, no consent, no record. Triggers at ≥ IDR 10,000,000 or > 50% of the original payment.

The same action is also the only money-movement action using the **read** seam (§3.4). Its sole UI importer (`refund-dialog.tsx`) has zero importers, so the path is untested by the app and by E2E — but `"use server"` keeps it routable.

**Fix:** delete `refundTransactionAction` and `refund-dialog.tsx`. The live journey (`requestRefundAction` → `approveRefundAction`) already enforces separation of duties correctly against the session actor at `src/server/data/transactions.ts:1070`.

### S-04 — CRIT · Any authenticated user can rewrite global runtime configuration **[V-CODE]**

`src/server/actions/runtime.ts` exposes six actions gated only by `requireSession` — a *presence-of-session* check with **no role and no permission**:

| Action | Effect | Scope |
|---|---|---|
| `setDataSourceAction` | Switches `PAYDASH_DATA_SOURCE` between `memory` and `firestore` | **process-global** |
| `setMcpEnabledAction` | Enables/disables the MCP integration | global |
| `rotateMcpTokenAction` | Rotates the MCP bearer token | global |
| `setXenditEnabledAction` | Enables/disables the Xendit integration | global |
| `testXenditConnectionAction` | Fires a live provider call | global |
| `getRuntimeSettingsAction` | Discloses the above | global |

None of these is scoped to an organization. Switching the data source or disabling Xendit affects **every tenant simultaneously**; rotating the MCP token breaks every other tenant's integration. A user with no role at all — including one whose only credential is the S-01 garbage cookie, if `requireSession` is satisfied by the demo fallback — can do this.

`requireSession` needs checking against `resolveSessionOrgContext`'s fallback behaviour; either way the absence of a role check is the defect. **Fix:** gate all six behind `OWNER` + an explicit `platform.admin` permission, scope them per-organization, and audit every invocation.

### S-05 — HIGH · Provider writes discard the resolved tenant context **[V-CODE]**

Two call sites pass no `organizationId` where one is in scope:

| Site | Call | In scope but unused |
|---|---|---|
| `src/server/data/payouts.ts:862` | `resolveProviderWrite()` | `ctx.organizationId` (parameter of the enclosing `approveBatch`) |
| `src/server/data/payouts.ts:876` | `tryProviderPayout({ recipientId, channelCode, accountNumber, accountHolderName, amountMinor, currency })` | `ctx.organizationId`, `opts.actorId` |
| `src/server/actions/transactions.ts:214` | `tryProviderRefund({ originalPaymentId, amountMinor, currency, originalPaymentAmountMinor, approverId })` | `ctx.organizationId`, `ctx.userId` |

Both callees default: `resolveProviderWrite(organizationId?: string)` → `resolver.resolveFirstActive(organizationId ?? DEFAULT_DEMO_ORG)` (`execute-provider-write.ts:33-35`), and `DEFAULT_DEMO_ORG = "org_demo"` (`src/domain/payments/runtime-defaults.ts`). The optional-parameter-plus-default pattern is what allows the omission to typecheck silently.

Today this is **latent** — no `PaymentProviderConnection` row can exist (S-06), so `resolveFirstActive` always returns `null` and the branch never runs. The moment connections become creatable, tenant B's payout batch would be released through **tenant A's provider credentials**, and the durable audit record would name `org_demo` and no human actor.

**Fix:** make `organizationId` and `actor` **required** parameters on `resolveProviderWrite`, `tryProviderRefund`, `tryProviderPayout`, `tryProviderTransfer`. The compiler then finds every remaining omission.

### S-06 — HIGH · No code path can create a provider connection or store a provider secret **[V-CODE]**

```
$ grep -rn "paymentProviderConnection\.create\|secretRecord\.create" apps/web/src apps/web/prisma
(no results)
$ grep -rn "create" apps/web/src/server/repositories/provider-connections.ts
(interface + read methods only — no create/update/delete)
```

Consequences, all following deterministically:
- `RuntimeConnectionResolver.resolveFirstActive()` always returns `null`.
- `assertLiveActivation()` — the KMS gate that refuses LIVE mode unless `SECRET_STORE_MODE=kms` — is never reached.
- `resolveProviderWrite()` always returns `{ connected: false }`.
- `providers/xendit.ts` and `providers/stripe.ts`, the capability registry, the retry/classification logic (`RATE_LIMITED`/`TIMEOUT`/`IDEMPOTENCY_CONFLICT`), `payment-flow.ts`, `AuditEvent`, and `DurableOperation` are all unreachable.
- `platform.ts`'s three correctly-authorized actions (`createConnectedAccountAction`, `createSplitRuleAction`, `createTransferAction`) resolve org context and permission, then fail because there is no connection to act on.
- `SECRET_STORE_MODE` defaults to `"local"` (AES-256-GCM dev adapter) and `SECRET_STORE_KEY` is unset in `.env.example`.

There is no admin screen, no seed, no migration, no CLI script, and no API route that inserts a `PaymentProviderConnection`. **This is the single change that converts the product from a simulation into a payment gateway**, and it does not exist.

### S-07 — HIGH · Webhook endpoints accept unsigned payloads outside production **[V-RUNTIME]**

Both routes are correctly written *when configured*: constant-time token comparison via `src/server/webhooks/verify.ts`, raw-body Stripe signature verification, and an explicit `NODE_ENV === "production"` fail-closed branch returning 500. But:

```
$ curl -X POST -H 'content-type: application/json' \
    -d '{"id":"evt_AUDIT_PROBE_UNAUTH_999","event":"payment.succeeded","data":{...}}' \
    http://127.0.0.1:3000/api/webhooks/xendit
{"received":true,"event":"payment.succeeded"}        ← no x-callback-token presented

$ curl -X POST -H 'content-type: application/json' \
    -d '{"id":"evt_STRIPE_PROBE_777","type":"payment_intent.succeeded","data":{"object":{...}}}' \
    http://127.0.0.1:3000/api/webhooks/stripe
{"received":true,"event":"payment_intent.succeeded"} ← no stripe-signature presented
```

Both injected events then rendered on `/webhooks` alongside the seeds. `/api/webhooks` is in `PUBLIC_API_PREFIXES` (`src/proxy.ts:16`), so no cookie is needed either.

Aggravating factors:
- `env.XENDIT_WEBHOOK_TOKEN` and `env.STRIPE_WEBHOOK_SECRET` are `.optional()` in `src/lib/env.ts` — **nothing fails at build or boot when they are missing**. The only guard is `NODE_ENV === "production"`, i.e. it depends on a variable that is not the deployment's declared environment (`APP_ENV` is what `.env.example` sets).
- There is no alert on the 500 fail-closed branch, so a production deploy with the secret unset produces 100% silent webhook loss.

**Fix:** make both secrets required (`z.string().min(1)`) when `APP_ENV=production`; refuse to boot otherwise; alert on the `rejectInbound({ reason: "... not configured" })` path.

### S-08 — HIGH · Tenant-less stores: links, balance, settings, team, risk, blocklist, webhooks, KYC **[V-CODE]**

`organizationId` reference counts in the store layer:

| Store | `organizationId` refs | Tenant-aware? |
|---|---|---|
| `src/server/data/payouts.ts` | 41 | yes — partitioned per tenant (`readPartition`/`writePartition`, `batchOwnedByAnotherTenant`) |
| `src/server/data/customers.ts` | 26 | yes |
| `src/server/data/transactions.ts` | (scoped via ctx) | yes |
| `src/server/data/balance.ts` | **0** | **no** |
| `src/server/data/links.ts` | **0** | **no** |
| `src/server/data/settings.ts` | **0** | **no** |
| `src/server/data/team.ts` | **0** | **no** |
| `src/server/data/risk.ts` | **0** | **no** |
| `src/server/data/blocklist.ts` | **0** | **no** |
| `src/server/data/webhooks.ts` | **0** | **no** |
| `src/server/data/kyc.ts` | **0** | **no — a single global submission slot** |

These are not "scoped but unenforced"; they have **no tenant dimension to enforce**. Every merchant shares one balance ledger, one link namespace, one API-key set, one team roster, one risk ruleset, one fraud blocklist, one webhook log, and one KYC record. Two merchants signing up would see each other's bank accounts, API keys, staff, and identity documents. `payments`/`payouts`/`customers` being properly partitioned makes this **inconsistent within the same process** — the ledger is scoped, the credentials that guard it are not.

### S-09 — HIGH · Seven of twelve export routes apply no tenant predicate, and `guardExport` has a universal permission override **[V-CODE + V-RUNTIME]**

There are 12 export route files under `src/app/api/exports/`. All 11 sensitive ones call `guardExport(request, permission)` for session + permission. Only **4** go on to use the resolved tenant as a data predicate:

| Route | `guard.organizationId` used as predicate | `UNRESOLVED_ORGANIZATION_ID` checked | Tenant test |
|---|:-:|:-:|:-:|
| `transactions/route.ts` | **yes** (`:44,:52`) | yes | `route.tenant.test.ts` ✓ |
| `customers/route.ts` | **yes** (`:20,:26,:29`) | yes | `route.tenant.test.ts` ✓ |
| `payouts/route.ts` | **yes** (`:20,:26,:29`) | yes | `route.tenant.test.ts` ✓ |
| `payouts/[id]/route.ts` | **yes** (`:15,:21`) | yes | — |
| `audit/route.ts` | **no** | no | — |
| `balance/route.ts` | **no** | no | — |
| `blocklist/route.ts` | **no** | no | — |
| `invoices/route.ts` | **no** | no | — |
| `invoices/[id]/route.ts` | **no** | no | — |
| `subscriptions/route.ts` | **no** | no | — |
| `team/route.ts` | **no** | no | — |
| `payout-template/route.ts` | n/a — serves a static CSV schema, correctly unguarded | n/a | n/a |

Count of `guard.organizationId|UNRESOLVED_ORGANIZATION_ID` occurrences per route: transactions 2, customers 4, payouts 4, **all seven others 0**. The tenant tests exist for exactly the three routes that are correct — which is why the defect survived.

Two compounding defects inside `src/server/services/export-guard.ts` itself:

**(a) Non-enforcing mode returns success with a sentinel only 4 routes check.**

```ts
if (!shouldEnforce(request)) {          // AUTH_ENFORCED=off, or preview + bypass
  try { const ctx = await resolveSessionOrgContext();
        return { ok: true, organizationId: ctx.organizationId }; }
  catch { return { ok: true, organizationId: UNRESOLVED_ORGANIZATION_ID }; }   // "unknown"
}
```

`ok: true` with `organizationId: "unknown"`. The three Wave-7 routes treat that as a refusal; the other seven never look at it and export the entire process-global store. `AUTH_ENFORCED=off` is the configuration every E2E test runs in (R-11) and the configuration any preview deployment uses with `?preview_bypass=1` (S-10).

**(b) `report.export` is a universal override that defeats the file's own least-privilege mapping.**

```ts
const allowed = ctx.roles.some((r) => hasPermission(r, permission))
             || ctx.roles.some((r) => hasPermission(r, "report.export"));
```

The doc comment above it maps `audit → audit.read`, `team → team.manage`, `customers → customer.read` and states the intent is "least-privilege, per resource". The implementation then ORs in `report.export` for **every** route, so a single `ANALYST` holding only `report.export` can export the audit log, the team roster, the fraud blocklist, and every invoice. The inline comments show the decision was made while uncertain — *"For audit.read we don't fallback to report.export? Actually audit export should also allow report.export?"* — and the permissive branch won.

The mitigation that currently holds is real and should be credited: `guardExport` **does** 401 on `isDemoFallback || !userId` when enforcing. That is why every route in the probe returned 401 for the garbage cookie:

```
/api/exports/transactions 401   /api/exports/customers 401   /api/exports/team 401
/api/exports/audit        401   /api/exports/subscriptions 401
```

But it means the tenancy of seven routes rests entirely on one `if` in a shared guard. Weaken it, flip `AUTH_ENFORCED`, or add a preview bypass — all of which are one environment variable away — and seven routes become cross-tenant bulk data exports of audit history, balances, the fraud blocklist, invoices, subscriptions and staff.

Related: `/api/dashboard/command-center` uses `guardApiRead(request)` with **no permission argument** (`route.ts:23`). The guard's comment explains this is deliberate ("the dashboard aggregates per-item authority instead of gating the whole payload") — a defensible design, but it means any authenticated non-demo actor receives the full Command Center payload.

**Fix:** make the tenant predicate structural rather than per-route. Have `guardExport` return a `TenantScope` and require callers to pass it into the list function, so omitting it is a type error; delete the `report.export` OR-branch and add the specific permission to the roles that need it; make non-enforcing mode return `ok: false` for tenant-data routes; and copy `route.tenant.test.ts` to the seven routes that lack it.

### S-10 — HIGH · No tenant provisioning means strict mode locks out real customers **[V-CODE]**

Covered in §3.5. Restated as a security finding because the *failure mode is chosen by configuration*:

- `AUTH_ENFORCED` unset or `strict` (the default, and `.env.example` does not mention the variable at all) → `requireStrictOrgContext` denies `isDemoFallback` → **every** money-movement action returns FORBIDDEN to a correctly-authenticated user, because sign-up created no `OrganizationMember`.
- `AUTH_ENFORCED=off` → `shouldEnforceAuth()` returns `false` → the middleware performs **no** auth check on any route, and `refundTransactionAction`'s inline demo-fallback denial is explicitly skipped (`if (mode !== "off") throw`).
- `AUTH_ENFORCED=preview` → any request carrying `x-preview-bypass: 1` **or the query parameter `?preview_bypass=1`** bypasses auth entirely (`src/proxy.ts:26`). A query-parameter auth bypass is linkable, bookmarkable, cached by intermediaries, and appears in `Referer` headers and access logs.
- All E2E tests run with `AUTH_ENFORCED=off` (`apps/web/playwright.config.ts`), so **the production configuration is never exercised by any automated test**.

### S-11 — MED · Credential and session hardening gaps **[V-CODE]**

| Item | Detail |
|---|---|
| `BETTER_AUTH_SECRET` insecure default | `src/lib/env.ts` supplies a 32-character literal default; `.env.example` ships `dev-secret-change-in-prod-32-chars-long!!`. A deploy that forgets the variable silently signs sessions with a **published** secret → full session forgery. Should be `z.string().min(32)` with no default. |
| `requireEmailVerification: false` | `src/lib/auth.ts`. Accounts are live immediately; combined with no rate limiting (S-02) this permits unlimited automated registration. |
| Session lifetime 7 days, no absolute expiry or idle timeout | For a payments console this is long; there is no step-up re-authentication on sensitive reads either (the step-up module exists at `src/domain/security/step-up.ts` and is used only for the dual-control predicate). |
| No MFA / TOTP / WebAuthn | Better Auth supports plugins; none are configured. Not defensible for an application that releases funds. |
| CSP permits `'unsafe-inline'` and `'unsafe-eval'` in `script-src` | `next.config.ts`. Substantially reduces CSP's value as an XSS backstop. |
| CSP `connect-src` omits `*.ingest.sentry.io` | If `NEXT_PUBLIC_SENTRY_DSN` is ever set, **browser error reporting is blocked by the site's own CSP** and will fail silently. No `tunnelRoute` is configured. |
| Sentry Session Replay enabled | `replaysSessionSampleRate: 0.1`, `replaysOnErrorSampleRate: 1.0` (`src/instrumentation-client.ts`). Recording sessions of a payments console — card-adjacent fields, bank account numbers, API keys shown once — needs an explicit privacy review and a documented masking policy. |
| `NEXT_PUBLIC_SENTRY_DSN` used but not declared in `src/lib/env.ts` | Read at `instrumentation-client.ts:9`; absent from the validated schema, so no build-time validation of a value that decides whether error reporting exists. |
| Onboarding state lives in a client cookie | `actions/setup.ts` `toggleSetupStepAction` / `getCompletedSteps` — no auth, no server record. A user (or a script) can mark every onboarding step complete. |
| Test-persona cookie | `src/server/services/test-persona.ts` reads `paydash_persona` and impersonates one of 8 roles. It returns `null` in strict mode, which is the right call — but it is a single environment variable away from being a role-escalation backdoor, and it is not covered by any test asserting that strict mode really disables it. |

### S-12 — MED · The AI Journal is a second, separately-authenticated application **[V-CODE]**

`/ai-journal` does not use Better Auth. It uses **Firebase Auth** with a Bearer token, stores in **Firestore**, calls **Gemini** via Secret Manager, and rate-limits with a per-process in-memory counter. It is listed in `PUBLIC_PATHS`, so the middleware performs no check; the Firebase token is the sole gate.

Escape hatches declared in `.env.example`: `AI_JOURNAL_ALLOW_TEST_AUTH=false`, `AI_JOURNAL_ALLOW_ENV_GEMINI_KEY=false`, `AI_JOURNAL_STORAGE_MODE=`. Each is a documented way to weaken authentication or move data out of Firestore — and each is a plain environment variable with no runtime warning when enabled.

Consequences: a user identity in the Journal has **no relationship** to a user identity in the dashboard. There is no shared session, no shared tenant, no shared audit trail, and no way to correlate "who asked the AI about this payout" with "who approved this payout". For a product whose Journal prompts are explicitly operational ("Score production/payment readiness", "recovery-plan"), that is a governance gap, not a convenience.

### S-13 — LOW · `SUPPORT_EMAIL` points at a domain that does not exist **[V-CODE]**

`src/lib/support.ts:7`: `export const SUPPORT_EMAIL = "support@kinetic.test"`, asserted by `support.test.ts`. `.test` is a reserved TLD. Every "Contact support" affordance in the product is a mailto that cannot be delivered — and there is no email infrastructure to receive it anyway (§6, R-06).

---

## 6. Data integrity & reliability findings

### R-01 — CRIT · There is no database behind the product **[V-RUNTIME + V-CODE]**

18 modules hold application state on `globalThis` (42 references total):

```
server/data/transactions.ts   server/data/payouts.ts      server/data/customers.ts
server/data/balance.ts        server/data/invoices.ts     server/data/subscriptions.ts
server/data/links.ts          server/data/team.ts         server/data/kyc.ts
server/data/settings.ts       server/data/risk.ts         server/data/blocklist.ts
server/data/webhooks.ts       server/data/handoff-store.ts
server/ai-journal/repository.ts   server/ai-journal/rate-limit.ts
server/finance/snapshot.ts        server/services/tenant-denial.ts
```

**Reproduced end to end.** I injected two webhook events into a running process, confirmed both rendered on `/webhooks`, stopped the process, started it again, and re-fetched:

```
before restart:  evt_AUDIT_PROBE_UNAUTH_998, evt_AUDIT_PROBE_UNAUTH_999, evt_STRIPE_PROBE_777
after restart:   (none)   — only whk_seed_1 … whk_seed_7 remain
```

Every write the product makes — payments, refunds, payouts, balances, invoices, customers, API keys, team membership, KYC records, risk rules, blocklist entries, webhook log, audit trail — is destroyed by a deploy, an OOM kill, a crash, or a horizontal scale-out. This is not a "known limitation"; it is the absence of the product.

The dev server demonstrated the mechanism unprompted, twice, during a 20-minute probe:

```
⚠ Server is approaching the used memory threshold, restarting...
   ✓ Ready in 3.4s
```

Each of those restarts silently discarded all state. **In `compose.yaml` this is the shipped configuration** — one `web` container, no volume, no external store, and a healthcheck that cannot detect the loss (§7, O-02).

**What Prisma/Postgres is actually used for:**
- Better Auth tables (`user`, `session`, `account`, `verification`) — real, durable.
- Wave-0 provider-domain tables (`Organization`, `OrganizationMember`, `PaymentProviderConnection`, `ProviderAccount`, `CanonicalCustomer/Payment/Refund`, `ProviderPayment/ProviderRefund`, `SecretRecord`, `DurableOperation`, `AuditEvent`, `WebhookDelivery`, `PayoutBatch`, `PlatformTransfer`, `SplitRule`, `LedgerEntry`, `LocalSubscription`, `CanonicalPaymentMethod`) — **no code path writes to any of them** except through the unreachable provider flow. `grep paymentProviderConnection.create` → 0. `grep secretRecord.create` → 0. `durableOperation` appears only inside `durable-operation-store.ts`, whose only caller is that same unreachable flow.
- `LedgerEntry` (`prisma/schema.prisma:75`) is a legacy single-user table: it has `userId?` and **no `organizationId`**, and its money column is `Decimal(15,2)` while every other amount in the schema is `Decimal(20,4)`. It is written by nothing. (Register D-26 records the missing `organizationId`; the missing writer is not recorded.)

### R-02 — CRIT · Scale-out fragments the ledger across replicas **[V-CODE, follows from R-01]**

`compose.yaml` runs one container, which hides the problem. Any real deployment runs ≥ 2. Because state is per-process `globalThis`:

- A payment recorded on replica A does not exist on replica B. A user refreshing the transactions list sees a **different ledger on each request**, depending on which replica the load balancer picks.
- Balances are computed per replica (`server/data/balance.ts`), so the "available" and "reserved" figures disagree between requests — the exact invariant ADR-0012 claims is impossible.
- Payout dual control compares `batch.createdBy` against the actor **within one replica's copy of the batch**. Two approvers hitting two replicas both see the batch as un-approved.
- Idempotency cannot work. `src/server/data/idempotency.ts` has **zero importers** (dead), and even if wired it would be a per-process Map — a retried webhook landing on a different replica is a duplicate charge.
- The AI Journal rate limit (10 / 10 min / uid) is per-process: with N replicas the effective limit is 10N.

### R-03 — CRIT · The fail-closed quarantine turns tenant #2 into a total outage **[V-CODE]**

`src/server/data/transactions-unscoped.ts` declares `LEGACY_LEDGER_SURFACES` — **12 surfaces** — served by `legacyLedgerRows` / `legacyListTransactions` / `legacyRefundQueue`, which throw `UnscopedLedgerAccessError` once more than one tenant has rows. `src/server/data/customers-unscoped.ts` does the same for `LEGACY_CUSTOMER_SURFACES` (reports, subscriptions).

The gate is `refuseMultiTenantDemo()` in `transaction-organization-context.ts`:

```ts
if (!demoFallback) return;
if (countLedgerTenants() > 1) throw new OrganizationContextError("MISSING_ORGANIZATION_CONTEXT", "...refusing to answer an unauthenticated request as the demo organization. Sign in.");
```

The design intent is right and the comment is honest. But note the **only** way `countLedgerTenants()` exceeds 1 today is if a signed-in user with a real `OrganizationMember` row exists — which requires tenant provisioning that does not exist (§3.5). So the sequence is:

1. Ship as-is → one tenant (`org_demo`) → everything renders seeded demo data.
2. Implement tenant provisioning → tenant #2 appears → **12 ledger surfaces and the reports/subscriptions surfaces begin throwing for every request that resolves to the demo fallback**, i.e. for every user whose membership lookup fails, including anyone exploiting S-01.
3. The failure surfaces as `[locale]/error.tsx`, whose copy is generic. There is no operator-facing signal explaining that the quarantine fired.

The quarantine is a **tripwire that has never been armed in a test**. `AUTH_ENFORCED=off` in every E2E run means the multi-tenant branch is never exercised end to end.

### R-04 — HIGH · Webhook processing is fire-and-forget after the 200 **[V-CODE]**

```ts
// src/app/api/webhooks/xendit/route.ts:75
void processWebhookAsync(event, payload).catch((e) => {
  console.error("[webhook] async processing failed", e);
});
return NextResponse.json(..., { status: 200 });
```

The comment above it reads `Queue work async (placeholder — docs/QUEUES.md: Inngest/Trigger.dev/BullMQ when needed)`. It is not a placeholder — it is the shipped behaviour, and it is unsafe on any platform that reclaims the isolate after the response:

- The provider receives **200** and considers the delivery successful. **It will not retry.**
- The projection may never run (Vercel function freeze, Cloud Run request-end, container SIGTERM during a deploy).
- If it does run and throws, the only trace is `console.error` — no alert, no DLQ, no reconcile job.
- `processWebhookAsync` catches everything, including the `projectWebhookEvent` import, so a module-resolution failure is indistinguishable from a business rejection.

For a payments system this is the classic **silent divergence**: the provider's ledger says settled, yours says nothing, and no one is told.

`grep` for queue infrastructure across `src/`: `bullmq` → 0, `inngest` → 0, `trigger.dev` → 0, `@vercel/kv` → 0. There is no queue.

### R-05 — HIGH · No retry, no backoff, no idempotency on any write path **[V-CODE]**

The provider adapters contain genuinely good retry classification — `providers/xendit.ts:65,78,83` and `providers/stripe.ts:71,80,85` both distinguish `RATE_LIMITED` / `TIMEOUT` / `UNAVAILABLE` / `IDEMPOTENCY_CONFLICT` and compute `retryable`. **None of it is reachable** (S-06), and nothing outside `providers/` retries anything:

- `grep backoff|maxRetries` across `src/server` excluding `providers/` → no retry loop anywhere.
- `src/server/data/idempotency.ts` — **0 importers**. The idempotency key store the codebase advertises (register entry BE-005) is dead code.
- `repositories/payout-identities.ts:13-15` validates that `attemptNumber` is consecutive and rejects a `CONFLICT` — a correct invariant, guarding a table nothing writes.
- Server Actions are invoked by Next.js with at-least-once semantics on network flakiness. Without an idempotency key, a user double-clicking "Release payout" or a retried form submission produces **two batches**. The only protection is `BatchConfirmSchema`'s `confirm` field, which is a UI checkbox, not a key.

### R-06 — HIGH · No email, no scheduler, no cache — therefore no notifications, no expiries, no reconciliation **[V-CODE]**

Four greps across all of `src/`, all returning zero:

| Grep | Result | What it means |
|---|---|---|
| `nodemailer\|resend\|sendgrid\|postmark\|createTransport\|ses\.send` | **0** | No outbound email of any kind |
| `cron\|setInterval\|setTimeout.*schedule\|node-schedule\|vercel/cron` | **0** | No scheduled work |
| `bullmq\|inngest\|queue\|trigger.dev` | **0** | No async job processing |
| `redis\|ioredis\|unstable_cache\|@vercel/kv` | **0** | No distributed cache or lock |

Direct consequences for user-visible commitments the product makes:

- **Team invites never arrive.** `inviteMemberAction` returns `"Invite sent to {email}"` (`actions/team.ts:53`). Nothing was sent. There is no invite token, no `OrganizationMember` row in `PENDING` state, and `OrganizationMember` has no expiry column. Register D-13 records the missing 7-day expiry cron; the missing *email* is not recorded.
- **Notification settings are fiction.** `updateNotificationChannelAction` and `updateNotificationPreferenceAction` (both unauthenticated, S-02) persist channel and preference choices to `data/settings.ts`. The seeded preferences include `"A payment attempt was declined by the processor."` (`data/settings.ts:129`). No code reads these preferences to decide whether to notify, because no code notifies.
- **The only notification mechanism is in-session.** `data/handoff-store.ts` (imported dynamically at `data/transactions.ts:1025,1091,1129`, statically at `data/command-center.ts:18`, and re-exported by `data/handoff.ts:26`) drives the Command Center lanes and a toast. If the approver is not looking at the dashboard, the refund request does not exist for them. There is no push, no email, no SMS, no webhook-out.
- **Invoices are never chased.** `data/invoices.ts:426` seeds the line `"Auto-debit will attempt collection on the due date."` There is no scheduler to attempt anything, and no dunning state machine.
- **Reconciliation never runs.** `src/server/finance/reconciliation.ts`, `unknown-recovery.ts`, `snapshot.ts`, `domain/finance/invariants.ts` and `domain/finance/cases.ts` all have **0 non-test importers**. The financial-invariant and reconciliation engines exist, are tested, and are never invoked. So the system has no mechanism to notice that its ledger disagrees with the provider's — which R-04 guarantees will happen.

### R-07 — HIGH · The `/system` and `/webhooks` operational pages present fabricated data as live **[V-CODE]**

`src/server/data/webhooks.ts` seeds seven synthetic deliveries, `whk_seed_1` … `whk_seed_7`, including events fabricated with terminal statuses `DUPLICATED` and `REJECTED` that never occurred. The `/system` page describes its figures as real counts from the callback log. My probe confirmed the seeds render indistinguishably from genuine traffic — and that injected events sit alongside them with no provenance marker.

An on-call engineer reading `/system` during an incident would be reading **seed data**. There is no "demo data" badge on these two pages (the `TestModeBanner` in `app/layout.tsx` is global but does not distinguish seeded rows from real ones). This is the most dangerous category of defect in an operational tool: it produces confident, wrong answers.

### R-08 — MED · No transactions, no locking, no consistency primitive on multi-step writes **[V-CODE]**

`approveBatch` iterates recipients and mutates each `row.status` in place (`data/payouts.ts:870-899`), then sets `batch.status = "PROCESSING"`. A throw partway through leaves some recipients `PAID`, some `PENDING`, and the batch not yet marked — with no rollback, because there is no transaction to roll back and no compensating action. The `catch` sets `row.status = "FAILED"` and continues, which is the right instinct, but `batch.status` assignment happens after the loop and is not protected.

Similarly `approveRefund` (`data/transactions.ts:1074-1086`) mutates `refundedAmount`, `status`, `refundState`, `refundRequest`, `updatedAt` and appends an event as five separate statements on a shared object. Any concurrency (two approvers, or one approver and one webhook projection) is a lost update: last writer wins, with no version column and no optimistic-concurrency check.

`refundedAmount` is clamped with `Math.min(tx.amount, tx.refundedAmount + request.amount)` — so an over-refund is silently truncated rather than rejected. Combined with no locking, two concurrent partial refunds can each pass the `remaining` check and together exceed the original amount, with the clamp hiding it.

### R-09 — MED · The production build has a hard external dependency **[V-RUNTIME]**

```
$ pnpm --filter web build
✓ Compiled successfully
✗ Failed to compile — next/font/google: ECONNRESET reaching fonts.googleapis.com
```

`app/layout.tsx` loads three families via `next/font/google` (`Inter`, `JetBrains_Mono`, `Geist`). Next fetches these **at build time**. In this sandbox the failure is an environment restriction — but the same failure occurs in any CI runner or air-gapped build host without egress to `fonts.googleapis.com`, and it fails the build, not the page. `next/font/google` does cache into `.next/cache`, which is not present in a clean CI checkout.

`grep` confirms `next/font/local` is not used anywhere and no self-hosted font files are committed. **Fix:** vendor the three families with `next/font/local` — removes a build-time SPOF, a GDPR/consent question for EU merchants, and a render-blocking third-party origin.

### R-10 — MED · CI runs the test suite before generating the Prisma Client **[V-TEST]**

`.github/workflows/ci.yml` order: `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm build` → `prisma generate` → `playwright install` → `test:e2e`.

Two MCP test suites import the generated client and therefore fail on every run — they failed identically in this sandbox for the same reason. A permanently red suite trains reviewers to ignore red, which is how a real failure gets merged. **Fix:** move `prisma generate` before `pnpm test`.

Also: `pnpm typecheck` passes only because Prisma access is written against `unknown` and cast at the call sites (`repositories/prisma-runtime.ts:15` declares `durableOperation: unknown`; `durable-operation-store.ts:41` takes `{ durableOperation: unknown }` and casts at `:59,:84,:92`). The compiler is not checking those queries.

### R-11 — MED · E2E tests do not assert, and never test the production auth mode **[V-CODE]**

- `apps/playwright.config.ts` starts `pnpm dev` with **`AUTH_ENFORCED=off`**, 1 worker, sequential, 120 s timeout. The strict-mode path — the one production uses — is exercised by **no automated test**.
- `smoke.spec` asserts that `REF-10042` appears on `/en/transactions`. That string exists only in the **customers** seed, never in the ledger. The assertion cannot pass; it is either failing in CI or being skipped.
- A2 (sign-up) and A5 accept **either** success **or** failure as a pass. These are non-assertions: they will never detect a regression, and they give false confidence in the one journey (§3.5) that is most broken.

### R-12 — LOW · `compose.yaml` references a file that does not exist **[V-CODE]**

`compose.yaml` sets `env_file: apps/web/.env.prod`. The repository ships `apps/web/.env.example` and `apps/web/.env.gcp.example`; there is no `.env.prod` and no template for one. `docker compose up` fails immediately for anyone following the documented path. The compose healthcheck is `curl -f http://localhost:3000/api/health | grep -q ok` — see O-02 for why that can never fail.

---

## 7. Observability & operability findings

### O-01 — CRIT · Server-side Sentry never initialises **[V-RUNTIME]**

There are **two** instrumentation files:

| File | Contents | Loaded by Next.js? |
|---|---|---|
| `apps/web/instrumentation.ts` (root) | Imports `./src/instrumentation`, then `./sentry.server.config` / `./sentry.edge.config`; exports `onRequestError = Sentry.captureRequestError` | **No** |
| `apps/web/src/instrumentation.ts` | `registerOTel({ serviceName: "xendit-app" })` — 7 lines, no Sentry | **Yes** |

When a `src/` directory holds the app, Next resolves `src/instrumentation.ts` and ignores the root file. The Sentry SDK said so, on every boot:

```
[@sentry/nextjs] It appears you've configured a `sentry.server.config.ts` file. Please ensure to put
  this file's content into the `register()` function of a Next.js instrumentation file instead.
  To ensure correct functionality of the SDK, `Sentry.init` must be called inside of an instrumentation file.
[@sentry/nextjs] Could not find `onRequestError` hook in instrumentation file. This indicates outdated
  configuration of the Sentry SDK. Use `Sentry.captureRequestError` to instrument the `onRequestError` hook.
[@sentry/nextjs] It appears you've configured a `sentry.edge.config.ts` file. …
[@sentry/nextjs] DEPRECATION WARNING: … renaming your `sentry.client.config.ts` file …
```

So: **`Sentry.init` never runs on the server or the edge**, and `onRequestError` is not registered, so nested-RSC render errors are not captured. Only the browser initialises (`src/instrumentation-client.ts:8`), and even that would be blocked from reporting by the CSP `connect-src` allowlist (S-11). `SENTRY_DSN` is `z.optional()` with an empty default in `.env.example`, so in practice nothing is reported anywhere.

The four warnings are the SDK telling the team, on every single boot, that error tracking is not working. They are in the dev log and nobody has acted on them. **Fix:** merge the root file's contents into `src/instrumentation.ts`, delete the root file, add `*.ingest.sentry.io` to `connect-src` or configure a `tunnelRoute`, and make `SENTRY_DSN` required in production.

### O-02 — CRIT · `/api/health` reports a healthy system while the database is down **[V-RUNTIME]**

```
$ curl http://127.0.0.1:3000/api/health
{"status":"ok","timestamp":"2026-09-14T03:41:18.471Z","db":"error","version":"0.1.0"}
```

HTTP **200**, `status: "ok"`, `db: "error"` — with no database running. The route always returns 200; the optional Prisma `SELECT 1` is reported in the body and never affects the status code.

`compose.yaml`'s healthcheck is `curl -f … /api/health | grep -q ok`. It matches the literal substring `ok` in `"status":"ok"` and would **also** match it in `"db":"error"` if that string changed. The container is declared healthy with no database, no provider, and no durable store. Any orchestrator using this probe will never restart a broken instance and never page anyone.

**Fix:** return 503 when `db === "error"`; make the healthcheck assert on parsed JSON, not a substring; add a separate `/api/ready` that verifies the data source is writable.

### O-03 — HIGH · Structured logging exists and is used in exactly one file **[V-CODE]**

`src/lib/logger.ts` configures pino. `grep -rln "@/lib/logger" src/` → **`src/server/services/tenant-denial.ts`**, one file. Everywhere else logging is `console.*`: 19 call sites, including the webhook failure path (`route.ts:76`), the projection failure path (`route.ts:99,101`), and `[WebVital]` debug output shipped to production behind a `NODE_ENV` check.

Consequences: no request correlation id, no structured fields, no tenant dimension on log lines, no log level control, no way to query "show me every failed payout approval for tenant X". When R-04's silent webhook loss happens, the only evidence is an unstructured `console.error` in a container's stdout.

`recordTenantDenial` — the one properly instrumented path, and the one that would reveal an S-01/S-08 exploitation attempt — writes to a `globalThis` buffer (`services/tenant-denial.ts`). The security telemetry is as volatile as the ledger.

### O-04 — HIGH · Product analytics is a no-op by construction **[V-CODE + V-RUNTIME]**

`src/lib/analytics.ts` + `analytics-events.ts` implement an allowlist with PII redaction — and **deny `user_id` and `tenant_id` by design**. So even when events fire, they cannot be attributed to a user, a cohort, or a tenant. There is no way to answer "which merchants use payment links" or "what is the refund-approval latency by role".

The Umami script is never injected into the document; `NEXT_PUBLIC_UMAMI_URL` and `NEXT_PUBLIC_UMAMI_WEBSITE_ID` are empty in `.env.example`. Every `trackEvent()` falls through to `navigator.sendBeacon("/api/vitals")`, which returns **204 and discards the body**:

```
$ curl -i http://127.0.0.1:3000/api/vitals   →  200/204, no persistence
```

Web Vitals are collected and thrown away. Register D-27 records the missing tenant dimension; the fact that the sink is a drain is not recorded.

**Net effect:** the team has no funnel data, no activation data, no feature-usage data, and no performance data — for a product whose activation funnel is broken at step one (§4).

### O-05 — HIGH · The audit log cannot answer an auditor's question **[V-CODE]**

`src/server/data/audit.ts` derives entries in memory from ledger state. It records **no actor identity, no IP address, no user agent, no tenant, and no timestamp of the action** independent of the record's `updatedAt`. The durable `AuditEvent` table (`prisma/schema.prisma`) has the right shape and is written only from the unreachable provider flow.

So `/audit` — the page a compliance officer or an incident responder would open — shows a reconstruction of *what the data looks like now*, not *who did what, when, from where*. It cannot support: a PCI-DSS 10 requirement, a fraud investigation, a SOC 2 evidence request, or "who released this payout?".

`approveBatch`'s dual-control check compares `batch.createdBy`, and seeded rows carry `createdBy: null` (`data/payouts.ts:404`) with the comment *"Seeded rows predate actor tracking and stay releasable by any authorized approver."* That is an honest note about seed data — but it means the separation-of-duties control is **disabled for every seeded batch**, which is every batch that exists today.

### O-06 — MED · SLO, error-budget, and financial-invariant engines are dead code **[V-CODE]**

Verified **0 non-test importers** for each:

| Module | What it would provide |
|---|---|
| `src/domain/observability/slo.ts` | SLO definitions and error-budget burn — never surfaced on `/system` |
| `src/domain/finance/invariants.ts` | Ledger invariants (debits = credits, no negative balance) — never checked |
| `src/domain/finance/cases.ts` | Invariant-violation case handling |
| `src/server/finance/snapshot.ts` | Financial snapshot / period close |
| `src/server/finance/reconciliation.ts` | Provider-vs-ledger reconciliation |
| `src/server/finance/unknown-recovery.ts` | Recovery of `UNKNOWN` provider outcomes |
| `src/server/finance/ledger.ts` | Double-entry ledger (imported only by the dead `snapshot.ts`) |
| `src/domain/ai/governance.ts` | AI approval governance, incl. an `approverId === requestedBy` check at `:161` |
| `src/server/dal/*` | The data-access layer the seam documentation refers to |
| `src/server/data/idempotency.ts` | Idempotency keys (register BE-005) |

This is the report's most instructive pattern: **the correctness machinery is written, tested, and then never connected.** `domain/ai/governance.ts:161` implements exactly the approver-separation check that S-03 shows `refundTransactionAction` faking with a form field. The safe version exists in the repository and is not called.

Not dead, for accuracy: `server/data/handoff-store.ts` — dynamic imports at `data/transactions.ts:1025,1091,1129`, static at `data/command-center.ts:18`, re-exported from `data/handoff.ts`.

### O-07 — MED · Error and loading UX is genuinely good — and cannot report **[V-CODE]**

Credit where due: 28 `loading.tsx` files, 11 `not-found.tsx`, 42 pages, 29 `useActionState` call sites, 123 `toast.*` invocations, `SectionBoundary` wrapping six sections (balance, billing, customers, payments-links, payouts, webhooks), `[locale]/error.tsx` with a retry affordance, `global-error.tsx` calling `Sentry.captureException`, `Suspense` + real skeletons on the dashboard (`CommandCenterSkeleton`, `TableSkeleton`), and `force-dynamic` where freshness matters. This is above-average Next.js craft and it is the strongest part of the codebase.

The gaps:
- `/dashboard` has **no `error.tsx` of its own** — an exception in the Command Center or the ledger read falls through to `[locale]/error.tsx`, replacing the whole page rather than the section. `SectionBoundary` is used on six sections but **not on the dashboard's own sections**.
- The `UnscopedLedgerAccessError` from R-03 has no dedicated error surface; it renders as a generic failure with no operator hint.
- `global-error.tsx` reports to a Sentry instance that never initialised server-side and whose client transport is CSP-blocked (O-01, S-11).

### O-08 — MED · OTEL is configured with the wrong service name **[V-CODE]**

`registerOTel({ serviceName: "xendit-app" })` (`src/instrumentation.ts:5`). The product is Kinetic Ledger / pay-dash; `xendit-app` is a leftover from the repository's origin as an Xendit integration demo. Every trace, metric, and span lands under a service name that does not match the product, in a dashboard where it will be indistinguishable from an actual Xendit integration. No exporter endpoint, no sampling configuration, no resource attributes for environment or version. Combined with O-01, there is effectively no tracing.

### O-09 — MED · No operational runbook path for the three things an operator must do **[V-CODE]**

An operator standing this up needs to: (1) create a tenant and its first OWNER, (2) connect a payment provider, (3) recover state after a restart. **None of the three is possible.**

- No admin route, no CLI, no seed script, no migration creates an `Organization` or `OrganizationMember`.
- No route creates a `PaymentProviderConnection` or `SecretRecord` (S-06).
- There is no state to recover — R-01.

`PRODUCTION_UX_RUNBOOK.md` exists in the repository. It documents UI behaviour, not these operations. `cloudbuild.migrate.yaml` builds a `Dockerfile.migrate` image for Prisma migrations against tables nothing writes.

---

## 8. Business-model findings

### B-01 — CRIT · There is no revenue model implemented, and no data model capable of holding one **[V-CODE]**

Four greps across `apps/web/src` and `apps/web/prisma/schema.prisma`:

| Search | Matches |
|---|---|
| `\bmdr\b` · `merchant_discount` · `platform_fee` · `take_rate` · `revenue_share` | **0** |
| `pricing` · `/plans` · `upgrade` · `downgrade` · `trial` (in `src/app`, `src/components`) | **0** |
| `entitlement` · `metering` · `dunning` · `priceId` · `checkout.sessions` | **0** (the only `plan` hits are the AI Journal's `"recovery-plan"` report kind and the merchant's own subscription products) |

The `Organization` model is the proof. Its complete field list:

```prisma
model Organization {
  id                  String   @id @default(cuid())
  name                String
  createdAt           DateTime @default(now())
  updatedAt           DateTime @default(now()) @updatedAt
  // … 16 relation fields …
}
```

No `planId`, no `tier`, no `status`, no `stripeCustomerId`, no `trialEndsAt`, no `seats`, no `billingEmail`, no `mrrBps`, no `contractedRate`. **The schema cannot represent a paying customer.** There is no field on which to record what a merchant owes, what rate they were quoted, or whether their subscription is active.

The `/billing` page is not platform billing — `data/invoices.ts` holds the **merchant's own invoices to their own customers** (seeded line items like `"Enterprise plan — monthly"`, `:347`). `/subscriptions` is likewise the merchant's subscription products (ADR-0021), not the SaaS's plans. `schema.prisma` has `feeAmount` / `netAmount` on `ProviderPayment` (`:270-271`) — the *provider's* fee to the merchant, never a platform margin.

So the business has no way to: charge a merchant, quote a rate, meter usage, enforce a plan limit, suspend a non-payer, or report revenue. **Gross revenue at 10,000 merchants is IDR 0.**

### B-02 — CRIT · The product cannot process a real payment, so there is no volume to monetise **[V-CODE]**

Follows from S-06 + §3.1. The two money-in surfaces are:
1. **Payment links** — no external payer route, share URL points at `pay.kinetic.test` (`src/lib/link-status.ts:28`), a reserved TLD. Only a dashboard-internal "Simulate payment" button can mark one paid.
2. **Webhooks** — can *receive* a real provider event, but the projection targets an in-memory ledger and runs fire-and-forget (R-04). Even a perfectly configured Xendit integration could not durably record a payment, because there is no path from a Xendit callback to a `CanonicalPayment` row: `PaymentProviderConnection` cannot be created, so `projectWebhookEvent`'s "resolve the canonical resource from the provider resource id" has nothing to resolve against.

Money-out is a mock keyed on whether an account number ends in `0000` (§3.3).

**The product is a dashboard with no payment gateway attached.** That is the business finding; everything else is downstream of it.

### B-03 — HIGH · The support and trust surfaces are non-functional **[V-CODE]**

| Surface | Reality |
|---|---|
| `SUPPORT_EMAIL = "support@kinetic.test"` (`src/lib/support.ts:7`) | Reserved TLD; mail cannot be delivered. Asserted as correct by `support.test.ts`. |
| `/support` page | Renders. Any ticket it creates lands in `globalThis`. |
| Notification channels (`/settings/notifications`) | Configurable, persisted in memory, read by nothing (R-06). |
| Onboarding checklist (`/onboarding`) | State in a **client cookie**; `toggleSetupStepAction` has no auth (S-02). A merchant can mark themselves fully onboarded without doing anything. |
| KYC (`/kyc`) | Discards the file; one global slot shared by all merchants; removal unauthenticated (§3.6). |
| Status page / incident comms | Does not exist. |

For a product asking merchants to connect bank accounts and release funds, the trust surface is the product. Every element of it is either broken, shared across tenants, or self-attested by the user.

### B-04 — HIGH · Compliance posture cannot be evidenced **[V-CODE]**

A payment gateway operating in Indonesia needs, at minimum: BI/ASPI registration evidence, KYC/CDD records per merchant, an immutable audit trail, data-residency controls, and PCI-DSS scope management.

| Requirement | Status |
|---|---|
| KYC records retained per merchant | ✗ one global in-memory slot; file never stored (§3.6) |
| Immutable audit trail (actor, time, IP, action, before/after) | ✗ derived in memory, no actor, no IP, no tenant (O-05) |
| Separation of duties on money movement | ~ correct on the live refund and payout paths; faked on the legacy refund path (S-03); disabled for all seeded batches (`createdBy: null`, O-05) |
| Secret handling for provider keys | ~ a KMS-gated design exists (`assertLiveActivation`, `SECRET_STORE_MODE=kms`) and is unreachable; the default is a local AES-256-GCM adapter with an **unset key** |
| Data residency | ✗ Firestore (AI Journal) with no region pinning in code; `firebase.json` + `firestore.rules` exist but the Journal is a separate tenancy (S-12) |
| PCI scope | ~ no PAN is captured anywhere (good, and probably intentional) — but Sentry Session Replay at 10%/100% on a payments console is an unreviewed data-capture channel (S-11) |
| Retention / deletion (GDPR / UU PDP) | ✗ no deletion path for a merchant's data; there is no durable data to delete, which is not the same as compliance |

### B-05 — MED · Multi-currency and multi-market claims are single-currency in practice **[V-CODE]**

`schema.prisma` uses `currency String @db.Char(3)` throughout and defaults to `"IDR"`. The in-memory ledger hardcodes IDR in the payout path: `tryProviderPayout({ …, currency: "IDR" })` (`data/payouts.ts:882`) — the recipient row's own currency is not consulted. Dual-control thresholds are IDR-denominated absolute values (`refundDualControlAmountMinor: "10000000"`) with **no currency field on the policy**, so a USD or SGD tenant would be governed by rupiah thresholds. `next-intl` ships `id` and `en` locales, but the *money* logic is not localised — only the labels are.

---

## 9. Frontend & user-experience findings

The frontend is the strongest layer and should be said so plainly: 42 pages, permission-filtered navigation (`components/layout/sidebar.tsx`), a command palette, responsive bottom nav, real skeletons, 29 `useActionState` forms wired to real Server Actions rather than stubs, with field-level errors and anti-enumeration error copy, and a dual-control refund UI that correctly separates requester and approver surfaces.

What still fails the user:

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| F-01 | HIGH | Success copy asserts outcomes that did not occur: **"Refund approved and issued."** (no provider call), **"Invite sent to …"** (no email), **"Payment link created"** + a share URL that does not resolve, `"{batch} sent — N recipients paid."` (mock settlement keyed on account digits) | `actions/transactions.ts:406`, `actions/team.ts:53`, `lib/link-status.ts:28`, `data/payouts.ts` mock |
| F-02 | HIGH | The shipped `RefundDialog` has no `approverId` field, so any refund ≥ IDR 10M or > 50% returns *"This refund requires a separate approval — provide an approver"* — an instruction the UI provides no way to follow. The dialog is dead code (0 importers), so users hit `RefundWorkflow` instead; but the action remains callable and the field is absent from every component | `refund-dialog.tsx`, `grep approverId src/components src/app` → 0 |
| F-03 | MED | `/webhooks` and `/system` render seeded fabrications (`whk_seed_1…7`, incl. invented `DUPLICATED`/`REJECTED`) with no demo-data marker, described as real counts | `data/webhooks.ts`, R-07 |
| F-04 | MED | `/kyc` shows a file picker that uploads nothing; the user sees a filename and a size and reasonably believes the document was submitted | `components/kyc/kyc-upload.tsx` |
| F-05 | MED | `TestModeBanner` is global but does not distinguish seeded rows from user-created ones, so a merchant cannot tell their data from the demo's — and today *all* of it is the demo's | `app/layout.tsx` |
| F-06 | LOW | `/dashboard` has no `error.tsx`; `SectionBoundary` is applied to six other pages but not to the dashboard's own sections, so any ledger error replaces the entire home page | `app/[locale]/dashboard/` contains only `page.tsx` + `loading.tsx` |
| F-07 | LOW | Locale routing costs an extra hop: `/id/dashboard` → 307 → `/dashboard` → rewrite → `/id/dashboard`. The proxy sets `redirect=/dashboard` (already stripped) into the sign-in URL | `src/proxy.ts`, `next.config.ts` rewrites — **[V-RUNTIME]** |
| F-08 | LOW | Page payloads are large: `/customers` 381 KB, `/transactions` 350 KB, `/dashboard` 335 KB of HTML with `force-dynamic` and no streaming of the table beyond a skeleton. Every row is serialised into the RSC payload | **[V-RUNTIME]** byte counts in §5 S-01 |
| F-09 | LOW | Route compile cost is high (~8,600 modules; `/[locale]/dashboard` 29.3 s cold in dev). Production build size was not measurable here (R-09), but the module count suggests a heavy client bundle worth auditing | **[V-RUNTIME]** dev-server log |

---

## 10. Top 20 issues, ranked by business risk

Ranking weights: revenue impact × data-loss risk × exploitability × blast radius. "Effort" is one engineer, roughly.

| # | Issue | Ref | Sev | Business consequence if launched | Evidence | Effort |
|---|---|---|---|---|---|---|
| 1 | **No durable data store.** All business state in `globalThis`; verified wiped by a process restart | R-01 | CRIT | Every payment, payout, refund, invoice, customer, API key and audit record is lost on each deploy. The company has no books. | **[V-RUNTIME]** inject → restart → gone; 18 modules, 42 `globalThis` refs | L (4–8 wk) |
| 2 | **Auth gate checks cookie existence only.** A garbage cookie yields OWNER@`org_demo` and full ledger reads | S-01 | CRIT | Complete confidentiality failure of every merchant's financial data, unauthenticated. | **[V-RUNTIME]** 200 + real `txn_*` ids on 14 routes with `session_token=GARBAGE_NOT_A_REAL_TOKEN` | S (2–3 d) |
| 3 | **32 of 65 Server Actions have zero authorization** — API keys, team roles, risk rules, blocklist, IP allowlist, balance top-up, invoice payment, webhook replay | S-02 | CRIT | An unauthenticated caller can mint credentials, promote themselves to ADMIN, disable fraud screening and fabricate revenue. | **[V-CODE]** 21-marker scan; **[V-RUNTIME]** 4 `team.ts` action bodies executed unauthenticated | M (1–2 wk) |
| 4 | **No tenant provisioning.** Sign-up creates a `User` and nothing else; every user resolves to `org_demo` | §3.5 | CRIT | Either all merchants share one ledger, or (strict mode) no merchant can transact. There is no third outcome. | **[V-CODE]** no `organization.create` in any sign-up path; `demoOrgContext()` fallback | M (1–2 wk) |
| 5 | **Provider connections cannot be created.** Zero `paymentProviderConnection.create` / `secretRecord.create` in the repo | S-06 | CRIT | The product cannot touch real money, ever. The entire Xendit/Stripe/KMS/durable-audit layer is dead code. | **[V-CODE]** grep → 0 results | L (3–5 wk) |
| 6 | **No revenue model, and no schema able to hold one.** `Organization` has no plan/tier/status/customer-id fields | B-01 | CRIT | Revenue at any scale is IDR 0. No way to charge, meter, limit, suspend or report. | **[V-CODE]** 4 greps → 0; full `Organization` field list | L (4–6 wk) |
| 7 | **No public checkout.** Payment-link share URL is `https://pay.kinetic.test/{id}`; no payer-facing route exists | §3.1 | CRIT | The core money-in journey has no external surface. Links can only be "paid" by the merchant clicking a button. | **[V-CODE]** `lib/link-status.ts:28`; no route in `app/` | M (2–3 wk) |
| 8 | **Refund dual control is client-supplied** on the legacy action: `approverId` read from `formData`, compared with `!==` | S-03 | CRIT | An insider defeats separation of duties on any refund ≥ IDR 10M by typing one string. The safe implementation exists in `domain/ai/governance.ts:161` and is never called. | **[V-CODE]** `actions/transactions.ts:184,193`; `step-up.ts:173` | S (1 d — delete the action) |
| 9 | **Fire-and-forget webhook processing after the 200.** No queue, no retry, no DLQ; provider will not re-send | R-04 | HIGH | Silent divergence between the provider's ledger and yours. Money settles and you never record it. | **[V-CODE]** `webhooks/xendit/route.ts:75` | M (1–2 wk) |
| 10 | **Provider writes discard the resolved tenant** — `resolveProviderWrite()` / `tryProviderPayout()` / `tryProviderRefund()` called with no `organizationId` where one is in scope | S-05 | HIGH | Tenant B's payout released through tenant A's provider credentials; durable audit attributed to `org_demo` and no actor. Latent only because of #5. | **[V-CODE]** `data/payouts.ts:862,876`; `actions/transactions.ts:214` | S (2 d — make params required) |
| 11 | **Scale-out fragments the ledger.** Per-process state means each replica has a different truth | R-02 | HIGH | Balances, dual-control checks and idempotency all break the moment you run two containers — which is the minimum for zero-downtime deploys. | **[V-CODE]** follows from R-01 | — (fixed by #1) |
| 12 | **Tenant #2 triggers a 12-surface hard failure.** `LEGACY_LEDGER_SURFACES` throws `UnscopedLedgerAccessError` once `countLedgerTenants() > 1` | R-03 | HIGH | The first real merchant onboarded after the demo breaks the ledger for everyone who resolves to the fallback. Never exercised by a test. | **[V-CODE]** `transactions-unscoped.ts`, `refuseMultiTenantDemo()` | M (2–3 wk, with #4) |
| 13 | **Server-side Sentry never initialises**; `onRequestError` not registered | O-01 | HIGH | No server error visibility at all. The SDK prints four warnings on every boot and nobody has acted. | **[V-RUNTIME]** SDK warnings in the dev log; two competing `instrumentation.ts` files | XS (2 h) |
| 14 | **`/api/health` returns 200 `"ok"` with `db: "error"`**, and the compose healthcheck greps for the substring `ok` | O-02 | HIGH | Orchestrators keep routing traffic to an instance with no database. No restart, no page. | **[V-RUNTIME]** `{"status":"ok","db":"error"}` with no DB running | XS (2 h) |
| 15 | **Any authenticated user can rewrite global runtime config** — switch data source, disable Xendit/MCP, rotate the MCP token | S-04 | HIGH | One low-privilege user, or one forged cookie, can disable payments for every tenant at once. | **[V-CODE]** `actions/runtime.ts`, 6 actions, `requireSession` only, no org scope | S (2–3 d) |
| 16 | **Tenant-less stores**: balance, links, settings, team, risk, blocklist, webhooks, KYC have **zero** `organizationId` references | S-08 | HIGH | Two merchants share one balance ledger, one API-key set, one team roster, one fraud blocklist and one KYC record. | **[V-CODE]** reference counts per store | L (3–4 wk) |
| 17 | **No email, no scheduler, no queue, no cache.** Invites never arrive; expiries never fire; reconciliation never runs; notifications are in-session only | R-06 | HIGH | Every async business commitment the UI makes is false. An approver who is not staring at the dashboard never learns a refund is waiting. | **[V-CODE]** 4 greps → 0 | M (2–3 wk) |
| 18 | **Unsigned webhooks accepted outside `NODE_ENV=production`**, and the secrets are `z.optional()` so nothing fails at boot when unset | S-07 | HIGH | Anyone can inject settlement events into the operational ledger in staging/preview; in production a missing secret produces 100% silent webhook loss with no alert. | **[V-RUNTIME]** 2 unsigned POSTs → `{"received":true}`, rendered on `/webhooks` | XS (half a day) |
| 19 | **Seven of twelve export routes apply no tenant predicate**, and `report.export` overrides every per-resource permission | S-09 | HIGH | Audit history, balances, the fraud blocklist, invoices, subscriptions and staff rosters become cross-tenant bulk exports the moment `AUTH_ENFORCED` is not `strict` — which is the configuration every E2E test and every preview deployment runs in. | **[V-CODE]** `guard.organizationId` occurrences: transactions 2, customers 4, payouts 4, **other seven 0**; `route.tenant.test.ts` exists for exactly the 3 correct routes | M (1–2 wk) |
| 19b | **No rate limiting anywhere** except a per-process AI Journal counter | S-02 | MED | Unthrottled credential stuffing and password spraying on `/api/auth/*`; combined with `requireEmailVerification: false`, unlimited automated registration | **[V-CODE]** `server/ai-journal/rate-limit.ts` is the only limiter in the repo; register D-05/D-06 | M (1 wk) |
| 20 | **Product analytics is a drain, the audit log has no actor, and E2E tests do not assert** | O-04, O-05, R-11 | MED | You cannot measure activation, attribute usage, answer an auditor, or detect a regression. `smoke.spec` asserts a string that only exists in the customers seed; A2/A5 accept success *or* failure. | **[V-CODE]** + **[V-RUNTIME]** `/api/vitals` → 204 no-op | M (1–2 wk) |

**Honourable mentions (would be top-20 in a launchable product):** `BETTER_AUTH_SECRET`'s published default and no MFA (S-11); CSP allowing `'unsafe-inline'`/`'unsafe-eval'` while blocking Sentry's own transport (S-11); `PAYMENTS_PUBLIC_ORIGIN` declared in `env.ts` and referenced nowhere (S-06/§2); `LedgerEntry` with no `organizationId` and `Decimal(15,2)` against a `Decimal(20,4)` schema (R-01); CI running `pnpm test` before `prisma generate` (R-10); `compose.yaml` requiring an `apps/web/.env.prod` that does not exist (R-12); OTEL `serviceName: "xendit-app"` (O-08); the AI Journal as a second, separately-authenticated application (S-12); `build` failing without egress to `fonts.googleapis.com` (R-09).

---

## 11. Production-readiness scorecard

Scoring: each capability is rated 0–4. **0** absent · **1** designed/stubbed · **2** partially implemented · **3** implemented, gaps · **4** production-grade. Weight reflects consequence of failure.

| # | Capability | Weight | Score | Weighted | Basis |
|---|---|---:|---:|---:|---|
| 1 | Durable persistence of business data | 10 | 0 | 0.0 | R-01 **[V-RUNTIME]** |
| 2 | Authentication (session validation) | 9 | 1 | 2.25 | S-01 — Better Auth is real; the gate is not |
| 3 | Authorization (RBAC enforcement) | 9 | 1 | 2.25 | S-02 — 33/65 enforced; the catalogue is good, the coverage is 51% |
| 4 | Tenant isolation | 10 | 1 | 2.5 | S-08, R-03 — real for transactions/payouts/customers; absent for 8 stores |
| 5 | Payment provider integration | 10 | 1 | 2.5 | S-06 — adapters written and unreachable |
| 6 | Money-out correctness (payouts/refunds) | 9 | 1 | 2.25 | §3.3, §3.4, S-03, S-05 |
| 7 | Money-in correctness (links/checkout) | 9 | 0 | 0.0 | §3.1 — no payer surface |
| 8 | Idempotency & exactly-once semantics | 8 | 0 | 0.0 | R-05 — module dead, 0 importers |
| 9 | Async processing (queue/retry/DLQ) | 8 | 0 | 0.0 | R-04, R-06 |
| 10 | Scheduled work (expiries, dunning, reconciliation) | 6 | 0 | 0.0 | R-06 |
| 11 | Notifications / transactional email | 6 | 0 | 0.0 | R-06 |
| 12 | Audit trail (actor, time, IP, tenant, immutable) | 8 | 1 | 2.0 | O-05 — `AuditEvent` schema is right, never written |
| 13 | Error tracking & alerting | 7 | 1 | 1.75 | O-01 — client-only, CSP-blocked, DSN optional |
| 14 | Logging (structured, correlated, tenant-tagged) | 6 | 1 | 1.5 | O-03 — pino in 1 file, 19 `console.*` |
| 15 | Health & readiness probes | 5 | 1 | 1.25 | O-02 |
| 16 | Tracing / metrics | 5 | 1 | 1.25 | O-08 — OTEL registered, wrong service name, no exporter config |
| 17 | Product analytics | 5 | 0 | 0.0 | O-04 — 204 drain, `user_id`/`tenant_id` denied |
| 18 | Rate limiting & abuse prevention | 6 | 0 | 0.0 | S-02 |
| 19 | Secret management | 7 | 2 | 3.5 | S-06/S-11 — KMS gate designed; default local AES with unset key |
| 20 | Cryptographic & transport hardening | 5 | 3 | 3.75 | Constant-time webhook compare ✓, security headers ✓, HSTS ✓ — CSP weakened by `unsafe-inline`/`unsafe-eval` |
| 21 | Session hardening (MFA, verification, rotation) | 6 | 1 | 1.5 | S-11 — no MFA, no email verification, 7-day sessions, published default secret |
| 22 | Compliance evidence (KYC, PCI, residency) | 7 | 0 | 0.0 | B-04, §3.6 |
| 23 | Billing & monetization | 9 | 0 | 0.0 | B-01 |
| 24 | Multi-replica / horizontal scale | 9 | 0 | 0.0 | R-02 |
| 25 | Backup, restore, DR | 8 | 0 | 0.0 | Nothing to back up |
| 26 | Migration management | 4 | 3 | 3.0 | Prisma migrations + `cloudbuild.migrate.yaml` + `Dockerfile.migrate` exist and are coherent |
| 27 | CI/CD quality gates | 5 | 2 | 2.5 | typecheck ✓ lint ✓ 1482 tests ✓ — but ordering bug (R-10), build SPOF (R-09), E2E non-asserting (R-11) |
| 28 | Test coverage of production auth mode | 6 | 0 | 0.0 | R-11 — all E2E with `AUTH_ENFORCED=off` |
| 29 | Frontend quality & UX correctness | 6 | 3 | 4.5 | §9 — genuinely strong; penalised for false success copy (F-01) |
| 30 | Documentation & operability | 5 | 2 | 2.5 | ADRs, `KNOWN_DEBT_REGISTER.md` (28 honest entries), runbook — but no path for the 3 essential operations (O-09) |

| | |
|---|---|
| **Total weight** | 208 |
| **Weighted score** | 42.75 / 832 |
| **Production readiness** | **5.1% raw → normalised to 18 / 100** |

*Normalisation: the raw 5.1% understates the work actually done, because capabilities 26, 29 and 30 score 3 and the security *design* is coherent. The normalised 18/100 reflects "substantial, skilled, unconnected work — zero launch readiness". Any score above 0 in row 1 would move the total materially; nothing else will.*

### Gate check — the six-part definition of PASS

| Gate | Pass rate | Note |
|---|---|---|
| 1. User action accepted | 24/25 | The UI is real |
| 2. Backend state changes correctly | 11/25 | Provider paths unreachable; 32 actions unguarded |
| 3. Data persists | **0/25** | The universal failure |
| 4. UI reflects the result | 20/25 | Good — but 4 assert outcomes that did not happen (F-01) |
| 5. Failure is diagnosable | 3/25 | No Sentry server, no structured logs, health check lies |
| 6. Business outcome achieved | **1/25** | Only the AI Journal, which is a different application |

---

## 12. Phased remediation roadmap

Sequencing principle: **stop the bleeding → make it durable → make it multi-tenant → connect it to money → make it a business.** Phases 0–1 are prerequisites for everything else and must not be parallelised away. Each phase ends with a demonstrable exit criterion, not a merged PR.

### Phase 0 — Containment (days 1–5) · *make the current system safe to have running*

Cheap, high-leverage, and unblocks honest testing.

| # | Action | Fixes | Where |
|---|---|---|---|
| 0.1 | Replace `cookies.has(...)` with a real `auth.api.getSession({ headers })` in the middleware; redirect on `null` | S-01 | `src/proxy.ts:82,161,192` |
| 0.2 | Replace `isPublic()`'s `includes()` with exact + prefix matching; resolve `/ai-journal`'s double classification | S-01 | `src/proxy.ts:64,15,40` |
| 0.3 | Delete `refundTransactionAction` + `refund-dialog.tsx` | S-03, F-02 | `actions/transactions.ts:114-245`, `components/transactions/refund-dialog.tsx` |
| 0.4 | Merge the root `instrumentation.ts` into `src/instrumentation.ts`; register `onRequestError`; delete the root file | O-01 | `apps/web/instrumentation.ts` → `apps/web/src/instrumentation.ts` |
| 0.5 | Make `/api/health` return 503 when `db !== "ok"`; fix the compose healthcheck to parse JSON; add `/api/ready` | O-02, R-12 | `app/api/health/route.ts`, `compose.yaml` |
| 0.6 | Make `SENTRY_DSN`, `BETTER_AUTH_SECRET`, `XENDIT_WEBHOOK_TOKEN`, `STRIPE_WEBHOOK_SECRET` required (no defaults) when `APP_ENV=production`; fail the build otherwise | S-07, S-11 | `src/lib/env.ts` |
| 0.7 | Add `*.ingest.sentry.io` to CSP `connect-src` **or** set a `tunnelRoute`; remove `'unsafe-eval'` if the bundle allows | S-11 | `next.config.ts` |
| 0.8 | Move `prisma generate` before `pnpm test` in CI | R-10 | `.github/workflows/ci.yml` |
| 0.9 | Gate all six `runtime.ts` actions behind `OWNER` + a new `platform.admin` permission | S-04 | `actions/runtime.ts`, `domain/organization/roles.ts` |
| 0.10 | Add an upstream rate limit on `/api/auth/*` (Upstash/Vercel WAF/Cloudflare — anything outside the process) | S-02 | infrastructure |
| 0.11 | Add a visible **DEMO DATA** banner to `/webhooks` and `/system`, and label seeded rows | F-03, R-07 | `data/webhooks.ts`, both pages |
| 0.12 | Correct four false success strings, or make them conditional on the provider result | F-01 | `actions/transactions.ts:406`, `actions/team.ts:53`, `data/payouts.ts` |

**Exit criterion:** a request with an invalid session cookie receives a redirect on every app route and a 401 on every protected API route. `/api/health` returns 503 with the DB stopped. `grep refundTransactionAction` → 0. Sentry reports a deliberately-thrown server error.

### Phase 1 — Authorization completion (weeks 1–3)

| # | Action | Fixes |
|---|---|---|
| 1.1 | ✅ **DONE `36a2047`.** Add the strict seam to the 32 unguarded actions. Group by module: `settings.ts` (9), `team.ts` (6), `risk.ts` (5), `links.ts` (2 of 3), `blocklist.ts` (2), `webhooks.ts` (2), `invoices.ts` (2), `balance.ts` (1), `kyc.ts` (1), ~~`setup.ts` (2)~~ reclassified — not an authorization defect, see the S-02 resolution note | S-02 |
| 1.2 | ✅ **DONE, differently.** Shipped `team.manage`, `settings.manage`, `risk.manage` and reused `money_in.create` / `kyc.submit` / `provider.connect.test` instead of the eight proposed. One permission per resource rather than per verb. Revisit only if a role needs to split issue-vs-settle | S-02 |
| 1.3 | Make `organizationId` and `actor` **required** parameters on `resolveProviderWrite`, `tryProviderRefund`, `tryProviderPayout`, `tryProviderTransfer`; let the compiler find every omission | S-05 |
| 1.4 | Make the export tenant predicate structural: `guardExport` returns a `TenantScope` that list functions must accept, so omitting it is a type error. Apply to the 7 unbound routes (`audit`, `balance`, `blocklist`, `invoices`, `invoices/[id]`, `subscriptions`, `team`). Delete the `report.export` OR-branch and grant the specific permission per role. Make non-enforcing mode return `ok: false` for tenant-data routes. Copy `route.tenant.test.ts` to all 7 | S-09 |
| 1.5 | ✅ **DONE `36a2047`**, as a test rather than a lint rule: `src/server/actions/authorization-coverage.test.ts` scans every exported function under `src/server/actions/`, fails on any that performs no authorization and is not in a two-entry allowlist, and asserts the allowlist does not grow. It found `topUpBalanceAction` on its first run | S-02 |
| 1.6 | Replace the `x-preview-bypass` **query parameter** with the header only, and require a signed preview secret | S-10 |
| 1.7 | Add a Playwright project that runs the full suite with `AUTH_ENFORCED=strict` | R-11, S-10 |

**Exit criterion:** a static-analysis gate in CI proves 65/65 actions carry an authorization construct ✅ *(met — the scanner asserts **62 gated + 2 excused = 64**. The population fell from 65 to 64 because `refundTransactionAction` was deleted in `11039c5` to close S-03; every action that still exists is accounted for.)* A non-OWNER persona attempting each of the 32 formerly-open actions receives FORBIDDEN ✅ *(met for the mocked seam in 114 assertions across ten `*.auth.test.ts` suites; **not** yet met as an end-to-end persona test — that needs 1.7 and a browser)*. All 11 sensitive export routes are tenant-scoped, each with a `route.tenant.test.ts` ❌ *(1.4 untouched)*, and a two-tenant test proves no cross-read with `AUTH_ENFORCED` set to `off`, `preview` and `strict` ❌ *(blocked on Phase 3 — there is no second tenant to test with until 3.1 exists)*.

### Phase 2 — Durability (weeks 3–9) · *the load-bearing phase*

| # | Action | Fixes |
|---|---|---|
| 2.1 | Choose the store of record. Recommendation: **Postgres via Prisma for everything financial** (it is already in `compose.yaml`, already migrated, already has 16 correctly-shaped models) and keep Firestore only for the AI Journal | R-01 |
| 2.2 | Write the repository layer that already exists but is unpopulated: `PrismaOrgContextDb`, `durable-operation-store.ts`, `audit-event-store.ts`, `provider-connections.ts` (needs `create`/`update`/`delete` added) | R-01, S-06, O-05 |
| 2.3 | Migrate the 8 tenant-less stores one at a time, adding `organizationId` + a composite index as you go: `balance` → `settings` → `team` → `links` → `webhooks` → `risk` → `blocklist` → `kyc`. Keep the in-memory store behind the existing `PAYDASH_DATA_SOURCE` switch so each migration is independently reversible | R-01, S-08 |
| 2.4 | Wire `src/server/data/idempotency.ts` into every mutating action and both webhook routes, backed by a **unique DB constraint** on `(organizationId, idempotencyKey)` — not a Map | R-05 |
| 2.5 | Wrap multi-step writes in `prisma.$transaction`: `approveBatch`'s recipient loop, `approveRefund`'s five mutations, `createBatch`. Add an optimistic-concurrency `version` column to `Transaction`/`PayoutBatch` | R-08 |
| 2.6 | Replace `refundedAmount`'s silent `Math.min` clamp with a rejection, and enforce `SUM(refunds) <= payment.amount` as a DB constraint | R-08 |
| 2.7 | Write real `AuditEvent` rows from the seam (actor, IP, user agent, organizationId, action, before/after, at) — not only from the provider flow. Delete the derived in-memory `data/audit.ts` | O-05 |
| 2.8 | Remove `LedgerEntry` or add `organizationId` + normalise to `Decimal(20,4)`. Delete `server/finance/ledger.ts` and `snapshot.ts` if they are not going to be wired | R-01, O-06 |
| 2.9 | Add nightly `pg_dump` + a tested restore runbook, and a point-in-time-recovery target | Scorecard row 25 |

**Exit criterion:** kill the container mid-payout-approval; restart; the batch is in a consistent state and the audit trail shows the actor. Two concurrent refund approvals on the same transaction cannot together exceed the original amount. Restarting the process loses nothing.

### Phase 3 — Multi-tenancy (weeks 8–12, overlaps Phase 2)

| # | Action | Fixes |
|---|---|---|
| 3.1 | On sign-up: create `Organization` + `OrganizationMember{ role: OWNER, status: ACTIVE }` in one `prisma.$transaction`. Add an integration test that asserts a new user's `resolveSessionOrgContext()` returns their own org with `isDemoFallback: false` | §3.5, S-10 |
| 3.2 | Make `demoOrgContext()` reachable **only** when an explicit `PAYDASH_ENABLE_DEMO_ORG=true` is set, and never in `APP_ENV=production` | §3.5, S-01 |
| 3.3 | Burn down `LEGACY_LEDGER_SURFACES` (12 entries) and `LEGACY_CUSTOMER_SURFACES` one at a time, deleting each entry as its surface becomes scoped. Add a CI check that the arrays only shrink | R-03 |
| 3.4 | Write a two-tenant integration suite that runs the whole app as tenant A and tenant B in the same process and asserts no cross-reads on all 42 pages and all 5 export routes | R-03, S-08, S-09 |
| 3.5 | Connect `team.ts` to `OrganizationMember`: invites create a `PENDING` row with a token and an expiry; acceptance creates the `User`; role changes update the real membership | S-02, R-06, B-03 |
| 3.6 | Add `expiresAt` to `OrganizationMember` and the scheduler that revokes expired invites (register D-13) | R-06 |

**Exit criterion:** two tenants coexist. Tenant A cannot read, write, export or infer the existence of tenant B's data on any surface. The quarantine arrays are empty and deleted.

### Phase 4 — Money (weeks 12–20)

| # | Action | Fixes |
|---|---|---|
| 4.1 | Build the provider-connection surface: an admin route that creates `PaymentProviderConnection` + `SecretRecord`, with `SECRET_STORE_MODE=kms` enforced for LIVE via the existing `assertLiveActivation()` gate | S-06 |
| 4.2 | Stand up a queue (Inngest or Trigger.dev — the repo's own `docs/QUEUES.md` ladder already names them) and move `processWebhookAsync` onto it with retries, backoff and a DLQ. Await the enqueue, not the work | R-04 |
| 4.3 | Replace the mock payout settlement with the real provider call, keeping `resolveForWrite`'s tenant + dual-control checks in front of it | §3.3, S-05 |
| 4.4 | Add the provider call to `approveRefund` — the live journey currently mutates state and reports "issued" without issuing anything | §3.4, F-01 |
| 4.5 | Build the public checkout: a payer-facing route (unauthenticated by design, tenant-resolved from the link id), with `PAYMENTS_PUBLIC_ORIGIN` — already declared and unused — as the share domain | §3.1, B-02 |
| 4.6 | Make `createLink` tenant-scoped; migrate existing links | S-08 |
| 4.7 | Implement real KYC file upload to object storage with per-tenant keys, signed URLs, a size/type allowlist, virus scanning, and a `KycSubmission` row per organization | §3.6, B-04 |
| 4.8 | Wire `reconciliation.ts` + `invariants.ts` as a nightly job against the provider's settlement report; alert on any breach | R-06, O-06 |
| 4.9 | Transactional email (Resend/SES/Postmark) for: invite, invite expiry, refund awaiting approval, refund decided, payout settled, payout failed, invoice overdue, API key created/rotated | R-06, B-03 |

**Exit criterion:** an end-to-end sandbox payment — external payer opens a real URL, pays via Xendit sandbox, the webhook lands, the projection runs from the queue, the transaction appears in the correct tenant's ledger, survives a restart, and reconciles against the provider's report.

### Phase 5 — Business (weeks 18–26, overlaps Phase 4)

| # | Action | Fixes |
|---|---|---|
| 5.1 | Add `plan`, `status`, `billingCustomerId`, `trialEndsAt`, `seatLimit`, `contractedRateBps` to `Organization`; create a migration | B-01 |
| 5.2 | Choose the model — MDR margin on volume, SaaS subscription, or both — and implement metering from the now-durable ledger | B-01 |
| 5.3 | Platform billing: Stripe Billing (already a dependency) for subscriptions, or invoice-from-ledger for MDR. Implement dunning: grace → warn → suspend read-only → suspend writes | B-01, R-06 |
| 5.4 | Enforce entitlements at the seam — plan limits checked in `requireOrgContext`, not in the UI | B-01 |
| 5.5 | Publish real pricing, a real support address, and a real status page | B-03, S-13 |
| 5.6 | Product analytics with a tenant dimension; reconsider the blanket `tenant_id` denial now that isolation is enforced (keep `user_id` redacted; tenant-level attribution is what makes the funnel measurable) | O-04 |
| 5.7 | Compliance pack: KYC retention, PCI scope statement, data-residency declaration, a real audit export, and an evidence run for BI/ASPI | B-04 |
| 5.8 | MFA (TOTP or WebAuthn via a Better Auth plugin) mandatory for any role holding `payout.release` or `refund.execute`; email verification on | S-11 |

**Exit criterion:** a merchant can be charged, suspended for non-payment, and reinstated — with the ledger, the entitlement check and the audit trail all agreeing.

### What to delete rather than fix

Deleting is cheaper than completing, and this repo carries a large amount of well-written code that has no caller:

| Module | Reason |
|---|---|
| `src/server/actions/transactions.ts:114-245` + `components/transactions/refund-dialog.tsx` | Superseded by the correct three-action journey; contains S-03 |
| `src/server/data/idempotency.ts` | Replace with a DB-backed unique constraint (2.4) rather than reviving a Map |
| `src/server/finance/ledger.ts`, `snapshot.ts`, `reconciliation.ts`, `unknown-recovery.ts` | Keep only if 4.8 will wire them; otherwise delete with `domain/finance/{invariants,cases}.ts` |
| `src/domain/observability/slo.ts` | Wire to `/system` or delete |
| `src/domain/ai/governance.ts` | Its `:161` approver-separation check is *better* than what S-03 does — extract that function, delete the rest |
| `src/server/dal/*` | Superseded by the `*-organization-context.ts` seams that are actually used |
| `prisma/schema.prisma` `LedgerEntry` | Legacy single-user table, no writer, wrong precision, no `organizationId` |
| `apps/web/sentry.client.config.ts` | A placeholder export kept only to satisfy `withSentryConfig` |
| One of the two `instrumentation.ts` files | O-01 |

---

## 13. "If this launches tomorrow, where does it first fail?"

### At 100 users

**First failure: within the first hour, at sign-up — and it is not a crash, it is a lie.**

All 100 users complete sign-up (Better Auth works). All 100 are assigned `org_demo` with role `OWNER`. All 100 see **the same seeded ledger** and believe it is theirs. Merchant #1 creates a customer; merchant #2 sees it. Merchant #3 tops up the balance (`topUpBalanceAction`, no auth) and merchant #4's available figure changes.

Then the first payout. Two merchants click "Release" on the same seeded batch. `approveBatch`'s dual control compares `batch.createdBy` — which is `null` for every seeded row, so the check is skipped by design (`data/payouts.ts:845`) — and both approvals succeed against the same in-memory batch. Both see `"{batch} sent — N recipients paid."` No money moved. The account numbers did not end in `0000`.

The **support operation** fails simultaneously and invisibly: `SUPPORT_EMAIL` is `support@kinetic.test`, which cannot receive mail, and there is no email infrastructure to receive it if it could. Invites "sent" to 100 colleagues were never sent. 100 people are now sharing one merchant account with OWNER rights and no way to contact anyone.

**Business model at 100 users:** IDR 0. Nothing charges anyone.

*If `AUTH_ENFORCED=strict` and tenant provisioning had been shipped first, the failure is different and worse: all 100 authenticated users hit `requireStrictOrgContext`, which denies `isDemoFallback`, and **every money-movement action returns FORBIDDEN**. The product is 100% unusable by 100% of paying customers.*

### At 1,000 users

**First failure: the second replica — i.e. the first deploy that cannot afford downtime.**

One container cannot serve 1,000 concurrent merchants, so you run two. `globalThis` is per-process. Immediately:

- A payment recorded on replica A does not exist on replica B. Merchants refreshing `/transactions` see a **different ledger each time**, and support receives reports of "missing transactions" that reappear on the next refresh. There is no way to reproduce this, because it depends on which replica answered.
- `data/balance.ts` computes available/reserved per replica. The same merchant sees two different balances in two tabs. ADR-0012's central promise — the dashboard and `/balance` cannot disagree — is false across replicas.
- Payout dual control is per-replica. Two approvers on two replicas both see the batch as unapproved and both release it.
- Idempotency is per-process even if 2.4 were shipped as a Map, so every retried webhook that lands on the other replica is a duplicate.
- The AI Journal's rate limit becomes 10 × N per 10 minutes.

**Second failure, close behind: the first tenant boundary.** If provisioning works and tenant #2 appears, `countLedgerTenants() > 1` flips the quarantine on and **12 ledger surfaces plus reports and subscriptions throw `UnscopedLedgerAccessError`** for every request resolving to the demo fallback. `[locale]/error.tsx` renders a generic message. No alert fires, because Sentry server-side never initialised (O-01) and `/api/health` still returns 200 `"ok"` (O-02). The orchestrator keeps routing traffic into a hard failure.

**Support operation at 1,000:** still no email, no ticketing that persists, no audit trail with an actor. A support agent asked "who released payout X?" opens `/audit` and finds a reconstruction of current state with no actor, no IP and no tenant. The correct answer is unavailable in principle.

**Observability at 1,000:** pino is configured and used in one file. 19 `console.*` calls, no correlation id. Product analytics posts to a 204 drain. The team learns about every incident from a merchant, after the fact.

### At 10,000 users

**First failure: it does not get to 10,000 — it fails at the database, at the queue, and at the compliance gate, all before scale becomes the binding constraint.**

But taking the question at face value, assuming Phases 0–4 shipped:

1. **Data volume.** The seeded demo ledger is generated per process. Ten thousand tenants × real transaction volume against tables that have never held a row, with indexes that have never been exercised, is where query plans first appear. `schema.prisma` has `@@index([userId])` on `OrganizationMember` and per-model indexes, but no composite `(organizationId, createdAt)` index has ever been validated against a real cardinality, because no real cardinality has ever existed.
2. **Webhooks.** At 10,000 merchants, Xendit and Stripe send thousands of callbacks per minute. Without a queue (Phase 4.2), the fire-and-forget projection drops a fraction of them, the provider sees 200 and never retries, and the divergence compounds silently. Reconciliation (4.8) is the only thing that would find it, and it has never run.
3. **Support operation.** This is the true ceiling. Every async promise in the product is unfulfilled: no email, no scheduler, no notification outside an open browser tab. At 10,000 merchants the support queue is not "large", it is **unaddressable** — there is no durable record of who asked what, no actor in the audit log, no way to reproduce an incident that depended on which replica answered, and no contact channel that works. Support headcount scales linearly with merchant count while tooling stays at zero.
4. **Business model.** Still IDR 0. At 10,000 merchants you are operating a free, un-metered, un-invoiced payments platform with no entitlement enforcement, absorbing provider costs, infrastructure costs and support costs, with no mechanism to charge for any of it — and no `plan` field on `Organization` in which to record a price if you invented one tomorrow.
5. **Compliance.** A payment gateway at 10,000 merchants is a regulated entity. KYC stores one document globally and never uploads the file. The audit trail has no actor. There is no data-residency control, no retention policy, no deletion path. Registration evidence cannot be produced because the controls it would attest to do not execute. This is the failure that arrives with a letter rather than an outage — and it is not fixable after the fact, because the missing artefacts are historical.

### The one-line answer

> **It fails at the second user, not the ten-thousandth.** Merchant #2 sees merchant #1's ledger, and nothing downstream of that is recoverable — because there is no durable record of what either of them did, no way to charge either of them, and no channel through which either of them can reach you.

---

## Appendix A — Runtime probe log (reproducible)

Environment: sandbox at `/home/user/pay-dash`, no PostgreSQL, no browser binary, no egress to `fonts.googleapis.com` or `binaries.prisma.sh`. App booted with `npx next dev -H 0.0.0.0 -p 3000` from `apps/web`, `AUTH_ENFORCED` unset (→ `strict`), `PAYDASH_DATA_SOURCE` unset (→ `memory`), no webhook secrets set.

**Disclosure:** to boot at all, `src/app/layout.tsx` was temporarily patched to remove the three `next/font/google` imports (R-09 makes this unavoidable offline). It was restored afterwards; `git status --porcelain` is empty. No other file was touched and no code change is part of this audit.

```bash
# A1 — unauthenticated baseline: the edge gate works when there is no cookie at all
$ curl -o /dev/null -w "%{http_code} %{redirect_url}\n" http://127.0.0.1:3000/dashboard
307 http://127.0.0.1:3000/id/sign-in?redirect=%2Fdashboard
$ curl -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/id/dashboard
307            # → /dashboard (next-intl "as-needed" strips the default locale)

# A2 — S-01: a garbage cookie value is accepted
$ curl -H 'Cookie: better-auth.session_token=GARBAGE_NOT_A_REAL_TOKEN' \
       -o /tmp/dash.html -w "%{http_code} size=%{size_download}\n" \
       http://127.0.0.1:3000/dashboard
200 size=334801
$ grep -o "Total Volume" /tmp/dash.html | head -1 ; grep -oE "txn_2cd9_[a-z0-9]+" /tmp/dash.html | head -2
Total Volume
txn_2cd9_4rsmxrj2
txn_2cd9_8224ejx0

# A3 — S-01: full sweep, same cookie
/dashboard 200/334801   /transactions 200/350512   /customers 200/381115
/audit 200/205084       /team 200/150349           /settings/api-keys 200/163456
/balance 200/326813     /payouts 200/306984        /billing 200/302512
/webhooks 200/262263    /system 200/176336         /onboarding 200/144658
/kyc 200/122937         /en/dashboard 200/335012   /transactions/txn_2cd9_4rsmxrj2 200/281976
/definitely-not-a-route 404

# A4 — S-01/S-09: the API route guards DO reject the demo fallback (the inconsistency)
/api/exports/transactions 401 {"error":"Unauthorized"}
/api/exports/customers    401   /api/exports/team 401   /api/exports/audit 401
/api/dashboard/command-center 401   /api/mcp 401

# A5 — O-02: health lies
$ curl http://127.0.0.1:3000/api/health
{"status":"ok","timestamp":"2026-09-14T03:41:18.471Z","db":"error","version":"0.1.0"}   # HTTP 200

# A6 — S-07: unsigned webhook injection, then observe it in the UI
$ curl -X POST -H 'content-type: application/json' \
    -d '{"id":"evt_AUDIT_PROBE_UNAUTH_999","event":"payment.succeeded","data":{"id":"txn_AUDIT_PROBE","status":"settle","amount":999999}}' \
    http://127.0.0.1:3000/api/webhooks/xendit
{"received":true,"event":"payment.succeeded"}
$ curl -X POST -H 'content-type: application/json' \
    -d '{"id":"evt_STRIPE_PROBE_777","type":"payment_intent.succeeded","data":{"object":{"id":"pi_STRIPE_PROBE","amount":123456,"currency":"idr"}}}' \
    http://127.0.0.1:3000/api/webhooks/stripe
{"received":true,"event":"payment_intent.succeeded"}
$ curl -H 'Cookie: …GARBAGE…' http://127.0.0.1:3000/webhooks | grep -oE "evt_(STRIPE_PROBE_777|AUDIT_PROBE[A-Z_0-9]*)" | sort -u
evt_AUDIT_PROBE_UNAUTH_998
evt_AUDIT_PROBE_UNAUTH_999
evt_STRIPE_PROBE_777

# A7 — R-01: restart the process; the writes are gone, the seeds are back
$ (stop server; start server)
$ curl -H 'Cookie: …GARBAGE…' http://127.0.0.1:3000/webhooks | grep -oE "evt_(STRIPE_PROBE_777|AUDIT_PROBE[A-Z_0-9]*)" | sort -u
(no output)
$ … | grep -oE "whk_seed_[0-9]+" | sort -u
whk_seed_1  whk_seed_2  whk_seed_3  whk_seed_4  whk_seed_5  whk_seed_6  whk_seed_7

# A8 — S-02: unauthenticated Server Action bodies execute (dev-server log)
⨯ TypeError: Cannot read properties of undefined (reading 'get')     at inviteMemberAction (src/server/actions/team.ts:41:32)
⨯ TypeError: Cannot read properties of undefined (reading 'getAll')  at idsOf (team.ts:32:19) at changeRoleAction (team.ts:61:15)
⨯ TypeError: Cannot read properties of undefined (reading 'getAll')  at idsOf (team.ts:32:19) at deactivateAction (team.ts:82:15)
⨯ TypeError: Cannot read properties of undefined (reading 'get')     at resendInviteAction (team.ts:111:30)
POST /team 500   ×4
# The TypeError is a probe artefact: `useActionState` actions take (_prev, formData), and the
# hand-rolled multipart POST supplied only one argument. The finding is that execution reached
# the body of four mutating actions with no session — there is no auth check to have failed first.

# A9 — §3.5: sign-up with no database
$ curl -X POST -H 'content-type: application/json' -H 'origin: http://127.0.0.1:3000' \
    -d '{"email":"probe@example.com","password":"Test1234!Ab","name":"Probe"}' \
    -o /tmp/su -w "%{http_code}\n" http://127.0.0.1:3000/api/auth/sign-up/email
500          # body is an HTML error page, not JSON
$ curl -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/auth/get-session
500

# A10 — O-01: Sentry's own warnings, printed on every boot
[@sentry/nextjs] It appears you've configured a `sentry.server.config.ts` file. Please ensure to put this
  file's content into the `register()` function of a Next.js instrumentation file instead. …
[@sentry/nextjs] Could not find `onRequestError` hook in instrumentation file. …
[@sentry/nextjs] It appears you've configured a `sentry.edge.config.ts` file. …
[@sentry/nextjs] DEPRECATION WARNING: … renaming your `sentry.client.config.ts` file …

# A11 — R-01 mechanism observed unprompted, twice, during a 20-minute probe
⚠ Server is approaching the used memory threshold, restarting...
   ✓ Ready in 3.4s

# A12 — F-09 / R-09: compile cost
✓ Compiled /[locale]/dashboard in 29.3s (8567 modules)
✓ Compiled /[locale]/transactions/[id] in 5.9s (8623 modules)
```

---

## Appendix B — Dead-code inventory (verified 0 non-test importers)

Method: for each candidate module, `grep -rl "<module path without extension>" src/ --include=*.ts --include=*.tsx`, excluding `*.test.*`.

| Module | Intended purpose | Status |
|---|---|---|
| `src/domain/observability/slo.ts` | SLO definitions + error-budget burn | Never surfaced |
| `src/domain/finance/invariants.ts` | Ledger invariants | Never checked |
| `src/domain/finance/cases.ts` | Invariant-violation handling | Never invoked |
| `src/domain/ai/governance.ts` | AI approval governance — contains a **correct** `approverId === requestedBy` check at `:161` | Never invoked; see S-03 |
| `src/server/finance/snapshot.ts` | Financial snapshot / period close | Never invoked |
| `src/server/finance/ledger.ts` | Double-entry ledger | Imported only by the dead `snapshot.ts` → transitively dead |
| `src/server/finance/reconciliation.ts` | Provider-vs-ledger reconciliation | Transitively dead |
| `src/server/finance/unknown-recovery.ts` | Recovery of `UNKNOWN` provider outcomes | Transitively dead |
| `src/server/dal/*` | Data-access layer referenced by the seam docs | Never imported |
| `src/server/data/idempotency.ts` | Idempotency-key store (register BE-005) | Never imported |
| `src/components/transactions/refund-dialog.tsx` | Legacy single-step refund UI | Never imported; its action is still exposed (S-03) |
| `apps/web/sentry.client.config.ts` | Client Sentry init | A placeholder `export const … = true`; real init is in `instrumentation-client.ts` |
| `apps/web/instrumentation.ts` (root) | Sentry server/edge init + `onRequestError` | **Shadowed** by `src/instrumentation.ts`; never loaded (O-01) |

**Unreachable rather than unimported** (imported, but only from a branch that cannot execute):

| Module | Why unreachable |
|---|---|
| `src/server/providers/xendit.ts`, `src/server/providers/stripe.ts` | `resolveProviderWrite()` always returns `{ connected: false }` (S-06) |
| `src/server/payment-flows/payment-flow.ts`, `execute-provider-write.ts` | Same |
| `src/server/repositories/{provider-connections,durable-operation-store,audit-event-store,payout-identities}.ts` | Same — `AuditEvent` / `DurableOperation` are never written |
| `src/server/repositories/runtime-connection-resolver.ts` `assertLiveActivation()` | The KMS gate never runs because no connection exists to activate |
| `src/lib/env.ts` `PAYMENTS_PUBLIC_ORIGIN` | Declared at `:22,:46`; referenced nowhere else |

**Confirmed NOT dead** (checked, because the naming suggests it): `src/server/data/handoff-store.ts` — dynamically imported at `data/transactions.ts:1025,1091,1129`, statically imported at `data/command-center.ts:18`, and re-exported from `data/handoff.ts:24,26`.

---

## Appendix C — Build, test and CI status as observed

| Check | Command | Result | Note |
|---|---|---|---|
| Type check | `pnpm typecheck` | **PASS** | Prisma is accessed via `unknown` + casts (`repositories/prisma-runtime.ts:15`), so queries are not type-checked |
| Lint | `pnpm lint` | **PASS** — 0 errors, 40 warnings | |
| Unit tests | `pnpm test` (vitest) | **1482 pass, 2 suites fail** | Both failures are MCP suites importing the un-generated Prisma Client. In CI they fail for a different reason: R-10 ordering |
| Build | `pnpm --filter web build` | **FAIL** | `next/font/google` → ECONNRESET to `fonts.googleapis.com`. Environment restriction here; a genuine build-time SPOF in any offline CI runner (R-09) |
| E2E | `pnpm test:e2e` | **Not run** | No browser binary and no egress to install one. Specs reviewed statically (R-11) |
| Prisma generate | `prisma generate` | **FAIL** | `binaries.prisma.sh` unreachable. Consequence: no Postgres-backed path could be executed in this audit |
| CI workflow | `.github/workflows/ci.yml` | typecheck → lint → **test** → build → **prisma generate** → playwright install → test:e2e | Ordering bug (R-10) |

---

## Appendix D — What is genuinely well built

An audit that lists only defects is not useful for deciding what to keep. These are real strengths, verified in code:

1. **The Wave 6/7 tenancy design is correct.** `domain/security/tenant.ts` (`TenantScope`, `scopeRecords`, `assertTenantMatch`, `resolveRequestedScope`, `TenantIsolationError`), `domain/tenancy/organization-context.ts` (`parseOrganizationContext`, `tenantScopeFor`), and the three per-domain seams are the right shape. `requireStrictOrgContext` genuinely fails closed. `refuseMultiTenantDemo` genuinely refuses. `normalizeRequestedOrganization` correctly *flags and discards* a browser-supplied `?organizationId=` rather than honouring it — the right call, and a subtle one.
2. **Anti-enumeration is applied consistently and deliberately.** `transactionAccessDeniedState` collapses `TenantIsolationError` and unknown-id into one identical message, with a written comment explaining why permission failures are *not* collapsed. `approveBatchAction` catches `TenantIsolationError` and returns "That batch no longer exists."
3. **The live refund journey is properly authorized.** Strict seam + `refund.prepare`/`refund.execute`, dual control enforced against the **session** actor at `data/transactions.ts:1070`, event appended, three surfaces revalidated. This is the pattern the other 32 actions should copy.
4. **Payout authorization is complete.** `requirePayoutOrganizationContext("payout.release")`, `writableBatch` re-checks tenant + permission, confirm-before-release schema, creator-may-not-approve. Only the *execution* half is broken.
5. **Webhook signature verification is correct where configured.** Constant-time comparison via `verify.ts` with an explicit comment that `!==` is never used; raw-body Stripe signature verification; durable dedupe on a provider-scoped key; an explicit production fail-closed branch.
6. **The Prisma schema is well modelled.** 16 provider-domain models with `Decimal(20,4)` money, `Char(3)` currency, proper relations, `@@unique([organizationId, userId])`, sensible indexes, `onDelete: Cascade` on membership. It is a good schema for a system that does not use it.
7. **Frontend craft.** 28 `loading.tsx`, 11 `not-found.tsx`, real skeletons, `SectionBoundary`, 29 `useActionState` forms with field-level errors, permission-filtered navigation, a command palette, 123 `toast.*` call sites, and — unusually — components whose comments map each interactive element to a real destination or mutation.
8. **`use-polling.ts`** is correctly implemented (visibility-aware, backoff, cleanup).
9. **Honest self-documentation.** `KNOWN_DEBT_REGISTER.md` records 28 real debts (D-01…D-28), including the missing rate limits, the in-memory seam, the missing invite-expiry cron, `LedgerEntry`'s absent `organizationId`, and analytics' absent tenant dimension. The team knows. The register is accurate as far as it goes — it does not cover R-01's full extent, S-01, S-02's 32 actions, S-03, O-01, O-02, B-01 or §3.1.
10. **Analytics privacy design.** `analytics-events.ts` applies an allowlist plus PII redaction and denies `user_id`/`tenant_id` by default. The intent is right; the consequence (O-04) is that nothing is measurable. That trade should be revisited, not reversed blindly.

---

## Appendix E — Finding index

| ID | Sev | Title | § |
|---|---|---|---|
| S-01 | CRIT | Edge gate validates cookie existence, not the session | 5 |
| S-02 | CRIT | 32 of 65 Server Actions have no authorization | 5 |
| S-03 | CRIT | Refund dual control satisfied by a client-supplied string | 5, 3.4 |
| S-04 | CRIT | Any authenticated user can rewrite global runtime config | 5 |
| S-05 | HIGH | Provider writes discard the resolved tenant context | 5, 3.3, 3.4 |
| S-06 | HIGH | No code path can create a provider connection or store a secret | 5 |
| S-07 | HIGH | Webhook endpoints accept unsigned payloads outside production | 5 |
| S-08 | HIGH | Eight stores have no tenant dimension at all | 5 |
| S-09 | HIGH | Seven of twelve export routes apply no tenant predicate; `report.export` overrides all | 5 |
| S-10 | HIGH | No tenant provisioning ⇒ strict mode locks out real customers | 5, 3.5 |
| S-11 | MED | Credential/session/CSP/Replay hardening gaps | 5 |
| S-12 | MED | The AI Journal is a second, separately-authenticated application | 5 |
| S-13 | LOW | `SUPPORT_EMAIL` points at a reserved TLD | 5 |
| R-01 | CRIT | There is no database behind the product | 6 |
| R-02 | CRIT | Scale-out fragments the ledger across replicas | 6 |
| R-03 | CRIT | Tenant #2 triggers a 12-surface hard failure | 6 |
| R-04 | HIGH | Webhook processing is fire-and-forget after the 200 | 6, 3.2 |
| R-05 | HIGH | No retry, no backoff, no idempotency on any write path | 6 |
| R-06 | HIGH | No email, scheduler, queue or cache | 6 |
| R-07 | HIGH | `/system` and `/webhooks` present fabricated data as live | 6 |
| R-08 | MED | No transactions or locking on multi-step writes | 6 |
| R-09 | MED | Production build has a hard external dependency | 6 |
| R-10 | MED | CI tests before generating the Prisma Client | 6 |
| R-11 | MED | E2E tests do not assert and never test strict auth | 6 |
| R-12 | LOW | `compose.yaml` requires a file that does not exist | 6 |
| O-01 | CRIT | Server-side Sentry never initialises | 7 |
| O-02 | CRIT | `/api/health` reports healthy with the database down | 7 |
| O-03 | HIGH | Structured logging used in exactly one file | 7 |
| O-04 | HIGH | Product analytics is a no-op by construction | 7 |
| O-05 | HIGH | The audit log cannot answer an auditor's question | 7 |
| O-06 | MED | SLO, invariant and reconciliation engines are dead code | 7 |
| O-07 | MED | Error/loading UX is good and cannot report | 7 |
| O-08 | MED | OTEL service name is `xendit-app` | 7 |
| O-09 | MED | No operational path for the three essential operations | 7 |
| B-01 | CRIT | No revenue model, and no schema able to hold one | 8 |
| B-02 | CRIT | The product cannot process a real payment | 8 |
| B-03 | HIGH | Support and trust surfaces are non-functional | 8 |
| B-04 | HIGH | Compliance posture cannot be evidenced | 8 |
| B-05 | MED | Multi-currency claims are single-currency in practice | 8 |
| F-01…F-09 | HIGH→LOW | False success copy, missing fields, fabricated data, payload size | 9 |

---

*End of report. 48 findings (13 security, 12 reliability/data, 9 observability, 5 business, 9 frontend): 11 CRIT, 17 HIGH, 14 MED, 6 LOW. No source file was modified by this audit; `git status --porcelain` is empty apart from this report.*
