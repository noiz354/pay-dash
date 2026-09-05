# PayDash — Submission Draft (Accelerate AI with Cloud Run)

> Status: draft — siap submit setelah commit+push repo & final smoke test.

## 1. Track / Challenge
- [ ] Pilih track di dropdown (mis. "Gen AI Academy" / "Cloud Run") — **konfirmasi opsi yang tersedia**

## 2. Working Prototype Link
```
https://paydash-web-723420820074.asia-southeast2.run.app
```

## 3. Demo Social Post Link (hashtag #AccelerateAIwithCloudRun)
Draf post (X/LinkedIn) — tempel link post setelah dipublish:
```
🚀 Deployed PayDash — payment-gateway ops dashboard on #AccelerateAIwithCloudRun!
☁️ Cloud Run hosts the Next.js app + Gemini-powered "Secure Merchant Ops Journal".
🔥 Firebase Auth for Google sign-in, Firestore for user-isolated threads,
   Secret Manager for API keys. Try it: https://paydash-web-723420820074.asia-southeast2.run.app
```
- [ ] Post di-publish, link-nya diisi di sini: `___`

## 4. Public Code Repository Link
```
https://github.com/noiz354/pay-dash
```
> Repo sudah PUBLIC. **Belum** termasuk perubahan deploy terakhir (perlu commit+push).

## 5. Brief Description (≤1024 chars) — ~700 chars
```
PayDash is a payment-gateway operations dashboard (Next.js 16) deployed on Cloud Run, with a Gemini-powered "Secure Merchant Ops Journal". User authentication uses Firebase Auth (Google sign-in) with Firebase Admin verifying ID tokens server-side; Firestore stores user-isolated journal threads under users/{uid}/interactions. The journal performs multi-turn interactions with the Gemini API (server-side, model fallbacks), while the Gemini API key is retrieved at runtime from Google Cloud Secret Manager — never exposed to the browser. Backend ops (Better Auth, Xendit test integration, Prisma on Cloud SQL) also run on Cloud Run with Direct VPC. Includes merchant-ops copilot, failed-payment recovery, and launch-readiness agents, plus an evaluation dashboard.
```

## 6. Services yang digunakan (checkbox)
- [x] User authentication via Firebase
- [x] Multi-turn interaction with the Gemini API
- [x] User-isolated Firestore document storage
- [x] Secure API key retrieval via Google Cloud Secret Manager
- [x] Others (dijelaskan di description): Cloud Run, Cloud SQL, Secret Manager, Better Auth, Xendit

## Checklist sebelum submit
- [ ] Commit + push perubahan repo (Dockerfile fix, schema+migrasi, .gcloudignore, Dockerfile.migrate, .env.gcp.example, docs)
- [ ] Final smoke test: `/api/health` = `db:ok`, login Google di `/ai-journal`, chat journal jalan
- [ ] Xendit webhook callback URL di-set di dashboard (opsional untuk demo)
- [ ] Cloud SQL di-stop setelah demo (`--activation-policy=NEVER`) untuk hemat biaya