# IMPLEMENTATION REPORT — Merchant Operations Agent (Strands Retrofit)

> Scope: WAVE 0 (baseline) + WAVE 1 (Strands spike) + WAVE 2 (investigation toolset, Bedrock-only, AWS runtime artifacts) + **WAVE 3 (tenant security hardening) + WAVE 4 (observability & timeline UI)**.
> Keputusan project: **semua tech agent memakai AWS (Strands + Bedrock); komponen GCP dibiarkan apa adanya** (Gemini journal, Cloud SQL, Firebase tidak disentuh).
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
| `apps/web/src/server/agent/tools/transactions.ts` | `agent_list_transactions` (WAVE 2 — status filter, cap 20 baris, tenant-scoped) |
| `apps/web/src/server/agent/tools/payouts.ts` | `agent_get_payouts_overview` (READ_ONLY) |
| `apps/web/src/server/agent/tools/webhooks.ts` | `agent_get_webhook_summary` (WAVE 2 — agregat 24 jam; tanpa event id/payload karena store webhook saat ini system-level) |
| `apps/web/src/server/agent/tools/index.ts` | Registry + klasifikasi risiko; read-only only (5 tools) |
| `apps/web/src/server/agent/agent.ts` | `runMerchantOpsAgent`: Strands loop + `limits.turns` + `cancelSignal` timeout + telemetry + kontrak respons |
| `apps/web/src/server/agent/model.ts` | **WAVE 2: Bedrock-only** (Claude Sonnet 4.6 default; tanpa fallback Google) |
| `apps/web/src/server/agent/telemetry.ts` | Log terstruktur aman (userId di-hash, tanpa secret) |
| `apps/web/src/server/agent/testing/mock-model.ts` | `MockModel` deterministik (turn script) — verifikasi offline |
| `apps/web/src/app/api/agent/run/route.ts` | `POST /api/agent/run` — boundary session terpercaya, read-only |
| `apps/web/src/server/agent/*.test.ts` | 12 test (tenant lintas-org, filter status, agregat webhook, loop, failure) |
| `apps/web/.env.example` | Env AWS: `BEDROCK_MODEL_ID`, `AWS_REGION`, `AGENT_MAX_TOOL_TURNS`, `AGENT_RUNTIME_TIMEOUT_MS` |
| `apps/web/src/server/agent/rate-limit.ts` | **WAVE 3**: per-actor sliding-window limiter (10 run/10 min) — melindungi spend Bedrock |
| `apps/web/src/app/api/agent/run/route.ts` | **WAVE 3 hardened**: `requireStrictOrgContext("transaction.read")` (strict fail-closed + permission gate), rate limit → 429 + `retry-after`, 403 untuk semua kelas error tenant |
| `apps/web/src/server/agent/policies.test.ts` | **WAVE 3**: policy invariants (read-only, no fabrication, DATA≠INSTRUCTION, tenant lock, approval) |
| `apps/web/src/server/agent/rate-limit.test.ts` | **WAVE 3**: window, exhaustion + retry-after, isolasi antar aktor |
| `apps/web/src/components/agent/merchant-ops-console.tsx` | **WAVE 4**: console agent — timeline tool (nama/status/summary), tanpa chain-of-thought, READ-ONLY badge, suggested prompts, error/429 state |
| `apps/web/src/app/[locale]/agent/page.tsx` | **WAVE 4**: halaman `/agent` (Strands + Bedrock badges, tenant-scoped) |
| `next.config.ts`, `src/proxy.ts`, `navigation/nav-config.ts` | **WAVE 4**: registrasi rute `/agent` (rewrites + proxy prefix + nav item gated `transaction.read`) |
| `apps/web/src/server/agent/tools/ledger.test.ts` | **WAVE 3 +3 test**: forged tenant field di tool input diabaikan; instruction-like data diperlakukan sebagai data; malformed input ditolak |
| `infra/aws/` | **WAVE 2**: `iam-agent-bedrock-policy.json` (InvokeModel Claude saja), `compose.aws.yaml` (web+Caddy, health, limit), `Caddyfile`, `README.md` (runbook Bedrock + deploy + smoke + cost guardrails) |
| `apps/web/package.json` + `pnpm-lock.yaml` | `@strands-agents/sdk@1.17.0`, `@google/genai@^2.6.0` (peer wajib SDK — SDK mengimpor modul Google saat load; agent tidak memakai Google model) |
| `BASELINE.md` | WAVE 0 deliverable |

## Strands Integration (verified)

