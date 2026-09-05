# PayDash — QA Issues & Systematic Debugging

Hasil manual QA + analisis akar masalah. Status: **BUG B3 (kritikal) ditemukan**, sisanya diverifikasi/berisiko rendah.

Referensi: `docs/DEPLOY_GCP_PRACTICES.md`, `docs/DEPLOYMENT_SUMMARY.md`.

---

## 1. Ringkasan hasil QA (transkrip user)

| # | Item QA | Hasil | Verdict |
|---|---|---|---|
| A1 | App load + no console error | `/en/favicon.ico` → **404** | ⚠️ Minor |
| A2 | `/api/health` | `{"status":"ok","db":"ok"}` | ✅ PASS |
| B3 | Sign-up (email+password) → dashboard | Fetch ke `http://localhost:3000/api/auth/sign-up/email` **diblokir CSP** | ❌ **BUG** |

---

## 2. BUG B3 — Sign-up gagal (CRITICAL)

**Gejala (console):**
```
Connecting to 'http://localhost:3000/api/auth/sign-up/email' violates the Content Security Policy
directive: "connect-src 'self' https://apis.google.com ...". The action has been blocked.
```

**Root cause (systematic debugging):**

1. **Bukti:** client Better Auth memanggil `http://localhost:3000` (bukan origin Cloud Run).
2. **Sumber:** `src/lib/auth-client.ts:7` → `baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"`.
3. **Mengapa env kosong?** Image yang live = **build4** (build **lokal via docker**). `.dockerignore` mengecualikan `.env.*` (hanya `!.env.example`) → **`.env.production` TIDAK masuk build context** → `NEXT_PUBLIC_APP_URL` tidak ter-inline → fallback `http://localhost:3000`.
4. **CSP blocker:** `connect-src 'self' ...` (next.config.ts:81) menolak origin non-self (`http://localhost:3000`) → fetch diblokir.
5. **Catatan:** build2/3 (Cloud Build) aman karena `.gcloudignore` punya `!.env.production` — tapi yang live build4.

**Fix (2 lapis):**

**Fix 1 — Deploy (wajib):** izinkan `.env.production` di `.dockerignore`:
```
.env
.env.*
!.env.example
!.env.production
```
Rebuild (via Cloud Build lebih aman) → deploy → re-test.

**Fix 2 — Hardening kode (disarankan):**
- `auth-client.ts`: hapus `baseURL` (Better Auth pakai origin berjalan) atau jangan fallback ke localhost di prod.
- `auth.ts`: fallback `env.NEXT_PUBLIC_APP_URL` tanpa `"http://localhost:3000"`.

---

## 3. Debug sistematis seluruh QA (A1–G16) — potensi celah

| # | Item | Risiko | Bukti / Verifikasi |
|---|---|---|---|
| A1 | favicon 404 | ⚠️ kosmetik | `public/` kosong (Dockerfile `mkdir -p ./apps/web/public`). Fix: tambah favicon |
| A2 | health db:ok | ✅ | Terverifikasi |
| B3 | sign-up | ❌ | BUG di atas |
| B4 | TEST MODE banner | ✅ Rendah | Banner selalu dirender (`app/layout.tsx` + `top-bar.tsx` pill) — tidak conditional |
| B5 | logout→login, sesi | ⚠️ Menengah | Bergantung Better Auth + cookie; belum dites. Setelah B3 fix, tes ulang |
| C6 | navigasi dashboard | ⚠️ Menengah | Halaman query DB (Prisma). DB kosong → perlu cek empty-state tidak 500; onboarding mungkin minta provider connection |
| C7 | angka data-mono/kanan | ✅ Rendah | Desain konsisten (token `data-mono`) |
| D8 | Google sign-in `/ai-journal` | ✅ Rendah | Domain authorized ✓; CSP `frame-src *.firebaseapp.com` ✓; token diverifikasi server-side |
| D9 | chat Gemini | ⚠️ Menengah | Key v3 berfungsi (dites `200/pong`). Perlu login dulu (D8) |
| D10 | multi-turn konteks | ⚠️ Rendah | Implementasi `messagesToGeminiContents`; perlu tes nyata |
| E11 | agent pages | ⚠️ Rendah | Sama dengan D8–D10 |
| E12 | evaluation dashboard | ⚠️ Rendah | Render statis + data dari Firestore |
| F13 | isolasi per-user | ✅ Rendah | Repository keyed by `users/{uid}` (server-side Admin SDK) |
| G14 | `/dashboard` tanpa login → redirect | ✅ Rendah | Proxy `isPublic`; path protected |
| G15 | webhook POST → 401 | ✅ PASS | Sudah diverifikasi (401) |
| G16 | get-session → null | ✅ PASS | Sudah diverifikasi (null) |

**Prioritas fix:** B3 (blokir login) → build5 → re-test B3–B5 → lalu D8–D10 (perlu login). A1 opsional.

---

## 4. Catatan tambahan (potensi "celah" lanjutan)

- **C6**: beberapa halaman mungkin query relasi dengan FK (mis. `DurableOperation`) yang butuh parent row — DB kosong bisa trigger error; uji tiap halaman setelah login.
- **D9**: pastikan `GEMINI_API_KEY_SECRET_RESOURCE` tidak wajib eksplisit (fallback dari `GOOGLE_CLOUD_PROJECT` + `SECRET_ID` sudah benar di `secrets.ts`).
- **CSP `form-action 'self'`**: form auth Better Auth harus same-origin — sudah benar setelah B3 fix (fetch relatif ke origin).