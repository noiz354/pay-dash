# PayDash — GCP Deployment Practices (Lessons Learned)

Ringkasan praktik deploy PayDash (`apps/web`) ke Google Cloud — apa yang **berhasil**, apa yang **gagal**, root cause, dan fix-nya. Diambil dari eksekusi nyata (Sep 2026) ke project `gen-lang-client-0170811162`.

Referensi: `docs/DEPLOY_GCP.md` (runbook), `docs/DEPLOY_GCP_FIREBASE_PLAN.md` (rencana).

---

## 1. Rangkuman hasil

| Area | Status |
|---|---|
| Cloud Run `paydash-web` | ✅ LIVE — `https://paydash-web-723420820074.asia-southeast2.run.app` |
| Health `/api/health` | ✅ `db:ok` |
| Better Auth `/api/auth/get-session` | ✅ 200 |
| Firebase Auth (Google sign-in) | ✅ enabled + authorized domain |
| Prisma migrations | ✅ 11 migrasi via Cloud Run job |
| Gemini journal | ⚠️ terblokir billing key (prepayment depleted / key salah API) |
| Xendit webhook callback | ⏳ belum di-set di dashboard |

---

## 2. Praktik yang BERHASIL

### 2.1 Keamanan secret
- `.gitignore` + `.gcloudignore` mengecualikan: `xendit-key/`, `.env*` (kecuali `.env.example`/`.env.gcp.example`/`.env.production`), `*.pem`, `*.key`.
- Semua secret produksi di **Secret Manager**; hanya `NEXT_PUBLIC_*` (publik) di build-time `.env.production`.
- `.env.gcp.example` sebagai template dengan **default kosong**, mengecualikan Xendit/Stripe.

### 2.2 Cloud SQL (paling murah & benar)
- `db-f1-micro` (≈$8/bln compute) — **wajib `--edition=enterprise`** (default `ENTERPRISE_PLUS` menolak shared-core).
- Private IP (`--no-assign-ip`) + VPC + **Service Networking**: enable `servicenetworking`, alloc range, `vpc-peerings connect`.
- PITR dimatikan untuk hemat biaya; backup otomatis 02:00.
- Idle cost: `--activation-policy=NEVER` untuk hentikan tagihan compute (storage tetap).

### 2.3 Cloud Run + Direct VPC
- **Direct VPC egress** (tanpa connector = lebih murah): `--network=paydash-vpc --vpc-egress=private-ranges-only`.
- **WAJIB `--execution-environment=gen2`** — Direct VPC hanya didukung Gen2 (lihat §3.6).

### 2.4 Migrasi database (dari dalam VPC)
- Cloud SQL private IP **tidak bisa dijangkau laptop** → jalankan migrasi via **Cloud Run job in-VPC** dengan image migrasi khusus (`Dockerfile.migrate`, `prisma migrate deploy`).
- `prisma migrate deploy` idempotent — aman untuk deploy ulang.
- Delta migrasi (tabel yang belum ada) dibuat dengan `prisma migrate diff --from-url <db> --to-schema-datamodel schema.prisma --script`.

### 2.5 Prisma di Docker standalone (fix penting)
- **Runner HARUS menyalin `node_modules` dari tahap `builder`** (yang menjalankan `prisma generate`), bukan dari `deps`.
- `pnpm install` postinstall `@prisma/client` TIDAK menemukan schema (virtual store) → client tidak ter-generate → runtime error `@prisma/client did not initialize yet`.

### 2.6 Firebase
- Verifikasi integrasi via API (read-only): `GET defaultSupportedIdpConfigs/google.com`, `webApps`, `getProjectConfig`.
- Google sign-in: enable di console (auto-create OAuth web client); authorized domains muncul otomatis.
- Firebase Admin via `FIREBASE_SERVICE_ACCOUNT_JSON` (secret) atau ADC runner SA (`firebaseauth.admin`, `datastore.user`).
- `firebase-config` runtime endpoint (`force-dynamic`) — config tidak di-inline di build.

### 2.7 Secret rotation tanpa redeploy
- `gcloud secrets versions add` → `:latest` terpakai otomatis oleh runtime (journal baca key via Secret Manager API per request).

### 2.8 Docker push (tanpa helper)
- `docker-credential-gcloud` tidak ada → hapus `credHelpers` di `~/.docker/config.json`, lalu:
  `docker login -u oauth2accesstoken -p "$(gcloud auth print-access-token)" <registry>` → `docker push`.

### 2.9 Build panjang
- `gcloud builds submit --async` atau **build lokal + `docker push`** (progress streaming, bebas upload source ke GCS).

