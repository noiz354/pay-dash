# PayDash — Deployment Summary (±200 kata)

**PayDash — Payment-Gateway Dashboard + Gemini AI Journal**

Kami membangun PayDash, dashboard operasi payment gateway (Next.js 16 + TypeScript, monorepo pnpm) dengan **AI-agent "Secure Merchant Ops Journal"** yang di-deploy ke Google Cloud Platform.

**URL live:** https://paydash-web-723420820074.asia-southeast2.run.app
**Repo publik:** https://github.com/noiz354/pay-dash

**Arsitektur AI-agent (fokus utama):**
- **Firebase Auth** — login Google; token diverifikasi server-side via Firebase Admin
- **Firestore** — thread journal ter-isolasi per-user di `users/{uid}/interactions`
- **Gemini API** — interaksi multi-turn dengan model fallback (`gemini-3.6-flash` → `…3.7-flash`)
- **Secret Manager** — API key Gemini diambil saat runtime, tidak pernah ke browser
- **Cloud Run** — hosting Next.js + backend (Better Auth, Xendit, Prisma/Cloud SQL, Direct VPC)

Agent di dalamnya: **Merchant Ops Copilot**, **Failed-Payment Recovery**, **Launch Readiness**, plus evaluation dashboard.

**Credential utama:**
- GCP project: `gen-lang-client-0170811162` (billing `012515-52824D-3783CD`)
- Firebase web app: `1:723420820074:web:40a9516b065b0e60a05013`
- Xendit TEST key: `xnd_development_…` (folder `xendit-key/`, di Secret Manager)
- Gemini key: `AQ.Ab8RN6JD…` (secret v3)
- Health: `/api/health` → `db:ok` ✅

Stack: 4-stage Dockerfile (standalone), Gen2 + Direct VPC, `db-f1-micro`, migrasi via Cloud Run job.