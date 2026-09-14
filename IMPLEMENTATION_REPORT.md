# IMPLEMENTATION REPORT — Merchant Operations Agent (Strands Retrofit)

> Scope turn ini: WAVE 0 (baseline) + WAVE 1 (Strands spike: SDK + Bedrock default + read-only tools + tenant boundary + tests).
> Semua fakta SDK diverifikasi terhadap paket terpasang `@strands-agents/sdk@1.17.0`, bukan dari tebakan docs.

## Current State (sebelum retrofit)

- Orchestration agent existing = loop function-calling manual di atas Gemini (`apps/web/src/server/ai-journal/gemini.ts:11` `MAX_TOOL_ROUNDS=3`), tools hanya Xendit-read.
- MCP server + ~28 tools domain (ledger/balance/payout/refund/webhook) di `apps/web/src/server/mcp/`.
- Tenant boundary existing solid: `requireStrictOrgContext`/`resolveSessionOrgContext` → `parseOrganizationContext` (fail-closed, tanpa default, browser-supplied org tidak pernah dihormati).
- **Strands tidak terpasang**, LICENSE tidak ada, README lama. Detail lengkap: `BASELINE.md`.

## What Was Reused (tidak di-rewrite)

- Seluruh business logic: `getLedgerMetrics(ctx)`, `getTransaction(ctx,id)`, `getPayoutsOverview(ctx)` — dipanggil langsung oleh adapter.
- Tenant plumbing: `parseOrganizationContext`, `resolveSessionOrgContext`, pola `refuseMultiTenantDemo` (diportir sebagai `assertSafeAgentContext`).
- RBAC catalog (`domain/organization/roles.ts`) — `transaction.read` dipakai sebagai permission gate route.
- pino logger (`lib/logger.ts`), Zod (repo v4.5.4 = peer SDK ^4.1.12 ✓).

## What Was Added

| File | Isi |
|---|---|
| `apps/web/src/server/agent/types.ts` | `AgentContext` (trusted), kontrak `ToolResultContract` / `ToolActivity` / `AgentRunContract` |
| `apps/web/src/server/agent/context.ts` | `buildAgentContext` fail-closed + `assertSafeAgentContext` (multi-tenant demo refusal) |
| `apps/web/src/server/agent/policies.ts` | System policy: read-only, no fabrication, evidence, tenant, data≠instruction, approval, fail-safe |
| `apps/web/src/server/agent/model.ts` | Provider abstraction: **Bedrock default** (Claude Sonnet 4.6), Google fallback via env; tanpa static credentials |
| `apps/web/src/server/agent/tools/ledger.ts` | `agent_get_ledger_metrics`, `agent_get_transaction` (READ_ONLY, tenant-scoped, output ternormalisasi) |
| `apps/web/src/server/agent/tools/payouts.ts` | `agent_get_payouts_overview` (READ_ONLY) |
| `apps/web/src/server/agent/tools/index.ts` | Registry + klasifikasi risiko; read-only only |
| `apps/web/src/server/agent/agent.ts` | `runMerchantOpsAgent`: Strands loop + `limits.turns` + `cancelSignal` timeout + telemetry + kontrak respons |
| `apps/web/src/server/agent/telemetry.ts` | Log terstruktur aman (userId di-hash, tanpa secret) |
| `apps/web/src/server/agent/testing/mock-model.ts` | `MockModel` deterministik (turn script) — verifikasi offline |
| `apps/web/src/app/api/agent/run/route.ts` | `POST /api/agent/run` — boundary session terpercaya, read-only |
| `apps/web/src/server/agent/{context,agent,tools/ledger}.test.ts` | 9 test (tenant, loop, failure) |
| `apps/web/package.json` + `pnpm-lock.yaml` | `@strands-agents/sdk@1.17.0`, `@google/genai@^2.6.0` (peer SDK) |
| `BASELINE.md` | WAVE 0 deliverable |

## Strands Integration (verified)

- **Orchestration = Strands**: `new Agent({ tools, model, systemPrompt, printer:false })` + `agent.invoke(message, { cancelSignal, limits: { turns } })` — loop tool-calling SDK, bukan loop Gemini manual.
- **Bukti eksekusi loop nyata** (dari dump debug test, sekarang dihapus): model (MockModel) memilih `agent_get_ledger_metrics` → SDK mengeksekusi tool → hasil JSON `{status, summary, data, evidenceIds}` masuk `toolResult` → model menjawab. `toolActivity` terekstrak.
- **Guardrails**: max turns (`AGENT_MAX_TOOL_TURNS`, default 6), timeout wall-clock (`AGENT_RUNTIME_TIMEOUT_MS`, default 60s), read-only default (tidak ada tool tulis di registry).
- Model: `BedrockModel({ modelId: global.anthropic.claude-sonnet-4-6, region: AWS_REGION, temperature: 0.2, maxTokens: 1024 })`; fallback `GoogleModel` via `AGENT_MODEL_PROVIDER=google`. Kredensial: `AWS_*` env / IAM role — **tanpa static key di repo**.