---

## 3. Praktik yang GAGAL → root cause → fix

| # | Gagal | Root cause | Fix |
|---|---|---|---|
| 3.1 | `gcloud builds submit` forbidden bucket | Config aktif = project `bf7c8` (tanpa billing); bucket Cloud Build pakai project aktif | Selalu `--project=<project>` eksplisit |
| 3.2 | Cloud SQL create `Invalid Tier` | Default edition `ENTERPRISE_PLUS` tidak dukung shared-core | `--edition=enterprise` |
| 3.3 | Cloud SQL create `SERVICE_NETWORKING_NOT_ENABLED` | Private IP butuh peering Service Networking | enable API + alloc range + `vpc-peerings connect` |
| 3.4 | Migrasi dari laptop `P1001 Can't reach` | Private IP (RFC1918) tidak routable dari luar VPC | Migrasi via Cloud Run job in-VPC |
| 3.5 | `cloud-sql-proxy` gagal ADC | `gcloud auth login` ≠ ADC | `gcloud auth application-default login` |
| 3.6 | Health `db:error` (service), job sukses | Service default **Gen1**; Direct VPC hanya Gen2 | `--execution-environment=gen2` |
| 3.7 | Health `db:error` setelah gen2 | (lanjutan 3.6) | gen2 + annotation `network-interfaces` + `vpc-access-egress` |
| 3.8 | Prisma `did not initialize yet` | Runner salin node_modules dari `deps` (client belum di-generate) | Salin dari `builder` (3.5 di atas) |
| 3.9 | Prisma `@prisma/client` postinstall tanpa schema | pnpm jalankan postinstall di virtual store, bukan `apps/web` | Generate eksplisit di builder; runner dari builder |
| 3.10 | `gcloud builds submit --config=-` | Butuh stdin (heredoc) | Pakai file config (`cloudbuild.yaml`) |
| 3.11 | `docker push` gagal credentials | `docker-credential-gcloud` tidak ada; `credHelpers` memaksanya | Hapus `credHelpers` + `docker login` token |
| 3.12 | `prisma migrate` di laptop `P1010 denied` | Port 5433 dipakai container test → konek ke Postgres salah | Isolasi port; proxy di 5434 |
| 3.13 | ADC quota project salah (`bf7c8`) | Login ADC ambil project aktif config | `gcloud auth application-default set-quota-project` |
| 3.14 | Schema Prisma invalid (relasi `webhookDeliveries` tanpa back-relation) | Schema WIP; wave0 migration asli TANPA FK organizationId | Hapus relasi (bukan tambah FK) agar konsisten dengan test+migrasi |
| 3.15 | 5 tabel hilang (`user/session/account/verification/LedgerEntry`) | Migrasi tidak lengkap vs schema | Migrasi drift baru (lihat 2.4) |
| 3.16 | 15/582 test gagal | Butuh `DATABASE_URL` (env tidak dimuat vitest) | Set `DATABASE_URL` ke test-Postgres |
| 3.17 | 6/582 test tetap gagal | Test fixture tidak buat parent row untuk FK (DurableOperation dll.) | Pre-existing; bukan regresi deploy |
| 3.18 | Gemini `429 prepayment credits depleted` | Key mode **prepayment**; prepaid habis | Top up, atau key Cloud-billed (credit $150) |
| 3.19 | Gemini key `403 API_KEY_SERVICE_BLOCKED` | Key **Agent Platform API** ≠ Generative Language API | Pakai key Gemini API biasa; jangan key Agent Platform |

---

## 4. Checklist non-fungsional (biaya & keamanan)

- [ ] Cloud SQL idle: `gcloud sql instances patch paydash-db --activation-policy=NEVER` (storage tetap; resume dengan `ALWAYS`).
- [ ] Cloud Run `--min-instances=0` → $0 saat idle.
- [ ] Rotasi secret setelah submission (Gemini key sudah ter-paste di chat).
- [ ] Xendit callback URL di dashboard (webhook event).
- [ ] Untuk production payment: project GCP terpisah (bukan `gen-lang-client-*` yang auto-generated & bisa hilang).

---

## 5. Perintah cepat yang selalu dipakai

```bash
P=gen-lang-client-0170811162; R=asia-southeast2
gcloud config set project $P
gcloud auth application-default set-quota-project $P
gcloud run services describe paydash-web --region=$R --project=$P --format="value(status.url)"
curl -s "$(gcloud run services describe paydash-web --region=$R --project=$P --format='value(status.url)')/api/health"
```