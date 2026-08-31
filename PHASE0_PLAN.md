# Phase 0+ Execution Plan — Self-First, Swappable to Production

> Goal: full baseline (`docs/STACK.md:7-28`), lightweight self-host, every adapter swappable to managed via env + 1 file. Committed to git incrementally.

## Locked Decisions
- DB: `postgres:16-alpine` local volume → ntu Neon/Supabase (ganti `DATABASE_URL`)
- Auth: Better Auth + Prisma (MIT) → ntu Clerk (ganti `lib/auth.ts`)
- Analytics: `lib/analytics.ts:track()` wrapper, self no-op → ntu Umami (selected, MIT, Node+Postgres, ~400MB idle). Plausible (AGPL) dan PostHog (Kafka+ClickHouse) sebagai alternatif.
- Deploy: dual — Vercel (primary) + self-host Docker (`docker compose up --build`); `output:"standalone"` diabaikan Vercel
- i18n: `en-US` + `id-ID`
- Hero: `three`/R3F/drei `dynamic(ssr:false)` sekarang
- Prinsip swap: semua adapter via single `.env` + 1 file adapter → ganti `.env` saja

## Task List

### T1 ✅ Env + Zod + server-only + pino + analytics
- `src/lib/env.ts` (t3-oss/env-nextjs + zod), `src/lib/logger.ts` (pino), `src/lib/analytics.ts` (`track()` swappable)
- Verifikasi: `pnpm typecheck`

### T2 🔜 Prisma schema + lib/db/prisma.ts + compose db
- `prisma/schema.prisma` (Postgres, User/Account/LedgerEntry placeholder), `lib/db/prisma.ts`, `compose.yaml` (web + postgres:16-alpine, volume ./data/pg), `.dockerignore`
- Verifikasi: `docker compose up -d db && pnpm prisma migrate dev`

### T3 🔜 Dockerfile + .dockerignore + next standalone + /api/health
- `Dockerfile` 4-stage (base→deps→builder→runner `node:22-alpine`), `next.config.ts {output:"standalone"}`, `app/api/health/route.ts`, handle pnpm symlink (`cp -rL`)
- Verifikasi: `docker build -t web:local . && docker run -p 3000:3000 web:local` → `GET /api/health 200`, image <200MB

### T4 🔜 Security headers + DAL server-only
- `next.config.ts` headers (CSP, HSTS, nosniff, XFrame, Referrer, Permissions), `server/dal/*`, `server-only` guard
- Verifikasi: `curl -I localhost:3000` headers ada

### T5 🔜 Better Auth + shadcn lengkap
- `lib/auth.ts` (Better Auth + Prisma adapter), `shadcn add input/label/dialog/dropdown-menu/table/toast`, `features/auth/*`
- Verifikasi: register/login flow lokal jalan

### T6 🔜 xendit-node + webhook verify/dedupe
- `lib/xendit.ts` (xendit-node@7.0.0 server-only), `app/api/webhooks/xendit/route.ts` (verify `x-callback-token`, dedupe `event_id`, 200 cepat, queue placeholder)
- Verifikasi: `curl -H "x-callback-token: $TOKEN" POST /api/webhooks/xendit`

### T7 🔜 next-intl en-US/id-ID + motion
- `i18n/routing.ts`, `request.ts`, `messages/en-US.json`, `id-ID.json`, update `[locale]/layout.tsx`
- Verifikasi: `/en/dashboard` vs `/id/dashboard` ganti bahasa

### T8 🔜 Analytics wrapper Umami adapter
- `lib/analytics.ts` → Umami client via `NEXT_PUBLIC_UMAMI_URL` (self no-op dulu, swap via env)
- Verifikasi: `track("payment_viewed")` masuk dashboard Umami

### T9 🔜 Hero 3D dynamic(ssr:false)
- `components/three/hero.tsx` (`"use client"`, Canvas/R3F/drei + motion), dashboard import via `dynamic(()=>import(),{ssr:false})` + fallback skeleton
- Verifikasi: hero render tanpa SSR, tidak tambah bundle awal

### T10 🔜 Testing + CI + dual deploy
- `vitest + RTL + playwright smoke`, `.github/workflows/ci.yml`, Vercel deploy + `docker/build-push-action`
- Verifikasi: CI hijau, `docker compose up --build` jalan

## Checkpoints
- Tiap tugas: `pnpm typecheck && pnpm build && docker build` hijau
- Final: `/`, `/en/dashboard`, `/id/dashboard` render, TEST MODE `#d97706`, `data-mono` right, `label-caps` sticky

## References
- `docs/STACK.md`, `docs/ARCHITECTURE.md`, `docs/adr/0001`-`0005`, `INTEGRATION.md`, `design-system/*/DESIGN.md`, `PROGRESS.md`, `AGENTS.md`
