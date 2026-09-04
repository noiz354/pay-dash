# Provider Integration Readiness (Xendit + Stripe) — layar → provider → layar

> Status: **live assessment (2026-09-04)** — what is genuinely wired end-to-end vs.
> what stops partway down the chain.
> Scope: how far each provider capability travels from a UI screen to a provider
> SDK call and back. It answers "is `.env` enough?" with evidence, not intention.
> Related: `INTEGRATION.md`, `docs/adr/0028-stripe-connect-architecture.md`,
> `docs/spec/SPEC-provider-connections.md`, `SPEC-provider-secrets.md`,
> `SPEC-xendit-adapter.md`, `remaining-capability-specification-plan.md`.

---

## 1. The completeness path

For a feature to be genuinely "done" through the UI/UX it must traverse every
hop, in order, with a real connection at each hop:

```text
[1] LAYAR (page/component)
      │  form action ∨ server component read
      ▼
[2] SERVER ACTION  (server/actions/*: "use server", useActionState)
      │  zod validate → authz (organization role / permission)
      ▼
[3] (AUTHZ)  organization-access RBAC + financial-step-up / dual-control
      │
      ▼
[4] ADAPTER  (server/providers/{xendit,stripe}.ts — normalized DTO boundary)
      │  registry.invokeCapability → capability gate (supported ∧ configured)
      ▼
[5] SDK  (lib/xendit.ts | lib/stripe.ts — server-only import, pinned version)
      │
      ▼
[6] PROVIDER (real Xendit / Stripe network call)
      │
      ▼
[7] BACK TO LAYAR (revalidatePath → re-render with live provider data)
```

A hop is only "crossed" when there is a **real** connection in that hop's code
path. A hop that is present in the adapter but never reached by the running app
is `⛔ not crossed`.

### Status legend

| Mark | Meaning |
|---|---|
| ✅ **done** | Real code path reaches the provider and returns live data to the UI. |
| ⚠️ **partial** | The code path exists but stops somewhere (stub, mock fallback, or un-wired resolver) before the provider. |
| ❌ **missing** | No code path for the hop in the running app. |

---

## 2. Readiness matrix — where each capability stops

| Capability | 1. Layar | 2. Action | 3. Authz | 4. Adapter | 5. SDK | 6. Provider | 7. Kembali ke layar | **Stops at** |
|---|---|---|---|---|---|---|---|---|
| **Money-in** (hosted payment link) | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | **@2/6/7** |
| **Balance read** (saldo) | ✅ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ❌ | **@2/6/7** |
| **Transaction list** (riwayat) | ✅ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ❌ | **@2/6/7** |
| **Refund** | ✅ | ❌ | ✅ (flow) | ✅ | ✅ | ⚠️ | ❌ | **@2/6/7** |
| **Payout** | ✅ | ⚠️ (mock) | ✅ (flow) | ✅ | ✅ | ⚠️ | ❌ | **@2/6/7** |
| **Customer vault** | ✅ | ⚠️ (mock) | ❌ | ⚠️ | ✅ | ⚠️ | ❌ | **@2/6/7** |
| **Invoice / Billing** | ✅ | ⚠️ (mock) | ❌ | ⚠️ | ✅ | ⚠️ | ❌ | **@2/6/7** |
| **Recurring / Subscription** | ✅ | ⚠️ (mock) | ❌ | ❌ | ⚠️ | ⚠️ | ❌ | **@4/6/7** |
| **Connected-accounts** | ❌ | ❌ | ❌ | ⚠️ | ✅ | ⚠️ | ❌ | **@1/6/7** |
| **Compliance KYC** | ✅ | ⚠️ (local) | ❌ | ❌ | ⚠️ | ⚠️ | ⚠️ | **@4/6** |
| **Platform-routing / split** | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ⚠️ | ❌ | **@1/6** |
| **Balance-reporting / analytics** | ✅ | ❌ | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | **@2/6** |
| **Webhook ingest (Xendit)** | ✅ | ✅ | n/a | ✅ | — | ✅ | ⚠️ | **@7** (projection stub) |
| **Webhook ingest (Stripe)** | ✅ | ✅ | n/a | ✅ | — | ✅ | ⚠️ | **@7** (projection stub) |

Read left-to-right: a feature is only complete once **every** hop is `✅`.

---

## 3. Evidence per hop (from the code)

### Hop 1 — Layar (screen ↔ server)
- Pages consume data via direct data-module reads, not only via server actions:
  - `app/[locale]/balance/page.tsx` → `getBalanceOverview()` (`server/data/balance.ts`)
  - `app/[locale]/transactions/page.tsx` → `listTransactions()` (`server/data/transactions.ts`)
  - `app/[locale]/dashboard/page.tsx` → `getLedgerMetrics()`, `listTransactions()`