- **Orchestration = Strands**: `new Agent({ tools, model, systemPrompt, printer:false })` + `agent.invoke(message, { cancelSignal, limits: { turns } })` — loop tool-calling SDK, bukan loop Gemini manual.
- **Bukti eksekusi loop nyata** (dari dump debug test, sekarang dihapus): model (MockModel) memilih tool → SDK mengeksekusi tool → hasil JSON `{status, summary, data, evidenceIds}` masuk `toolResult` → model menjawab. `toolActivity` terekstrak.
- **Guardrails**: max turns (`AGENT_MAX_TOOL_TURNS`, default 6), timeout wall-clock (`AGENT_RUNTIME_TIMEOUT_MS`, default 60s), read-only default (tidak ada tool tulis di registry).
- **WAVE 2 — model AWS-only**: `BedrockModel({ modelId: global.anthropic.claude-sonnet-4-6, region: AWS_REGION, temperature: 0.2, maxTokens: 1024 })`. Tidak ada fallback Google di jalur agent (keputusan project). `@google/genai` tetap terpasang hanya karena SDK mengimpor modul Google saat load (peer wajib).
- **WAVE 2 — toolset investigasi lengkap (5 tools read-only)**: `agent_get_ledger_metrics`, `agent_list_transactions` (filter status, cap 20), `agent_get_transaction`, `agent_get_payouts_overview`, `agent_get_webhook_summary` (agregat saja — store webhook existing masih system-level, jadi event detail TIDAK diekspos ke model demi tenant safety).

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
| `pnpm --filter web exec vitest run src/server/agent` | ✅ **22/22 passed** (7 file: context, policies, rate-limit, agent loop, ledger/tx/webhook tools) |
| `pnpm --filter web exec vitest run src/components/navigation/permission-adapter.test.ts` | ✅ passed — ekspektasi test diperbarui secara sadar: `/agent` gated `transaction.read` (SUPPORT memegangnya) |
| `pnpm --filter web typecheck` | ✅ 0 error |
| `pnpm --filter web lint` | ✅ 0 error (40 warning pre-existing) |
| `pnpm --filter web test` (full) | ✅ **1503 passed** · ⚠️ 2 suite MCP gagal environmental (Prisma engine tak bisa diunduh — tidak berubah) |
| `pnpm --filter web build` | ⚠️ **BELUM terverifikasi di sandbox** — OOM (2-core/4GB) + egress ke `fonts.googleapis.com` diblokir. Typecheck mengkompilasi seluruh halaman/route; build hijau di GitHub Actions (ci.yml) dengan runner lebih besar |

## AWS Deployment

- **WAVE 2 artifact runtime AWS** (`infra/aws/`): IAM policy Bedrock (InvokeModel Claude saja), `compose.aws.yaml` (web + Caddy, non-root, health check, log rotation, memory limit), Caddyfile, dan runbook lengkap (Bedrock model access → kredensial tanpa static key → deploy → smoke test agent → cost guardrails).
- Belum ada resource AWS live (WAVE 8 = provisioning; eksekusi butuh akun AWS + model access).
- Bedrock invoke nyata belum dieksekusi di sandbox: **UNKNOWN / NEEDS RUNTIME VERIFICATION** (perlu akun AWS + kredensial). Loop sudah dibuktikan via MockModel.

## Known Limitations

1. `POST /api/agent/run` belum diuji runtime penuh (butuh app running + sesi Better Auth); teruji: typecheck + boundary context via unit test.
2. Invoke Bedrock nyata belum dieksekusi (tanpa akun/kredensial AWS di sandbox). Loop sudah dibuktikan via MockModel.
3. Tool webhook hanya agregat (store webhook existing system-level/unscoped); event-level butuh scoping tenant di data layer (WAVE 3/5).
4. Belum ada approval flow (WAVE 5), satu write workflow refund (WAVE 6), demo fixture (WAVE 7), UI timeline (WAVE 4).
5. ✅ Rate-limit route agent terpasang (WAVE 3).
6. `collectToolActivity` membaca field objek SDK secara defensif (bentuk live vs serialized); dikunci oleh test.
7. Belum ada: refund/retry tools + approval flow (WAVE 5-6), golden path stuck-transaction penuh (butuh webhook event-level), demo fixture (WAVE 7), provisioning live (WAVE 8).
8. Build Next.js belum bisa diverifikasi di sandbox (OOM + blokir egress font) — divalidasi typecheck + CI GitHub Actions.

## Remaining Submission Blockers (tidak berubah)

- Eligibility: Malaysia/Indonesia dikecualikan Official Rules §3 → **BLOCKED / NEEDS SPONSOR CLARIFICATION** (independen dari kualitas engineering).
- LICENSE, README, diagram, video, Builder ID: WAVE 9-10.

## Cost

- Infra AWS target ≤ $15–30/bln (Lightsail + Cloudflare free; DB tetap GCP sementara) — dokumen `AWS_LOW_COST_DEPLOYMENT.md`.
- Model: Bedrock usage-based, dipantau terpisah (`AGENT_MAX_TOOL_TURNS`, `maxTokens=1024`, tool output ternormalisasi kecil).

---

```text
PRODUCT VERDICT:
READY WITH RISKS (WAVE 1-4 jalan & teruji — 5 tools read-only, Bedrock-only, tenant strict + rate limit, timeline UI; approval + refund idempoten = WAVE 5-6)

STRANDS VERDICT:
PASS (orchestration SDK nyata, loop tool-calling tervalidasi offline)

SECURITY VERDICT:
PASS (tenant fail-closed + permission gate transaction.read + rate limit + cross-tenant/forged-input/injection tests + tanpa static credentials)

DEMO VERDICT:
PARTIAL (fixture deterministik & 5x runs = WAVE 7)

AWS DEPLOYMENT:
PARTIAL (semua tech agent = AWS: Bedrock-only + artifact runtime `infra/aws/` siap; provisioning live = WAVE 8)

SUBMISSION ELIGIBILITY:
BLOCKED (Malaysia/Indonesia dikecualikan; butuh klarifikasi sponsor/Devpost)
```
