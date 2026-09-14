# BASELINE — Merchant Operations Agent Retrofit (WAVE 0)

> WAVE 0 deliverable. Read-only audit sebelum perubahan kode. Semua klaim punya bukti `file:line` atau command.
> Audit date: 2026-09-14. SDK surface diverifikasi terhadap `@strands-agents/sdk@1.17.0` yang dipasang di sandbox.

## 1. CURRENT STATE

| Fakta | Bukti |
|---|---|
| Next.js 16 monorepo (pnpm 9.12, node 20.9+/22 docker), app `apps/web`, standalone output | `package.json`, `Dockerfile` |
| Dashboard payment gateway: ledger/balance/payout/refund/webhook + AI journal Gemini | `docs/STACK.md`, `docs/DEPLOY_GCP.md` |
| Deployment live di **GCP Cloud Run** (asia-southeast2) + Cloud SQL private + Firebase + Secret Manager | `docs/DEPLOYMENT_SUMMARY.md` |
| AWS hanya berupa rencana (2 dokumen), belum ada resource AWS | `AWS_MIGRATION_PLAN.md`, `AWS_LOW_COST_DEPLOYMENT.md` |
| **Strands Agents SDK belum dipakai** (0 referensi repo-wide) | `grep -ri strands .` → 0 hasil |
| Tanpa LICENSE, README lama | `ls LICENSE*` → tidak ada; `README.md:1-6` |

## 2. CURRENT AGENT FLOW (Gemini + MCP)

- Orchestration: loop function-calling manual di `apps/web/src/server/ai-journal/gemini.ts`:
  - `MAX_TOOL_ROUNDS = 3` (`gemini.ts:11`)
  - model fallback ladder `gemini-3.6-flash → 3.1-flash-lite → flash-latest → 3.7-flash` (`gemini.ts:8-14`)
  - recoverable status `{404,429,500,503}` (`gemini.ts:7`), timeout 45s per round (`gemini.ts:69` area)
  - tools Gemini: `XENDIT_READ_FUNCTIONS` = `xendit_get_balance`, `xendit_list_transactions` (`xendit-read.ts:31-47`)
- MCP server + tools: `apps/web/src/server/mcp/server.ts`; domain tools ter-registrasi di `domain-tools.ts:101-297` (~24 tool), `xendit-tools.ts:54-64`, `journal-tools.ts:8-34`
- Entry API: `POST /api/ai-journal/chat` → auth `requireFirebaseUser` (Firebase) → `generateJournalReply` → Firestore persist (`apps/web/src/app/api/ai-journal/chat/route.ts:26-70`)
- UI: `/ai-journal/*` pages (ops-copilot, recovery-agent, readiness-agent)

## 3. CURRENT TOOL INVENTORY (yang direuse)

| Tool (MCP) | Data fn (domain) | Risiko |
|---|---|---|
| ledger metrics/rows | `getLedgerMetrics(ctx)` `transactions.ts:788`, `listTransactions(ctx,…)` `:670` | READ |
| transaction detail | `getTransaction(ctx,id)` `:744` | READ |
| balance overview | `getBalanceOverview()` `balance.ts:272` (unscoped demo) / `getBalanceOverviewPostgres()` `mcp/pg-stores.ts:41` | READ |
| payouts overview/batches | `getPayoutsOverview(ctx)` `payouts.ts:719`, `listBatches` `:634` | READ |
| refund | `refundTransaction` (di `domain-tools.ts` import dari `data/transactions`) | **WRITE (HIGH)** |
| payout release/approve/cancel/retry | `payouts.ts:777-971` | **WRITE (HIGH)** |
| Xendit live read | `executeXenditReadTool` `xendit-read.ts:51` | READ (external) |

## 4. CURRENT AUTH/TENANT BOUNDARY

- Auth: **Better Auth** session (`lib/auth.ts`) untuk dashboard; **Firebase Auth** untuk AI journal (`chat/route.ts:26`).
- Tenant: `OrgContext` {organizationId, roles, userId, isDemoFallback} di `server/services/org-context.ts:39-45`; roles catalog `domain/organization/roles.ts` (perm: `transaction.read`, `refund.execute`, `payout.release`, …).
- Resolusi request: `resolveSessionOrgContext` / `requireStrictOrgContext` (`server/services/session-org-context.ts:46,71,83`) → `parseOrganizationContext` (fail-closed, tanpa default) `domain/tenancy/organization-context.ts`.
- Guard multi-tenant demo: `refuseMultiTenantDemo` via `countPayoutTenants()` (`payout-organization-context.ts:21-29`); ledger punya `countLedgerTenants()` (`transactions.ts:447`).
- Prinsip repo: tenant **tidak pernah** dari payload browser; session menang (`payout-organization-context.ts:1-9`).

## 5. CURRENT DEPLOYMENT

GCP Cloud Run (live, TEST MODE) + Cloud SQL private + Secret Manager + Firestore; CI hanya `.github/workflows/ci.yml`. AWS: belum ada resource (hanya rencana di `AWS_LOW_COST_DEPLOYMENT.md`: Lightsail $12 + Cloudflare free + DB tetap GCP, Bedrock di-upgrade path).

