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
