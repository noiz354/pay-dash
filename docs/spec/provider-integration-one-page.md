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
| Connected-accounts / Split / Transfer | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅* | ✅ | *with connection |
| Compliance KYC | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️* | ✅ | verification outcome via webhook |
| Customer / Invoice / Recurring | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅* | ✅ | *with connection |
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
- **LIVE** activation is refused until a production-grade **kms** backend exists;
  only `local` (TEST) encryption is enabled now.
- Provider SDK models/raw payloads never leak to the UI; provider IDs are resolved
  server-side from the persisted mapping (never from browser input).

## Still to close

- **LIVE activation** — blocked by design until a production-grade `kms` backend
  exists; `kms` is refused for LIVE now.
- **Org-context authz** — the read/write gates use a single-tenant `org_demo`/
  OWNER default; a real multi-tenant session→org→membership lookup is needed to
  replace it (read-path permission gates are ⚠️).
- **KYC verification outcome** — submission is handed off to the provider; the
  verified/action-required result is surfaced via webhook (not yet a production
  provider call).
- **Saved payment methods** — capability slot exists but not yet wired to an
  action + UI.

## Bottom line

> Menyuplai `.env` **menyiapkan kredensial** tetapi **tidak mengaktifkan jalur
> provider** tanpa sebuah koneksi ACTIVE yang dipersist + secret yang di-unseal.
> Setelah rekomendasi #1–#6 + yang tersisa, mata rantai **layar → action → authz →
> adapter → SDK → provider → kembali ke layar** kini tertutup untuk **webhook
> ingress (verify + dedupe + store + projection)**, **money-in**,
> **balance/transactions read**, **refund**, **payout**, **platform
> (connected-account, split, transfer)**, dan **customer / invoice / recurring**
> — semuanya terhadap koneksi TEST yang dikonfigurasi (org-scoped, fail-closed).
> Yang masih berhenti: **aktivasi LIVE**, **authz org multi-tenant**, **hasil
> verifikasi KYC**, dan **saved payment methods**.