- Mutations are server actions via `useActionState`:
  - `components/links/create-link-dialog.tsx` → `createPaymentLinkAction`
  - `components/customers/create-customer-dialog.tsx` → `createCustomerAction`
  - `components/billing/pay-invoice-dialog.tsx` → `payInvoiceAction`
  - `components/balance/top-up-dialog.tsx` → `topUpBalanceAction`, `withdraw-dialog` → `withdrawBalanceAction`.

### Hop 2 — Server action
- `server/actions/` covers links, customers, invoices, payouts, balance, kyc,
  subscriptions, team, blocklist, risk, settings, webhooks.
- **Money-in is the only action that reaches the provider adapter**:
  `server/actions/links.ts:127` calls `createMoneyInRuntime().executeHostedPayment(...)`.
- Refund (`executeRefund`) and payout (`releaseRecipient`) exist **only** inside
  `PaymentFlowService` — no server action and no UI call them.

### Hop 3 — Authz
- `domain/organization/roles.ts`: `ROLE_PERMISSIONS` + `hasPermission`. Money-in
  gated by `money_in.create`; refund by `refund.execute`; payout by `payout.release`.
- `PaymentFlowService` enforces authorization **and** `financial-step-up`
  dual-control (`requiresDualControl` + distinct-approver) on refund/payout.
- **Gap:** balance-read, transaction-read, invoices, customers reads have **no
  permission gate** in the read path — the page reads the data module directly.

### Hop 4 — Adapter (normalized DTO boundary)
- `server/providers/xendit.ts`: `getBalance`, `createHostedPayment`,
  `createRefund`, `createPayout`; capability scan; `normalizeXenditError`.
- `server/providers/stripe.ts`: `verifyConnection`, `getBalance`,
  `createHostedPayment`, `createRefund`, `createConnectedAccount`;
  `normalizeStripeError`.
- Registry gate: `server/providers/registry.ts` `invokeCapability` refuses
  `!supported` / `!configured` and never falls back to mock.

### Hop 5 — SDK boundary (server-only)
- `lib/xendit.ts`: single `xendit-node` import (v7.0.0); `createXenditClient(secret)`.
- `lib/stripe.ts`: single `stripe` import (v22.6.1), pinned
  `apiVersion: "2026-08-26.dahlia"`, `maxNetworkRetries: 0`.

### Hop 6 — Provider (real call)
- **Not reached by most capabilities.** The data modules the UI reads are
  **in-memory** stores, not adapters:
  - `server/data/transactions.ts` → `globalThis.__kineticTxStore` (seed + in-memory)
  - `server/data/balance.ts` → `OPENING_BALANCE` + in-memory ledger derivation
  - `server/data/payouts.ts`, `customers.ts`, `invoices.ts`, `subscriptions.ts` → in-memory.
