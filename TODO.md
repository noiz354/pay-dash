# TODO — PayDash MCP lanjutan

## Wave 4 — sisa pekerjaan (PR #9, jangan merge sebelum semua selesai)

Urutan disepakati: SLA wiring → component tests → Playwright → performance → report/gate closure.
**Selesai:** SLA wiring (`f9a9380`), component tests (`6107049`), groundwork 409 + refundState (`c503039`),
wiring UI JRN-003 lengkap + targeted tests (`6578f43`, `bdd74ce`, `57f0598`, `0592154`) — 1075 tests passing.

### Wiring UI yang ketahuan hilang saat inventaris E2E — SELESAI
- [x] **UI two-phase refund (JRN-003)** — `RefundWorkflow` (Role A: request dialog, state-aware, permission-aware) + `RefundDecisionPanel` (Role B: Approve/Reject; requester diblokir dengan salinan BE-002 sebelum server menolak; tanpa permission → "Waiting on Finance Admin or Owner", bukan dead button). Server action yang sama dipakai — tidak ada duplikasi logika di frontend. (`6578f43`)
- [x] **Filter `refundState`** — kontrak URL penuh: parse case-insensitive + fallback ALL, serialize hanya non-ALL, chip "Refund: Awaiting approval", activeFilterCount, select FilterSheet, halaman ledger normalisasi server-side, CSV export mirror. (`bdd74ce`)
- [x] **Mount `ConflictDialog` (CMP-020)** — RetryButton kirim `expectedUpdatedAt`; CONFLICT → dialog dengan state terbaru, tidak pernah auto-apply; retry setelah review dikirim versi terbaru yang sudah direview + event `conflict_recovered`; dismiss → refresh sinkron. (`57f0598`)
- [x] **Targeted tests sebelum Playwright** — refund-workflow (10), retry-button conflict (5), refundState di ledger (5) + parser/data-layer. Bug tertangkap: trigger Request refund tidak ikut disabled untuk viewer tanpa permission. (+27 tests, total 1075.) (`0592154`)

### Playwright critical gates (6 spek)
Catatan environment: `cdn.playwright.dev` diblokir sandbox → pakai Chromium dari npm `@sparticuz/chromium` (terbukti jalan): `executablePath=/tmp/chromium`, `LD_LIBRARY_PATH=/tmp/al2023-libs/lib`, arg `--no-sandbox`; ekstrak ulang via `chromium.executablePath()` setiap session baru. Dev server: `AUTH_ENFORCED=off pnpm dev` (port 3000); font Google gagal fetch → fallback, tidak fatal.
- [ ] Spek 1 — Role A (agus) request refund → handoff muncul → Role B (hendri) approve → completion + timeline dua aktor
- [ ] Spek 2 — SLA filter (`?sla=`) → buka detail → back → state URL + chip restore
- [ ] Spek 3 — persona restricted (nadia/ANALYST) tidak bisa aksi terlindungi (permission denial server + UI)
- [ ] Spek 4 — stale → banner → refresh (polling 20s / stale 60s)
- [ ] Spek 5 — 409 → ConflictDialog review latest → retry sukses
- [ ] Spek 6 — mobile 390px journey (cards, sheet filter, SLA badge)
- [ ] Konfigurasi: `playwright.config.ts` projects chromium-only untuk CI sandbox + dokumentasi setup browser di `e2e/README` atau comment config

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