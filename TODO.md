# TODO — PayDash MCP lanjutan

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