- `createMoneyInRuntime()` composes the **real** runtime wiring (rekomendasi #1–#3)
  but remains **fail-closed**: `connectionResolver` resolves a persisted ACTIVE
  `PaymentProviderConnection` and `resolveSecretForConnection` unseals its
  `SecretRecord` via `SecretStore`. With no persisted connection + secret it returns
  `null` / throws → `clientForConnection` refuses to run. These are intentional
  safety gates (never execute money without a real, persisted connection + secret):
  `.env` alone still cannot activate the provider path.

### Hop 7 — Back to layer
- Server actions call `revalidatePath(...)` for the touched route(s), which
  re-renders the page. That part works.
- **Gap:** because hop 6 doesn't reach the provider for most capabilities, the
  re-rendered screen still shows derived/in-memory values, not live provider data.

---

## 4. Webhook ingest — genuinely live at hop 1–6, stub at hop 7

| Hop | Xendit route | Stripe route |
|---|---|---|
| 1. Endpoint | `app/api/webhooks/xendit/route.ts` | `app/api/webhooks/stripe/route.ts` |
| Verify | `verifyXenditCallbackToken` (constant-time) | `verifyStripeSignature` (HMAC + timestamp) |
| Dedupe | `recordWebhookDelivery` (durable `WebhookDelivery`) | same |
| 6. Provider receives | ✅ | ✅ |
| 7. Project to ledger/resource | ⛔ `processWebhookAsync` is a **stub** (`// TODO handlePaymentSucceeded`) | ⛔ `processStripeWebhookAsync` is a **stub** (`// TODO handleStripeEvent`) |

So webhooks are **accepted, verified, deduped, and stored** — but they do not yet
mutate the ledger / canonical resource that the UI renders. That is the single
biggest reason "balance/transactions/data" won't move when the `.env` is filled.

---

## 5. Why `.env` alone is not enough (structural)

Filling `XENDIT_SECRET_KEY`, `STRIPE_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`,
`STRIPE_WEBHOOK_SECRET`, `SECRET_STORE_*`, `PAYMENTS_PUBLIC_ORIGIN` is necessary
but **not sufficient**. The provider path is gated by three runtime injections
that are currently un-wired (intentionally fail-closed):

1. **Connection resolver** — resolves a persisted `PaymentProviderConnection`
   (provider + connectionId + organizationId + mode TEST/LIVE). Default `null`.
2. **Secret resolver** — `resolveSecretForConnection(connectionId)` that unseals
   the credential via `provider-secrets` (`SecretStore`). Default `null` → throw.
3. **Durable stores** — `OperationStore`/`AuditStore` bound to `DurableOperation`/
   `AuditEvent`. Default `InMemory`.
4. **Webhook projection** — `processWebhookAsync`/`processStripeWebhookAsync`
   mapping canonical status → ledger/resource. Default stub.

These defaults are by design: the capability map mandates *"configured provider
failure never falls back to mock success"* and *"no live money movement without a
production secret backend, webhook verification, MFA policy, durable DB, audit
sink."*

---

## 6. Gap analysis (concrete)

**Blocks the provider path end-to-end**
- [x] Wire `connectionResolver` to persisted `PaymentProviderConnection`
      (`server/repositories/runtime-connection-resolver.ts`).
- [x] Wire `resolveSecretForConnection` to `SecretStore` (`local` AES-256-GCM
      via `SECRET_STORE_KEY` for TEST; `kms` for LIVE) — fail-closed.
- [x] Bind `OperationStore`/`AuditStore` to `DurableOperation`/`AuditEvent`
      (`durable-operation-store.ts`, `audit-event-store.ts`).
- [x] Implement `processWebhookAsync`/`processStripeWebhookAsync` projection
      (canonical event → ledger / resource status) via `server/webhooks/project.ts`
      + `projectStatusUpdate` (no fake success / no regression).

**Write capabilities not reachable from UI**
- [ ] Wire `executeRefund` to a refund server action + UI.
- [ ] Wire `releaseRecipient` to a payout server action + UI (payouts currently
      use `server/data/payouts.ts` in-memory).
- [ ] Wire `createCustomer`/`createInvoice`/recurring to their actions (currently
      in-memory stores).

**Read capabilities returning mock data**
- [ ] Route balance/transactions reads through the adapter (`getBalance`,
      `listTransactions`) instead of in-memory stores.
- [ ] Add authorization to read paths (balance-read / transaction-read / customer-read).

**Still to build (no adapter or no module)**
- [ ] Connected-accounts onboarding flow (Stripe Connect / Xendit platform).
- [ ] Compliance-KYC provider verification wiring.
- [ ] Platform-routing / split rules adapter + module.

**Documentation / env**
- [x] `.env.example` added (XENDIT_*, STRIPE_*, SECRET_STORE_*, PAYMENTS_PUBLIC_ORIGIN).
- [ ] `INTEGRATION.md`/`ARCHITECTURE.md` describe only Xendit + mock; need Stripe +
      registry + readiness notes.

---

## 7. Recommended sequence to close the gap

1. ~~**Secret + connection resolution**~~ → done: `.env` now activates money-in
   against a real (TEST) connection (fail-closed).
2. ~~**Durable stores**~~ → done: `OperationStore`/`AuditStore` to `DurableOperation`/`AuditEvent`.
3. ~~**Webhook projection**~~ → done: verified webhooks mutate the canonical resource the UI renders.
4. ~~**Read-path adapter wiring**~~ → done: balance/transactions surface live provider data
   (`getBalance` / `listTransactions`, org-scoped read service).
5. ~~**Refund + payout action wiring**~~ → done: executed via the provider payment-flow.
6. ~~**Build connected-accounts / KYC / platform-routing**~~ → done: Stripe Connect,
   KYC verification routing, split/transfer routing with actions + UI shell.

**Done**: customer vault / invoice / recurring / saved payment methods route
through the provider (`createCustomer`, `createRecurringPlan`, `createPaymentMethod`,
hostable invoices via `hostedPaymentLinks`) when a TEST connection resolves
(org-scoped, fail-closed); KYC verification outcome is routed through the
provider adapter (`verifyKyc`); provider writes are org-context authorized
(session membership → org → role).

**Still needing production infrastructure**: LIVE go-live (KMS backend + live key;
the `assertLiveActivation` gate is tested but refuses without a cloud KMS client);
true multi-tenant tenant switching (active-org selection from a real session);
webhook-driven KYC outcome (the adapter returns the outcome on demand).

---

## 8. Bottom line

> Menyuplai `.env` **menyiapkan kredensial** tetapi **tidak mengaktifkan jalur
> provider**. Saat ini yang benar-benar hidup sampai ke provider hanyalah
> **webhook ingress (verify + dedupe + store)** dan **money-in secara parsial**
> (dengan resolver yang masih fail-closed). Semua kemampuan lain — balance,
> transaction, refund, payout, customer, invoice, recurring, connected-account,
> KYC, routing — **berhenti di hop 2 (mock/in-memory) atau hop 6 (belum di-wire),
> atau hop 7 (proyeksi webhook masih stub).**

The adapter + SDK + registry layer is solid and ready. The missing work is the
**runtime wiring** between the UI/action layer and that adapter layer, plus the
**projection** that turns verified webhooks into data the screens render.
