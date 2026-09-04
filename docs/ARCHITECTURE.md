# Architecture

## Layout

```
apps/web/src/
  app/[locale]/layout.tsx              # html lang + TEST MODE #d97706 banner
  app/[locale]/{dashboard,payments,customers,...}/page.tsx  # Server Components
  app/api/webhooks/xendit/route.ts     # verify x-callback-token, dedupe, queue
  components/ui/                       # shadcn (button card table dialog ...)
  components/layout/ charts/ three/    # three/ is "use client" + dynamic(ssr:false)
  features/{auth,registration,payments,ledger,analytics}/
  server/dal/ actions/ services/ jobs/ # DAL owns authz + DTO shaping
  lib/{db/prisma.ts, env.ts, auth.ts, analytics.ts, logger.ts, xendit.ts}
  i18n/{routing.ts, request.ts} + messages/{en-US.json,id-ID.json}
  styles/globals.css                   # Kinetic tokens as CSS vars
  instrumentation.ts + instrumentation-client.ts
prisma/schema.prisma
```

Prototype mapping: `screens/mobile|desktop/*/code.html` → `app/[locale]/*` routes; `design-system/*/DESIGN.md` tokens → Tailwind theme.

## Boundaries

1. **Server Components by default.** Add `"use client"` only for: button interaction, modals/dropdowns, charts, animation, Three.js canvas, analytics capture, forms needing client state.
2. **DAL + `server-only`.** Secrets, DB, `xendit-node` calls live in `server/dal` and `lib/xendit.ts`. Never import them into Client Components. `server-only` enforces this.
3. **Webhooks server-only, provider-specific ingress.** `POST /api/webhooks/xendit` verifies `x-callback-token` with a constant-time compare (`INTEGRATION.md:292`); `POST /api/webhooks/stripe` verifies the raw-body HMAC signature with the pinned webhook secret (ADR-0028). Both parse, dedupe by a provider-scoped event key (`event_id` / `stripe:<event_id>`), respond 200 fast, and queue work.

## Data Flow

```
Browser (shadcn/ui) -> Server Action / Route Handler -> Zod validate -> DAL (authz) -> Prisma / xendit-node -> audit log
Xendit -> POST /api/webhooks/xendit -> verify -> dedupe -> queue -> process -> ledger update
```

## Security Headers

Configure via `next.config.ts` `headers()`: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.

## Observability IDs

Trace every payment with `user_id org_id payment_request_id xendit_payment_id reference_id webhook_event_id idempotency_key currency amount status_before/after`.

## Provider Integration (Xendit + Stripe) — concise readiness

A feature is complete only after it crosses the whole path **screen → server action →
authz → adapter → SDK → provider → back to screen**. Filling `.env` *prepares*
credentials but does **not** activate a provider path: that is gated at runtime by a
persisted connection + a resolvable (unsealed) secret, durable stores, and webhook
projection.

1. **Connection + secret resolution** (`server/repositories/runtime-connection-resolver.ts`)
   resolves a persisted ACTIVE `PaymentProviderConnection` and unseals its
   `SecretRecord` via `SecretStore` (local AES-256-GCM for TEST; `kms` refused for
   LIVE). Missing connection/secret stays **fail-closed** — no mock downgrade.
2. **Durable stores** (`durable-operation-store.ts`, `audit-event-store.ts`)
   bind `OperationStore`/`AuditStore` to `DurableOperation`/`AuditEvent`; in-memory
   fallback in dev. Idempotency + audit intact.
3. **Webhook projection** (`server/webhooks/project.ts`, `domain/payments/projection.ts`,
   `webhook-maps.ts`) turns verified + deduped events into idempotent canonical
   status updates — no fake success, no terminal regression, no unknown-success.

Still to close: read-path adapter wiring (balance/transactions), refund/payout action +
UI wiring, and the connected-accounts / KYC / platform-routing modules. Full matrix:
`docs/spec/provider-integration-readiness.md`; one-page version:
`docs/spec/provider-integration-one-page.md`.
