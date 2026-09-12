# TODO — PayDash MCP lanjutan

## Wave 4 — sisa pekerjaan (PR #9, jangan merge sebelum semua selesai)

Urutan disepakati: SLA wiring → component tests → Playwright → performance → report/gate closure.
**Selesai:** SLA wiring (`f9a9380`), component tests (`6107049`), groundwork 409 + refundState (`c503039`).

### Wiring UI yang ketahuan hilang saat inventaris E2E — kerjakan lebih dulu
- [ ] **UI two-phase refund (JRN-003)** — `requestRefundAction` / `approveRefundAction` / `rejectRefundAction` sudah ada di server tapi **belum punya UI**: tombol *Request Refund* (Role A: Agus/SUPPORT, `refund.prepare`) di detail transaksi + panel *Approve/Reject* (Role B: Hendri/FINANCE_ADMIN, `refund.execute`) untuk `refundState=AWAITING_APPROVAL`. Tanpa ini gate "Role A → handoff → Role B → completion" tidak bisa dijalankan.
- [ ] **Filter `refundState`** — pakai `normalizeRefundStateFilter` (sudah ada): halaman ledger baca `?refundState=`, tambahkan ke `table-url-state.ts` (parse/serialize/chip/count) + select di FilterSheet. Antrian Role B: `/transactions?refundState=AWAITING_APPROVAL`.
- [ ] **Mount `ConflictDialog` (CMP-020)** — komponen ada tapi tidak di-mount di mana pun. Kaitkan dengan `ActionState.conflict` dari `retryTransactionAction` (payload sudah siap), dan kirim `expectedUpdatedAt` (dari `updatedAt` yang dirender) di form `RetryButton`. Alur: 409 → review latest → retry.

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