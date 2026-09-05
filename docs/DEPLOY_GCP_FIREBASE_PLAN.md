# PayDash — Firebase Auth Integration + GCP Deploy Plan

Target project: `gen-lang-client-0170811162` (Gemini 3 hackathon, billing aktif `012515-52824D-3783CD`)
Repo: `apps/web` (Next.js 16 standalone, Prisma/Postgres, Xendit+Stripe, Better Auth, AI Journal w/ Firebase)

## Status Firebase (verified via API)

| Item | Status |
|---|---|
| Firebase Web App | ✅ ACTIVE — "Simply-2days" `1:723420820074:web:40a9516b065b0e60a05013` |
| Google sign-in IdP | ❌ `404 CONFIGURATION_NOT_FOUND` — belum di-enable |
| Authorized domains | ❌ belum di-set |
| Firestore (default DB) | ✅ ada |
| Secrets | ✅ `firebase-api-key` (API key Gemini, prefix `AIza`), `firebase-sa-key` (SA JSON) |

Firebase Web App config (public, dari console):

```js
const firebaseConfig = {
  apiKey: "AIzaSyBxMaUuqCw8gHHOr1Hycrm06twd8xE30gU",
  authDomain: "gen-lang-client-0170811162.firebaseapp.com",
  projectId: "gen-lang-client-0170811162",
  storageBucket: "gen-lang-client-0170811162.firebasestorage.app",
  messagingSenderId: "723420820074",
  appId: "1:723420820074:web:40a9516b065b0e60a05013"
};
```

## Fase 0 — Firebase Auth (console, manual)

1. Firebase console → **Authentication → Sign-in method → Google → Enable**
   (auto-create OAuth web client; code path: `src/lib/firebase/client.ts` `signInWithPopup`/`signInWithRedirect`)
2. Authorized domains → tambah URL Cloud Run setelah deploy

## Fase 1 — Wiring ke aplikasi (lokal)

- SDK sudah ada di repo (pnpm; `firebase/app`, `firebase/auth` di `lib/firebase/client.ts`) — **tanpa** `npm install firebase`
- Isi `apps/web/.env.local`:
  - `NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyBxMaUuqCw8gHHOr1Hycrm06twd8xE30gU`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=gen-lang-client-0170811162.firebaseapp.com`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID=gen-lang-client-0170811162`
  - `NEXT_PUBLIC_FIREBASE_APP_ID=1:723420820074:web:40a9516b065b0e60a05013`
- Server (`src/server/firebase/admin.ts`): dukung `FIREBASE_SERVICE_ACCOUNT_JSON` **atau** ADC (`applicationDefault()`)
  → pilih ADC dengan runner SA di Cloud Run; lokal bisa `firebase-sa-key` → `FIREBASE_SERVICE_ACCOUNT_JSON`
- Verifikasi: `pnpm --filter web dev` → `/ai-journal` → login Google
- Escape hatch non-prod: `AI_JOURNAL_ALLOW_TEST_AUTH=true` (jangan di-prod)

## Fase 2 — Deploy ke `gen-lang-client-0170811162` (runbook `docs/DEPLOY_GCP.md`)

1. `gcloud services enable sqladmin.googleapis.com` → buat Cloud SQL Postgres 16 (private IP) + user `paydash_app`
2. Secret Manager: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SENTRY_DSN`, `PAYMENTS_PUBLIC_ORIGIN`, `GEMINI_API_KEY`
3. Build image (build-time `NEXT_PUBLIC_FIREBASE_*`) → Artifact Registry repo `paydash`
4. `gcloud run deploy paydash-web` — runner SA + roles:
   `secretmanager.secretAccessor`, `cloudsql.client`, `cloudkms.cryptoKeyEncrypterDecrypter`, `firebaseauth.admin`, `datastore.user`, `run.invoker`
5. Job `prisma migrate deploy` (idempotent; jangan `db push` di prod)
6. Tambah URL Cloud Run → Firebase **Authorized domains**
7. Smoke test browser

## Fase 3 — Verifikasi

- `curl $URL/api/health` = 200
- `$URL/api/ai-journal/firebase-config` → `configured: true`
- Browser: login Google di `/ai-journal`, chat jalan, sign-out
- Webhook Xendit/Stripe test
- Cloud Logging: `severity>=ERROR` kosong

## Risiko

- Project `gen-lang-client-*` otomatis dibuat AI Studio → **bisa dihapus/nonaktif kapan saja** (laporan komunitas). Gunakan untuk demo/ideathon; untuk production payment data pakai project GCP sendiri.
- Billing aktif → Cloud SQL + Cloud Run langsung menagih.