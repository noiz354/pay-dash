# Agents for Humans — Submission Readiness (Pre-Submission Audit)

> Audit read-only, tidak ada source code yang diubah.
> Audit timestamp: **2026-09-14 10:27 WIB** (2026-09-13 20:27 PDT)
> Sumber primer: Official Rules (https://agentsforhumans.devpost.com/rules) + audit repo `noiz354/pay-dash`.

---

## Deadline

- [x] Official deadline: **Monday, September 14, 2026, 5:00 PM PDT** (Rules §1; = 8:00 PM EDT)
- [x] Local deadline (Negeri Sembilan, MYT/UTC+8): **Tuesday, September 15, 2026, 08:00 MYT**
- [x] Local deadline (Jakarta, WIB/UTC+7): Tuesday, September 15, 2026, 07:00 WIB
- [x] Current remaining time saat audit: **±20 jam 33 menit**
- [x] Status: **URGENT** (< 24 jam)

---

## Eligibility

- [x] **BLOCKER TERKONFIRMASI.** Official Rules §3 "The Hackathon IS NOT open to" menyebutkan secara eksplisit:
  > "Individuals who are residents of, or Organizations domiciled in, a country … (including, but not limited to, Argentina, Australia, Brazil, Hong Kong, **Indonesia**, Italy, **Malaysia**, Philippines, Thailand, Vietnam, Singapore, …)"

  Peserta berlokasi di **Malaysia** (Negeri Sembilan) — dan **Indonesia** juga dikecualikan (relevan bila ada anggota tim di Indonesia). Sesuai aturan §0 prompt: **BLOCKER — jelaskan sebelum melanjutkan**.
- [ ] Usia ≥ age of majority: **UNKNOWN / NEEDS VERIFICATION** (tidak dapat dibuktikan dari repo)
- [ ] Devpost account: **UNKNOWN** (tidak dapat dibuktikan dari repo)
- [ ] AWS Builder ID: **UNKNOWN** (tidak dapat dibuktikan dari repo)
- [ ] Konfirmasi ke Devpost support (apakah ada pengecualian/klarifikasi untuk residence rule): **BELUM DILAKUKAN** — wajib sebelum aktivitas submission dilanjutkan

**Konsekuensi:** sesuai Official Rules, submission oleh resident Malaysia/Indonesia tidak eligible. Ini P0 #1 dan meniadakan P0 lain selama belum diklarifikasi.

---

## Track

- [x] **Recommended track: Professional Agents**
- [x] Why: AI agent "Merchant Ops Copilot" / "Failed Payment Recovery" / "Launch Readiness" membaca ledger, balance, payouts, webhook, risk lalu menyusun ops brief + recovery plan — audiensnya operator/merchant payment-gateway (pekerja profesional), bukan individu sehari-hari. Bukti: `apps/web/src/app/[locale]/ai-journal/ops-copilot/page.tsx`, `recovery-agent/page.tsx`, `readiness-agent/page.tsx`.
- [x] Alternative track: Everyday Agents (bila diposisikan sebagai "pedagang kecil kelola pembayaran harian") — kurang pas karena fokus produk = ops tim keuangan/merchant platform.
- [x] Why not Good Neighbor: tidak ada dimensi komunitas/sosial.
- [ ] Track dipilih di Devpost: **UNKNOWN**

---

## Mandatory Requirements (Official Rules §4 — verified dari halaman rules)

| # | Requirement resmi | Status | Evidence |
|---|---|---|---|
| 1 | Project dibangun dengan **Strands Agents SDK** | ❌ FAIL | `grep -ri "strands"` seluruh repo (excl. node_modules/lock): **0 hasil**; `package.json` & `apps/web/package.json` tanpa dependency strands/bedrock/agentcore |
| 2 | PUBLIC URL repo + source/assets/instructions lengkap | ✅ PASS | `gh repo view` → `isPrivate:false`; PR #17 publik; setup instructions ada (partial) |
| 3 | **MIT/Apache license file**, "detectable and visible at the top of the repository page (About section)" | ❌ FAIL | `licenseInfo:null`; tidak ada file `LICENSE` di working tree maupun seluruh history git (`git log --all -- LICENSE` kosong) |
| 4 | README | ⚠️ PARTIAL | Ada (`README.md`) tetapi isinya lama ("static UI mockups"); **0 mention** agent/Gemini/AI/Strands |
| 5 | Architecture Diagram | ⚠️ PARTIAL | Ada mermaid di `AWS_MIGRATION_PLAN.md`, `AWS_LOW_COST_DEPLOYMENT.md`, `docs/SPEC-provider-domain.md`, dll. — tetapi tidak ada diagram submission-facing di README yang menampilkan alur agent; dan diagram yang ada tidak memuat Strands (karena tidak dipakai) |
| 6 | Video ≤ 5 menit di YouTube/Vimeo **public** (demo + pitch: problem/who/why) | ❓ UNKNOWN | Tidak ditemukan link video di repo (`grep youtube|vimeo` → 0); hanya panduan konten di `docs/AI_JOURNAL_CLOUD_RUN.md:173` |
| 7 | AWS Builder ID | ❓ UNKNOWN | Tidak dapat diverifikasi dari repo |
| 8 | Text description (Devpost) | ❓ UNKNOWN | Field Devpost, di luar repo |
| 9 | Testing access gratis untuk judge | ✅ PASS | Live URL publik `https://paydash-web-723420820074.asia-southeast2.run.app` (Cloud Run, TEST MODE, `/api/health` → `db:ok`) |
| 10 | Bahasa: semua materi submission English | ⚠️ PARTIAL | `README.md` English ✓; banyak dokumen repo berbahasa Indonesia — materi submission (description/video/testing instructions) harus English |
| 11 | New Projects Only + disclosure pre-existing work | ⚠️ RISK | Git history hanya 3 commit (semua 13–14 Sep 2026) — **tidak bisa membuktikan** periode pembuatan dari git; docs ber-tanggal 31 Agu–13 Sep mengindikasikan dikerjakan dalam periode. Dashboard payment = komponen pre-existing → **wajib disclosure** (Rules §4) |
| 12 | Live demo (opsional, menaikkan Technical Implementation) | ✅ ADA | URL publik Cloud Run GCP (bukan AWS — dicatat di §Architecture) |
| 13 | Blog builder.aws.com (opsional/bonus) | ❌ BELUM ADA | Rules: "Should use **Agents for Humans** in the Title" (persyaratan hashtag sudah dihapus per update 8/12/26) |

**Mandatory terkonfirmasi: 2/8 (public repo, testing access) — dengan 1 BLOCKER eligibility di luar checklist teknis.**

---

## Repository

- [x] PUBLIC: `https://github.com/noiz354/pay-dash` (`isPrivate:false`)
- [x] Dapat di-clone: `git clone https://github.com/noiz354/pay-dash.git` ✓
- [x] Source lengkap: `apps/web` (Next.js 16 + Prisma + MCP + Gemini journal), `Dockerfile`, `Dockerfile.migrate`, `compose.yaml`, CI `.github/workflows/ci.yml`
- [x] Tidak ada private submodule (`git submodule` kosong)
- [x] Lockfile ada: `pnpm-lock.yaml` ✓
- [ ] Fresh-clone setup test: **NOT EXECUTED** (sandbox tanpa `node_modules`; butuh pnpm install + Postgres + Firebase + keys — didokumentasikan sebagai prerequisite)

---

## Strands Audit (Core Requirement)

- [ ] Strands dependency benar-benar digunakan — **FAIL**: 0 referensi di seluruh repo termasuk lockfile
- [ ] Agent dibuat dengan Strands — **FAIL**: agent dibangun di atas **Gemini function calling + Model Context Protocol (MCP)**, bukan Strands
- [ ] Bukan sekadar wrapper API — ⚠️ di luar SDK: arsitektur agentik nyata (loop function-call `MAX_TOOL_ROUNDS=3`, model fallback ladder, Firestore state) — `apps/web/src/server/ai-journal/gemini.ts:11-19`
- [ ] Tools/function calling — ✅ (di Gemini, bukan Strands): `xendit-read.ts`, MCP tools di `apps/web/src/server/mcp/domain-tools.ts` (ledger/balance/payouts/webhook/refund)
- [ ] Autonomous reasoning/decision flow — ⚠️ PARTIAL: multi-round tool loop + fallback, tapi belum ada bukti decision flow otonom lintas-aksi
- [ ] End-to-end workflow — ✅ dalam scope journal (trigger → gather context → tools → hasil → tersimpan di Firestore per-user)
- [ ] State/context — ✅ Firestore `users/{uid}/interactions` (firestore.rules, ADR-0029)
- [ ] Error handling — ✅ `RECOVERABLE_GEMINI_STATUS = {404,429,500,503}` + fallback ladder (`gemini.ts:7-15`)
- [ ] Human escalation / approval — ❓ UNKNOWN: dual-control ada di dashboard; apakah tool tulis (mis. `refundTransaction` di `domain-tools.ts`) di-gate approval saat dipanggil agent — **perlu verifikasi kode lebih dalam**

**Verdict Strands: FAIL (P0).** Kode agentik ada dan nyata, tetapi dibangun di stack Gemini+MCP, bukan Strands Agents SDK — persyaratan inti hackathon tidak terpenuhi.

---

## Architecture (vs kebutuhan submission)

- [x] Diagram yang ada: mermaid di `AWS_MIGRATION_PLAN.md` & `AWS_LOW_COST_DEPLOYMENT.md` (infra AWS), `docs/spec/SPEC-provider-domain.md`
- [ ] Diagram menampilkan Strands — **FAIL** (Strands tidak dipakai)
- [ ] Diagram menampilkan AWS services untuk submission ini — **FAIL**: deployment hidup di **GCP Cloud Run + Cloud SQL + Firebase + Gemini**; dua dokumen AWS saya adalah *rencana migrasi*, bukan realitas deployment
- [ ] Data flow agent (trigger→tools→result) — ⚠️ hanya di dokumen UX research, tidak di README

---

## Demo

- [ ] Video demo ≤ 5:00, public YouTube/Vimeo — **UNKNOWN** (tidak ada link; belum dibuat/terverifikasi)
- [ ] Golden path (diusulkan, durasi est. 2–3 menit): login → `/ai-journal/ops-copilot` → minta "ops brief harian" → agent memanggil domain tools (balance/ledger/webhook) → brief tersusun dengan sumber data + model yang dipakai. Agent actions: 1–3 tool calls; human interaction: 1 prompt.
- [ ] Demo deterministik (5x run berturut-turut) — **NOT TESTED**

## Live Demo

- [x] Public URL: `https://paydash-web-723420820074.asia-southeast2.run.app` (HTTPS ✓)
- [x] Login blocker: Better Auth/Firebase sign-in — **test credentials perlu dicantumkan di testing instructions** (Rules §4)
- [x] TEST MODE banner aktif (data demo, bukan live payment)
- [x] Tidak ada secret produksi yang ter-expose di UI (key dibaca server-side; bukti `secrets.ts`)
- [ ] Cold start Cloud Run (min-instances=1 per runbook) — acceptable
- [ ] Uptime — **UNKNOWN** (monitor eksternal belum terpasang; uptime check di `docs/DEPLOY_GCP.md` §9 masih rencana)

---

## README

- [ ] Mencerminkan project yang disubmit — **FAIL**: paragraf pembuka masih "static UI mockups"; 0 mention agent/AI/Gemini/Strands/AWS
- [ ] One-line pitch + problem + solution di atas — ❌
- [ ] Screenshot/GIF — ❌ (ada di `screens/*.png` tapi tidak dipakai README)
- [ ] Architecture + Strands usage — ❌
- [ ] Setup / env vars / run locally / deploy / demo — ⚠️ PARTIAL (tersebar di `docs/`, bukan README)
- [ ] Limitations / future work / license — ❌

---

## Security

- [x] Secret scan current tree: **NONE** untuk pola `AKIA…`, `aws_secret`, private keys, `ghp_…`, `sk_live_…` (grep seluruh repo excl. node_modules)
- [x] Secret scan git history (semua commit): **NONE** untuk pola yang sama
- [x] `.env*` & `xendit-key/` & `*.pem/*.key` ter-exclude di `.gitignore`/`.dockerignore` ✓
- [ ] **MEDIUM** — Firebase web API key publik ter-commit di `docs/DEPLOY_GCP_FIREBASE_PLAN.md:20,39` (public by design; pastikan Authorized domains dibatasi di Firebase console)
- [ ] **MEDIUM** — Gemini API key pernah ter-paste di chat (tercatat di `docs/DEPLOY_GCP_PRACTICES.md` §4) → **rotasi key sebelum submission**
- [ ] **LOW** — `.dockerignore`/`.gcloudignore` mengecualikan `.env.production` dari exclude-list padahal file tidak ada — hapus pengecualian agar tidak jadi celah

---

## Tests

- [x] Pipeline CI ada: `.github/workflows/ci.yml` (typecheck → lint → test → build → e2e Playwright)
- [ ] Test run di lingkungan audit ini: **NOT EXECUTED** (tidak ada `node_modules`; install penuh tidak dijalankan demi waktu — deadline URGENT)
- [ ] Known failures terdokumentasi di repo: 6/582 unit test pre-existing failures, bukan regresi deploy (`docs/DEPLOY_GCP_PRACTICES.md` §3.16–3.17) — **harus di-disclose, bukan disembunyikan**
- [ ] Dependency audit (vulnerability scan): **NOT RUN** — `pnpm audit` belum dieksekusi di sandbox
- [ ] Demo-specific test (5x golden path): **NOT TESTED**

---

## Judging Score (estimasi jujur berbasis bukti)

| Category | Score | Alasan |
|---|---|---|
| Technological Implementation | **2/10** | Kode agentik nyata (MCP tools, function-call loop, fallback, tenancy) — tetapi **Strands tidak dipakai sama sekali** (core requirement) → hard cap |
| Design | **6/10** | Design system matang (2 token system, 94 komponen shadcn, UX spec detail) — namun story agent tidak tersaji di README/submission |
| Potential Impact | **6/10** | Ops brief + recovery plan = pain nyata merchant ops; belum ada angka before/after terukur; masih TEST MODE |
| Creativity & Originality | **5/10** | Kombinasi multi-mode agent + MCP + tenant isolation menarik, tapi pola "chat + tools dashboard" tidak orisinal |
| Presentation | **3/10** | Video belum ada; README tidak menjual agent; tidak ada diagram alur agent submission-facing |
| **TOTAL** | **22/50** | **< 35 → NEEDS PRIORITY FIXES** (dan tetap NO-GO karena P0 eligibility + Strands + license) |

---

## P0 — Submission Blockers

1. **Eligibility:** Malaysia & Indonesia secara eksplisit dikecualikan di Official Rules §3 (diverifikasi dari halaman rules resmi). Peserta di Malaysia → **tidak eligible** sampai ada klarifikasi tertulis dari Devpost/Sponsor.
2. **Strands Agents SDK tidak digunakan** (0 referensi repo-wide) — core requirement. Perbaikan nyata = re-implement orchestration agent di atas Strands + akun AWS — **tidak realistis dalam ±20 jam tersisa**.
3. **Tidak ada LICENSE** (MIT/Apache wajib + terlihat di About section GitHub).
4. **README tidak menggambarkan project yang disubmit** (masih "static mockups", 0 kata agent/AI).
5. **Video demo ≤5:00 public** belum ada/terverifikasi.
6. **AWS Builder ID** belum terverifikasi.

## P1 — Score-Critical (setelah P0 beres)

- Pilih track **Professional Agents** + tulis Devpost description (tagline formula: "An autonomous agent that [meringkas operasi pembayaran harian] for [merchant/ops tim] so they no longer need to [cek 5 dashboard manual]").
- Diagram arsitektur submission-facing yang menampilkan alur agent (trigger → gather → tools → result → approval) + Strands + AWS.
- Verifikasi HITL: refund/payout tool harus di-gate approval; demo-kan approval boundary (nilai plus).
- Observability agent di UI (status step "gathering context → calling tool → completed" — jangan tampilkan raw CoT).
- Semua materi submission dalam English; sertakan test credentials untuk judge.
- Disclosure komponen pre-existing (dashboard) sesuai Rules §4.

## P2 — Nice to Have

- Blog bonus builder.aws.com: judul wajib memuat **"Agents for Humans"** (persyaratan hashtag sudah dihapus per update 8/12/26).
- Bersihkan artefak: `apps/web/playwright-report/index.html` ter-commit (hapus + gitignore).
- Rotasi Gemini key (riwayat eksposur), batasi Firebase Authorized domains.
- Screenshot/gif README dari `screens/`.

---

## Final Checklist (sebelum klik Submit — jika P0 eligibility terklarifikasi)

- [ ] Track selected
- [ ] Project title + tagline + description (English)
- [ ] Public repository URL
- [ ] README menggambarkan agent + demo
- [ ] MIT/Apache license (file + About section)
- [ ] Architecture diagram (Strands + AWS + alur agent)
- [ ] Demo video ≤ 5:00 public (YouTube/Vimeo)
- [ ] Video URL teruji incognito
- [ ] AWS Builder ID
- [ ] Live demo URL + test credentials
- [ ] builder.aws.com post (judul memuat "Agents for Humans")
- [ ] Screenshots + technologies
- [ ] Semua URL teruji anonim
- [ ] `git status` bersih; tidak ada secret/artefak ter-commit

---

## Verdict

**SUBMISSION VERDICT: NO-GO**

P0 blockers:
1. Eligibility — resident **Malaysia (dan Indonesia)** dikecualikan oleh Official Rules §3 (diverifikasi). Blocker legal, di luar kontrol teknis.
2. Strands Agents SDK tidak ada di repo (core requirement).
3. LICENSE (MIT/Apache) tidak ada.
4. README usang; video demo belum ada/terverifikasi; AWS Builder ID belum terverifikasi.

P1 improvements: track & description, diagram alur agent + Strands/AWS, HITL approval boundary, observability agent di UI, materi English, disclosure pre-existing code.

P2 improvements: blog bonus, cleanup artefak, rotasi key, screenshot README.

Mandatory requirements complete: **2/8** (public repo, testing access) + 2 partial (README, diagram) + 4 FAIL/UNKNOWN (Strands, license, video, Builder ID).

Estimated judging score: **22/50**

Top 3 actions before submit:
1. **Klarifikasi eligibility ke Devpost/Sponsor secara tertulis** — jika residence exclusion berlaku, submission tidak dapat dilanjutkan oleh peserta di MY/ID (P0 legal).
2. **Integrasi Strands Agents SDK + AWS/Bedrock** ke alur agent (bukan retrofit kosmetik) — jika keputusan tetap membangun untuk hackathon ini.
3. **Tambahkan LICENSE MIT + tulis ulang README + rekam video demo 3:00–4:30** dengan golden path ops-copilot.

**Catatan waktu:** sisa ±20,5 jam dari waktu audit. Tiga aksi di atas tidak realistis diselesaikan dengan kualitas submission yang layak dalam window ini → **NO-GO untuk deadline 14 Sep 2026, 17:00 PDT**, kecuali clarity eligibility menghasilkan solusi (mis. perwakilan team di wilayah eligible) DAN scope Strands sudah dikerjakan di tempat lain yang tidak terlihat dari repo ini (perlu bukti, bukan klaim).
