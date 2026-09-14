# AWS Runtime Runbook — Merchant Ops Agent (Strands + Bedrock)

Semua teknologi agent memakai **AWS** (Strands Agents SDK + Amazon Bedrock).
Komponen GCP (Gemini journal, Cloud SQL, Firebase, Secret Manager) **tidak
disentuh** dan tetap berjalan seperti sekarang.

Arsitektur target (dokumen lengkap: `AWS_LOW_COST_DEPLOYMENT.md`):

```
Cloudflare (DNS/TLS/CDN/rate-limit)
   → AWS Lightsail $12 (ap-southeast-1, 2vCPU/2GB/60GB)
        ├─ Caddy :443 (origin cert Cloudflare)
        └─ web container (Next.js + Strands agent in-process)
             → Amazon Bedrock (Claude Sonnet 4.6)   ← SEMUA tech agent di AWS
             → GCP (dibiarkan apa adanya): Cloud SQL · Firebase · Gemini journal
```

## Phase 1 — Bedrock model access (konsol AWS, sekali)

1. Buka Amazon Bedrock → **Model access** → enable:
   `Claude Sonnet 4.6` (default agent) — `global.anthropic.claude-sonnet-4-6`.
2. Pilih region yang sama dengan instance (default `ap-southeast-1`).

## Phase 2 — Kredensial Bedrock (tanpa static key permanen di disk)

| Opsi | Kapan | Setup |
|---|---|---|
| **IAM role** | EC2/ECS | Attach role dengan policy `iam-agent-bedrock-policy.json` (InvokeModel Claude saja). Nol kredensial di env. |
| **AWS_BEARER_TOKEN_BEDROCK** | Lightsail (tanpa IAM role) — **direkomendasikan** | Bedrock console → API keys → buat key → set env di server. Bukan AK/SK; scope model-invoke saja; mudah dirotasi. |
| Short-lived AK/SK | Dev lokal | `aws configure` di laptop developer; JANGAN commit; jangan simpan di server permanen. |

Rule: policy hanya `bedrock:InvokeModel*` untuk 2 model Claude — tidak ada izin lain.

## Phase 3 — Deploy

```bash
# di server Lightsail (setelah Docker + Compose terpasang, lihat AWS_LOW_COST_DEPLOYMENT.md)
export IMAGE_TAG=$(git rev-parse --short HEAD)
export APP_DOMAIN=pay.example.com
docker compose -f infra/aws/compose.aws.yaml up -d --build
docker compose -f infra/aws/compose.aws.yaml ps          # healthy = ✓
```

`.env` (`/opt/paydash/.env`, chmod 600): variabel runtime app existing +
`BEDROCK_MODEL_ID`, `AWS_REGION`, `AGENT_MAX_TOOL_TURNS`, `AGENT_RUNTIME_TIMEOUT_MS`.
Kredensial AWS masuk via environment (opsi di atas), bukan di `.env` yang di-commit.

## Phase 4 — Smoke test agent

```bash
# 1. Liveness & readiness
curl -fsS https://$APP_DOMAIN/api/health

# 2. Agent run (butuh sesi login; lakukan via UI atau curl dengan cookie sesi)
curl -fsS https://$APP_DOMAIN/api/agent/run \
  -H "content-type: application/json" \
  -b "better-auth.session_token=<dari login>" \
  -d '{"message":"Why is today settlement lower than yesterday?"}'
# Expect: { "status":"completed", "mode":"read_only", "summary":"...",
#           "toolActivity":[{"tool":"agent_get_ledger_metrics","status":"ok"}, ...] }
```

Tanpa sesi valid → `403` (tenant boundary fail-closed; bukan bug).

## Phase 5 — Observability & cost guardrails (Bedrock)

- Telemetry agent ter-struktur di log aplikasi (pino): `merchant-ops-agent`
  events (requestId, orgId, userIdHash, tool names, duration) — tidak ada secret.
- Bedrock dashboard: pantau invocation/token per hari.
- Budgets: AWS Budgets $20/$25/$30 (lihat `AWS_LOW_COST_DEPLOYMENT.md` §17).
- Model cost dipisah dari server cost: Lightsail $12 fixed; Bedrock usage-based.
  Cap perilaku: `AGENT_MAX_TOOL_TURNS` (default 6) + `maxTokens=1024` + tool
  output ternormalisasi kecil → token per run terkontrol.

## Rollback

```bash
export IMAGE_TAG=<sha-sebelumnya>
docker compose -f infra/aws/compose.aws.yaml up -d   # immutable tag, <5 menit
```

## Yang TIDAK berubah di GCP

- Cloud SQL, Secret Manager (Gemini key), Firebase Auth/Firestore, Cloud Run
  (standby rollback) — tidak ada langkah migrasi, tidak ada perubahan kode
  journal Gemini. Kedua jalur (journal Gemini di GCP, agent ops di Bedrock)
  hidup berdampingan dalam satu app.
