# Provider Integration — one-page readiness (Xendit + Stripe)

> Scope: does a feature travel the full chain **screen → server action → authz →
> adapter → SDK → provider → back to screen**? This is the short version of
> `provider-integration-readiness.md`. It answers *"is `.env` enough?"* with
> evidence, not intent.

## The completeness path

```text
[1] LAYAR  → [2] SERVER ACTION → [3] AUTHZ → [4] ADAPTER → [5] SDK → [6] PROVIDER → [7] BACK TO LAYAR
```

A feature is only ever "done" when **every** hop is crossed with a **real**
connection. Anything that stops before the provider leaves the screen showing
derived/in-memory data, not live provider data.

## Where each capability stops (readiness matrix)

| Capability | 1 | 2 | 3 | 4 | 5 | 6 | 7 | Stops at |
|---|---|---|---|---|---|---|---|---|
| Money-in (hosted link) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅* | ✅ | *with persisted connection |
| Balance read | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅* | ✅ | *with connection |
| Transactions list | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅* | ✅ | *with connection |
| Refund | ✅ | ✅ | ✅ | ✅ | ✅ | ✅* | ✅ | *with connection |
| Payout | ✅ | ✅ | ✅ | ✅ | ✅ | ✅* | ✅ | *with connection |
| Connected-accounts / Split / Transfer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅* | ✅ | *with connection |
| Compliance KYC | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅* | ✅ | *provider outcome (Stripe account verification; Xendit unsupported) |
| Customer / Invoice / Recurring | ✅ | ✅ | ✅ | ✅ | ✅ | ✅* | ✅ | *with connection |
| Saved payment methods | ✅ | ✅ | ✅ | ✅ | ✅ | ✅* | ✅ | *with connection (Stripe PaymentMethod; Xendit unsupported) |
| **Webhook ingest (Xendit)** | ✅ | ✅ | n/a | ✅ | — | ✅ | **⚙️** | 7 → **wired** |
| **Webhook ingest (Stripe)** | ✅ | ✅ | n/a | ✅ | — | ✅ | **⚙️** | 7 → **wired** |

✅ live · ⚠️ partial (stub/mock/needs LIVE or real review) · ❌ missing · ⚙️ wired ·
*needs a persisted ACTIVE TEST connection + unsealed secret (org-scoped, never cross-org).

## Why `.env` alone is not enough

Filling `XENDIT_SECRET_KEY`, `STRIPE_SECRET_KEY`, `SECRET_STORE_*`, webhook tokens
is **necessary but not sufficient**. The provider path is gated at runtime by four
injections. They were intentionally un-wired (fail-closed) — **recommendations #1–#3
are now implemented**:

1. **Connection resolver** — resolves a persisted `PaymentProviderConnection`
   (provider + connectionId + org + mode TEST/LIVE), incl. an org-scoped
   `resolveFirstActive(organizationId)` that picks the first ACTIVE TEST
   connection (never cross-org; single-tenant default `org_demo`). ✅ wired
   `server/repositories/runtime-connection-resolver.ts`.
2. **Secret resolver** — `resolveSecretForConnection` unseals the credential via
   `provider-secrets` (`SecretStore`: local AES-256-GCM for TEST; `kms` for LIVE).
   ✅ wired (fail-closed, no mock downgrade).
3. **Durable stores** — `OperationStore`/`AuditStore` bound to `DurableOperation`/`AuditEvent`.
   ✅ wired (`durable-operation-store.ts`, `audit-event-store.ts`; in-memory fallback in dev).
4. **Webhook projection** — verified + deduped events update canonical resource
   status via the idempotent `projectStatusUpdate` guard (no fake success, no
   terminal regression, no unknown success). ✅ wired (`server/webhooks/project.ts`,
   `domain/payments/projection.ts`, `webhook-maps.ts`).

## Security posture (hard rules)

- A configured provider that **fails** is surfaced as an error — **never** silently
  downgraded to mock success.
