# TODO — PayDash MCP lanjutan

> **Roadmap (2026-09-13):** sembilan spec baru (Wave 7D–7H dan 8–11) sudah ter-draft, dan
> urutan kerjanya kini tercatat di **`WAVE_ROADMAP_7D_TO_11.md`** — dependensi antar-wave,
> peta debt→wave (D-01..D-28), ledger quarantine, dan alokasi nomor ADR (0044–0051).
> Checklist di bawah **tidak dihapus**; ia hanya dipetakan ke wave yang mengeksekusinya:
> - **"Wave 4 — sisa pekerjaan"** (jalankan Playwright gates, performance verification,
>   documentation & gate closure) → **Wave 9** (`WAVE_9_VERIFICATION_SPEC.md`; D-01..D-04).
>   Verdict Release Readiness diterbitkan di sana, jadi Wave 9 jalan paling akhir.
> - **"(a) Sweep tool yang tersisa"** (`get_webhook_event`, row #20) → **Wave 9** Q7 checklist (D-21).
> - **"(c) Remediasi audit MCP"** R1–R6 → **Wave 8** (`WAVE_8_MCP_AUTH_HARDENING_SPEC.md`):
>   R1→D-06 (rate limit MCP), R2→D-07 (audit log), R3→D-08 (`timingSafeEqual`),
>   R5→scope token read-only/write, D-05 (limiter sign-in) + D-20 (UX 429) ikut di wave yang sama.
>   R4/R6 = konfigurasi mesin lokal (Firebase/gcloud project, path chromium) — **bukan** pekerjaan repo.

## Wave 4 — sisa pekerjaan (PR #9, jangan merge sebelum semua selesai)

Urutan disepakati: SLA wiring → component tests → Playwright → performance → report/gate closure.
**Selesai:** SLA wiring (`f9a9380`), component tests (`6107049`), groundwork 409 + refundState (`c503039`),
wiring UI JRN-003 lengkap + targeted tests (`6578f43`, `bdd74ce`, `57f0598`, `0592154`) — 1075 tests passing.

### Wiring UI yang ketahuan hilang saat inventaris E2E — SELESAI
- [x] **UI two-phase refund (JRN-003)** — `RefundWorkflow` (Role A: request dialog, state-aware, permission-aware) + `RefundDecisionPanel` (Role B: Approve/Reject; requester diblokir dengan salinan BE-002 sebelum server menolak; tanpa permission → "Waiting on Finance Admin or Owner", bukan dead button). Server action yang sama dipakai — tidak ada duplikasi logika di frontend. (`6578f43`)
- [x] **Filter `refundState`** — kontrak URL penuh: parse case-insensitive + fallback ALL, serialize hanya non-ALL, chip "Refund: Awaiting approval", activeFilterCount, select FilterSheet, halaman ledger normalisasi server-side, CSV export mirror. (`bdd74ce`)
- [x] **Mount `ConflictDialog` (CMP-020)** — RetryButton kirim `expectedUpdatedAt`; CONFLICT → dialog dengan state terbaru, tidak pernah auto-apply; retry setelah review dikirim versi terbaru yang sudah direview + event `conflict_recovered`; dismiss → refresh sinkron. (`57f0598`)
- [x] **Targeted tests sebelum Playwright** — refund-workflow (10), retry-button conflict (5), refundState di ledger (5) + parser/data-layer. Bug tertangkap: trigger Request refund tidak ikut disabled untuk viewer tanpa permission. (+27 tests, total 1075.) (`0592154`)

### Playwright critical gates (6 spek) — SPEK SELESAI, eksekusi di sisi developer
Keenam spek + infra tertulis di `apps/web/e2e/wave4/` (helpers, README) dan didokumentasikan penuh di **`WAVE_4_E2E_TEST_PLAN.md`** — prasyarat, cara jalan (env normal & sandbox tanpa CDN Playwright), kriteria lulus per gate, dan catatan limitasi sandbox. Konfigurasi: `playwright.config.ts` auto-narrow ke chromium + `launchOptions` sandbox bila `/tmp/chromium` ada; `scripts/ensure-e2e-browser.mjs` bootstrap browser dari tarball npm. Eksekusi didelegasikan ke mesin developer: sandbox penulis tidak stabil untuk run penuh (retry fetch font Google + kompilasi on-demand berat → `next dev` exit di tengah run).
- [x] Spek 1 — `refund-handoff.spec.ts` — Role A (agus) request → antrian dual-control → Role B (hendri) approve → timeline dua aktor
- [x] Spek 2 — `sla-filter-back-restore.spec.ts` — SLA filter → detail → back restore URL + chip + rows (+ reload)
- [x] Spek 3 — `permissions.spec.ts` — nadia/ANALYST: server menolak retry lewat UI nyata; trigger refund disabled + alasan
- [x] Spek 4 — `freshness-stale.spec.ts` — usia berdetak tanpa fetch; refresh manual reset; >60s → banner → refresh bersih
- [x] Spek 5 — `conflict-recovery.spec.ts` — race dua tab nyata → 409 → dialog state terbaru → retry setelah review sukses
- [x] Spek 6 — `mobile-journey.spec.ts` — 390px: cards + badge → sheet → chip → detail → back restore
- [ ] **[DEVELOPER] Jalankan** `cd apps/web && npx playwright test e2e/wave4 --project=chromium` → semua hijau; tempel hasilnya ke PR #9

### Performance verification
- [ ] CLS ≤ 0.05 (LayoutShift via CDP/web-vitals di spek Playwright)
- [ ] LCP & INP terhadap spec
- [ ] Jumlah request polling (20s interval, tidak menumpuk)
- [ ] Agregasi dashboard + rerender tidak perlu (React DevTools profile / why-did-you-render sekali jalan)

### Documentation & gate closure
- [ ] `WAVE_4_IMPLEMENTATION_REPORT.md` (ikuti format WAVE_0–3)
- [ ] Reconcile coverage/registry — bukti test Wave 3 yang hilang (catatan "unverified" di `IMPLEMENTATION_PROGRESS.md`) kini tergantikan suite nyata
- [ ] Final gate checklist: Typecheck/Lint/Unit-Component/Playwright P0-P1/SLA Contract/Cross-role Handoff/Accessibility/Performance/Wave0–3 Regression → Release Readiness: READY
- [ ] Update deskripsi PR #9 tiap tahap selesai

## (a) Sweep tool yang tersisa
- [ ] Sweep live `get_webhook_event` (ambil sample id dari `list_webhooks`) + tambahkan hasilnya ke `docs/MCP_SWEEP.md` (row #20).

## (c) Remediasi audit MCP (prioritas)

**P0**
- [ ] R1 — **Rate limit endpoint MCP**: modul `assertMcpRateLimit` (keyed IP + token, window 10 menit) dipanggil di `handleMcpRequest` sebelum auth/tools. + unit test.

**P1**
- [ ] R2 — **Audit log MCP**: rekam setiap `tools/call` (tool, arg ringkas, ok/err, timestamp) ke seam audit (`src/server/data/audit.ts` / pino). + unit test.
- [ ] R3 — **`crypto.timingSafeEqual`** pada perbandingan token di `src/server/mcp/auth.ts` (panjang sama dulu). + unit test.
- [ ] R4 — **Config MCP lain**: set active project Firebase MCP ke `gen-lang-client-0170811162`; perbaiki active project gcloud (bukan `bf7c8`); verifikasi path chromium chrome-devtools.

**P2 (opsional)**
- [ ] R5 — **Scope token read-only vs write** (`mcpScope` di runtime settings; token write bisa generate token read-only).
- [ ] R6 — **Fix path chromium** chrome-devtools di `~/.config/opencode/opencode.json` bila stale.

## Referensi
- Audit lengkap + temuan: percakapan audit MCP (S1–S13, matriks MCP lain).
- Sweep hasil: `docs/MCP_SWEEP.md`.