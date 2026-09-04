# Stack — Golden Path

Lean production baseline. Install only Day-1 set first; add Deferred when proven needed.

## Day-1 Baseline

| Area | Choice |
|---|---|
| Framework | Next.js App Router + TypeScript |
| Runtime | Node 20.9+ + pnpm (`.nvmrc`, `pnpm-lock.yaml`) |
| Styling | Tailwind (`@tailwindcss/postcss`, `postcss.config.mjs`, `@import "tailwindcss"`) |
| UI | shadcn/ui + Radix + `lucide-react` |
| Tokens | `design-system/*/DESIGN.md` → CSS vars → Tailwind theme |
| Validation | Zod + `server-only` + `@t3-oss/env-nextjs` |
| DB/ORM | PostgreSQL + Prisma (`prisma migrate deploy` in prod) |
| Auth | Clerk (or Better Auth) — one only |
| API | Server Actions + Route Handlers (`/api/webhooks/xendit`) |
| Client data | Next `fetch` cache/revalidation |
| i18n | `next-intl` + `app/[locale]` (start `en-US` only if single market) |
| Animation | CSS/Tailwind + `motion` (Motion for React) |
| Tracking | `track(event, props)` wrapper (business events) |
| Analytics | Plausible or PostHog — one only |
| Observability | Sentry (`@sentry/nextjs`) + `@vercel/otel` + pino + `useReportWebVitals` |
| Testing | Vitest + RTL + Playwright |
| Security | DAL + `server-only` + Zod + headers (CSP/HSTS) + `x-callback-token` + idempotency + Redis rate limit |
| Payments | `xendit-node` server-only (see `INTEGRATION.md`) |
| Deploy | Vercel (or Docker `output: "standalone"` if self-host) |
| CI | GitHub Actions (`actions/setup-node`, `pnpm --frozen-lockfile`, typecheck/lint/test/build/e2e) |

## Install

```bash
pnpm create next-app@latest apps/web --typescript --eslint --app --src-dir --import-alias "@/*"

pnpm add tailwind-merge clsx class-variance-authority lucide-react
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card input label dialog dropdown-menu table toast

pnpm add zod server-only
pnpm add @t3-oss/env-nextjs pino

pnpm add @prisma/client
pnpm add -D prisma

# auth - pick ONE
pnpm add @clerk/nextjs
# or: pnpm add better-auth

pnpm add next-intl motion

pnpm add xendit-node nanoid

pnpm add @sentry/nextjs @vercel/otel

pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom
pnpm add -D @playwright/test
```

Payment reliability:

```bash
pnpm add nanoid
```

## Deferred (now documented)

`three @react-three/fiber @react-three/drei @types/three` (3D hero), `@tanstack/react-query` (polling), S3/R2, Resend/Postmark, Flagsmith — see `docs/STACK.md` install blocks.
- Storybook → `docs/STORYBOOK.md`
- Postgres FTS → Meilisearch/Typesense → `docs/SEARCH.md`
- Inngest/Trigger.dev/BullMQ + Redis → `docs/QUEUES.md`

## Scripts

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "typecheck": "tsc --noEmit",
  "lint": "eslint .",
  "test": "vitest",
  "test:e2e": "playwright test"
}
```

> `next lint` is removed in Next.js 16 — use `eslint` directly.

## Env (validate at startup)

`DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `APP_ENV`, `SENTRY_DSN`, `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SECRET_STORE_MODE`/`SECRET_STORE_KEY`/`SECRET_STORE_KMS_KEY_ID`, `PAYMENTS_PUBLIC_ORIGIN`, `CLERK_*` or Better Auth keys, `REDIS_URL` (when added). A runnable template is at `apps/web/.env.example`.