## Security / Tenant Isolation

- Organisasi hanya dari sesi terautentikasi (`resolveSessionOrgContext` + `parseOrganizationContext`); LLM tidak pernah memasok tenant.
- Demo fallback ditolak saat store multi-tenant (port dari `refuseMultiTenantDemo`; ledger `countLedgerTenants()`).
- **Test lintas-tenant PASS**: tools org A tidak bisa membaca transaksi org B (`NOT_FOUND`), metrik org A hanya menghitung baris A.
- Route menolak payload malformed (zod), OrganizationContextError → 403.
- Policy prompt: DATA ≠ INSTRUCTION, no fabrication, evidence-backed, approval untuk aksi finansial (belum ada tool tulis → tidak ada celah eksekusi).

## Observability

- pino events: run started/completed (requestId, orgId, userIdHash, duration, toolCount), tool events.
- `AgentRunContract.toolActivity` = timeline aman untuk UI (nama tool + status + ringkasan hasil; tanpa chain-of-thought).
- UI timeline (WAVE 4) belum dikerjakan.

## Tests

| Perintah | Hasil |
|---|---|
| `pnpm --filter web typecheck` | ✅ 0 error |
| `pnpm --filter web lint` | ✅ 0 error (40 warning pre-existing) |
| `pnpm --filter web exec vitest run src/server/agent` | ✅ **9/9 passed** |
| `pnpm --filter web test` (full) | ✅ **1491 passed** · ⚠️ 2 suite (`mcp/customer-tools.tenant`, `mcp/server.integration`) gagal import `@prisma/client` karena sandbox tidak bisa mengunduh engine Prisma dari `binaries.prisma.sh` (prisma generate gagal TLS) — **lingkungan, bukan regresi** (tidak ada file MCP yang diubah; kedua suite butuh client ter-generate) |

## AWS Deployment

- Belum ada resource AWS (sesuai rencana: WAVE 8). Runtime target: Lightsail $12 (per `AWS_LOW_COST_DEPLOYMENT.md`) + Bedrock (biaya model dipisah dari biaya server).
- Bedrock belum diuji invoke nyata: **perlu akun AWS + model access + kredensial** (UNKNOWN / NEEDS RUNTIME VERIFICATION).

## Known Limitations

1. `POST /api/agent/run` belum diuji runtime penuh (butuh app running + sesi Better Auth); teruji: typecheck + boundary context via unit test.
2. Invoke Bedrock/Google nyata belum dieksekusi (tanpa kredensial di sandbox). Loop sudah dibuktikan via MockModel.
3. Belum ada tools webhook/refund (WAVE 2/5-6), approval flow (WAVE 5), demo fixture (WAVE 7), UI timeline (WAVE 4).
4. Rate-limit khusus route agent belum dipasang (mirror `assertWithinAiJournalRateLimit` = WAVE 3/4).
5. `agent.ts` `collectToolActivity` membaca field objek SDK secara defensif (bentuk live vs serialized); dikunci oleh test.

## Remaining Submission Blockers (tidak berubah)

- Eligibility: Malaysia/Indonesia dikecualikan Official Rules §3 → **BLOCKED / NEEDS SPONSOR CLARIFICATION** (independen dari kualitas engineering).
- LICENSE, README, diagram, video, Builder ID: WAVE 9-10.

## Cost

- Infra AWS target ≤ $15–30/bln (Lightsail + Cloudflare free; DB tetap GCP sementara) — dokumen `AWS_LOW_COST_DEPLOYMENT.md`.
- Model: Bedrock usage-based, dipantau terpisah (`AGENT_MAX_TOOL_TURNS`, `maxTokens=1024`, tool output ternormalisasi kecil).

---

```text
PRODUCT VERDICT:
READY WITH RISKS (WAVE 1 jalan & teruji; golden paths & approval belum)

STRANDS VERDICT:
PASS (orchestration SDK nyata, loop tool-calling tervalidasi offline)

SECURITY VERDICT:
PASS (tenant fail-closed, read-only default, cross-tenant test, tanpa static credentials)

DEMO VERDICT:
PARTIAL (fixture deterministik & 5x runs = WAVE 7)

AWS DEPLOYMENT:
PARTIAL (dokumentasi siap, runtime = WAVE 8)

SUBMISSION ELIGIBILITY:
BLOCKED (Malaysia/Indonesia dikecualikan; butuh klarifikasi sponsor/Devpost)
```