## 6. GAPS (vs target)

1. Orchestration = Gemini manual loop; **Strands tidak dipakai** (gap utama).
2. Model provider = Gemini only; **Bedrock belum ada**.
3. Tools agent hanya Xendit-read; **domain tools (ledger/payout/refund) belum diekspos ke orchestrator**.
4. Tidak ada **approval/human-in-the-loop** untuk aksi finansial (dual-control ada di dashboard, tidak di agent path).
5. Tidak ada **agent telemetry/timeline** terstruktur.
6. License/README/diagram submission belum ada.

## 7. TARGET ARCHITECTURE (retrofit, bukan rewrite)

```
Web UI (dashboard + /ai-journal/*)
   → POST /api/agent/run  (auth: Better Auth session → OrgContext fail-closed)
   → Strands Agent (in-process, @strands-agents/sdk, TypeScript)
        model: BedrockModel (default Claude Sonnet 4.6) | GoogleModel fallback | MockModel (test)
        tools: Strands tool adapters (READ_ONLY sekarang) → existing domain data fns (ctx-scoped)
        guardrails: limits.turns (env), cancelSignal timeout, read-only default, policy system prompt
   → response contract { runId, status, summary, toolActivity, evidenceIds }
```
MCP layer tetap untuk konsumen lain; adapter Strands memanggil domain fns langsung (satu proses, tanpa HTTP tambahan).

## 8. IMPLEMENTATION WAVES (rencana)

- WAVE 0 Baseline ✅ (dokumen ini)
- WAVE 1 Strands spike: SDK + Bedrock + 1 tool read-only + MockModel test (turn ini)
- WAVE 2 Golden path #1 settlement investigation (semua read-only tools)
- WAVE 3 tenant safety tests (cross-tenant, prompt override)
- WAVE 4 observability (telemetry + timeline UI)
- WAVE 5 human approval (refund proposal)
- WAVE 6 satu write workflow (approved refund) — idempotent
- WAVE 7 demo fixture + 5x runs
- WAVE 8 AWS runtime (Lightsail + Bedrock, opsional)
- WAVE 9 dokumentasi (README, LICENSE, architecture, PRE_EXISTING_WORK)
- WAVE 10 submission packaging (eligibility tetap BLOCKED sampai klarifikasi sponsor)

## 9. VERIFIED SDK FACTS (bukan asumsi — dibaca dari paket terpasang)

- Paket: `@strands-agents/sdk@1.17.0`, Apache-2.0, ESM (`dist/src/index.node.js`), **Node 22+**.
- API: `import { Agent, tool, BedrockModel, GoogleModel, Model } from "@strands-agents/sdk"`.
- `tool({ name, description, inputSchema: z.object(...), callback })` → `InvokableTool<TInput,TReturn>`; callback boleh async, return JSONValue.
- `new Agent({ tools, model, systemPrompt, name, printer:false })`; `agent.invoke(prompt, { cancelSignal, limits: { turns, outputTokens, totalTokens } })` → `AgentResult { messages, lastMessage, traces?, metrics? }`.
- Default model = Bedrock `global.anthropic.claude-sonnet-4-6`; `new BedrockModel({ modelId, region, temperature, maxTokens })`; kredensial: `AWS_*` env / IAM role / `AWS_BEARER_TOKEN_BEDROCK`.
- `new GoogleModel({ modelId })` (apiKey opsional; ada `_getEnvApiKey`).
- Custom provider: `extends Model<BaseModelConfig>` implement `stream(messages, options)` async-iterable `ModelStreamEvent` + `updateConfig/getConfig`.
- Event shapes: `ModelMessageStartEvent{role}` → `ModelContentBlockStartEvent{start:{type:"toolUseStart",name,toolUseId}}` → `ModelContentBlockDeltaEvent{delta:{type:"toolUseInputDelta",input}}` / `{type:"textDelta",text}` → `ModelContentBlockStopEvent` → `ModelMessageStopEvent{stopReason:"toolUse"|"endTurn"}`.
- Messages: `MessageData{role,content}`; blocks: `{toolUse: ToolUseBlockData{name,toolUseId,input}}`, `{toolResult: ToolResultBlockData{toolUseId,status:"success"|"error",content,error?}}`, `{text: TextBlockData{text}}`.

## 10. CONSTRAINTS DIHORMATI

- Tidak rewrite business logic — adapter memanggil `server/data/*` existing.
- Tenant context hanya dari session terpercaya (`requireStrictOrgContext`/`resolveSessionOrgContext` + `parseOrganizationContext`), bukan dari LLM/browser.
- Read-only default; write hanya lewat approval (WAVE 5-6).
- No static AWS credentials di repo — kredensial via env/IAM role.
- Eligibility hackathon tetap BLOCKED (Malaysia/Indonesia dikecualikan Official Rules §3); retrofit ini untuk nilai produk, bukan klaim eligible.