- Missing connection/secret stays **fail-closed** (returns `null` / throws), never
  a mock secret.
- **LIVE** activation is gated by a real **kms** secret store: a `KmsEnvelopeClient`
  wraps a per-seal data key, and `assertLiveActivation` refuses to resolve any LIVE
  secret unless the store is `kms` **and** a seal→open round-trip succeeds. With the
  `local` (TEST) store — or no KMS client — LIVE is refused (fail-closed).
- Authorization is always resolved from the **session membership** (org →
  roles), never from the browser; dev/demo falls back to the single-tenant
  `org_demo`/OWNER default, flagged `isDemoFallback`.
- Provider SDK models/raw payloads never leak to the UI; provider IDs are resolved
  server-side from the persisted mapping (never from browser input).

## Now wired (fail-closed)

- **LIVE-activation gate + KMS store** — `KmsSecretStore` (envelope encryption via
  injected `KmsEnvelopeClient`) + `assertLiveActivation` in the runtime resolver.
  In this sandbox there is no cloud KMS, so LIVE stays **refused**; the gate and
  store are tested with a fake KMS. Production go-live still needs a real cloud KMS
  SDK + `SECRET_STORE_KMS_KEY_ID`.
- **Org-context authz** — `org-context.ts` (membership resolver, `authorizeOrgContext`,
  `buildOrgContext`, `OrgContextDb`) + `session-org-context.ts` (`resolveSessionOrgContext`,
  `requireOrgContext`) + `OrganizationMember` model/migration. Actions now derive the
  acting org + role from the session and authorize the permission before a provider
  write. Dev/demo uses the OWNER demo context until a signed-in membership exists.
- **KYC verification outcome** — `verifyKyc` on the Stripe adapter reads the
  connected account's verification requirements and returns VERIFIED /
  ACTION_REQUIRED / FAILED; `verifyKycProvider` routes the outcome through the
  adapter. Xendit (no `verifyKyc`) fails closed to ACTION_REQUIRED.
- **Saved payment methods** — `ProviderSavedPaymentMethod` DTO, Stripe
  `createPaymentMethod` (PaymentMethod + attach), `createProviderSavedPaymentMethod`,
  `createPaymentMethodAction`, and a `SavePaymentMethodDialog` on the billing page.
  Xendit declares `savedPaymentMethods` unsupported so the registry gate is honest.

## Still requiring production infrastructure

- **LIVE go-live** — the gate is real and tested, but a production cloud KMS SDK +
  a live provider key are still needed to actually activate a LIVE connection.
- **True multi-tenant tenant switching** — default org selection uses a single
  `buildOrgContext(memberships)` resolution; a real deployment needs an explicit
  session→active-org context (and webhook event dedupe cross-org is already org-scoped).
- **Webhook-driven KYC outcome** — the adapter returns the provider outcome on
  demand; event-driven updates from a webhook are still surfaced through the
  projection path.

## Bottom line

> Menyuplai `.env` **menyiapkan kredensial** tetapi **tidak mengaktifkan jalur
> provider** tanpa sebuah koneksi ACTIVE yang dipersist + secret yang di-unseal.
> Setelah rekomendasi #1–#6 + yang tersisa, mata rantai **layar → action → authz →
> adapter → SDK → provider → kembali ke layar** kini tertutup untuk **webhook
> ingress (verify + dedupe + store + projection)**, **money-in**,
> **balance/transactions read**, **refund**, **payout**, **platform
> (connected-account, split, transfer)**, **customer / invoice / recurring**,
> **saved payment methods**, dan **KYC verification outcome** — semuanya terhadap
> koneksi TEST yang dikonfigurasi (org-scoped, org-context authz, fail-closed).
> Yang masih butuh infrastruktur produksi: **aktivasi LIVE** (backend `kms` + key
> live), **tenant switching multi-tenant** (pemilihan org aktif dari sesi), dan
> **outcome KYC via webhook**.
