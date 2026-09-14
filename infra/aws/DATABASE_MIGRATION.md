# Database Migration Runbook — GCP Cloud SQL → AWS Lightsail Managed PostgreSQL

> **Decision (2026-09-14, user-directed):** move the production database to
> **Lightsail Managed PostgreSQL**. All database technology is now AWS; the
> only GCP components left are the Gemini journal/auth SaaS bits (Firebase,
> Secret Manager for the Gemini key) and the Cloud Run standby rollback.
>
> **Status:** plan + runbook complete · **NOT YET EXECUTED** — provisioning
> requires an AWS account with Lightsail permissions and the GCP project
> credentials. Every phase below has its own verification and rollback.

## 1. Why (decision record)

| Consideration | Before (GCP Cloud SQL) | After (Lightsail Managed PG) |
|---|---|---|
| Latency | Cross-cloud SG↔Jakarta (unknown, needed measurement) | Same-region private network, app & DB in `ap-southeast-1` |
| Ops model | Two clouds, Cloud SQL private IP + Cloud Run job for migrations | One cloud for the whole data path; migrations from the app instance |
| Cost | ±$10–13/bln (plus cross-cloud egress, untested) | **$15/bln flat** (Micro: 1 GB RAM / 40 GB SSD / 100 GB transfer) |
| Backups | Daily 02:00, **PITR OFF** | **Automatic daily backups + point-in-time restore (7 days)** built in |
| Security | Private IP only (good) but requires public-IP opening for any AWS access | **Private by default** — reachable only from Lightsail resources in the same region |
| Trade-off | — | Single-AZ (failover = HA plan at 2× = $30); 7-day retention (manual snapshots for longer) |

AWS total after the move: instance $12 + DB $15 + domain ≈$1 → **≈$28/bln**
(within the $30 cap; see guardrails at the end).

## 2. Current state (evidence)

- App reads a single env var: `DATABASE_URL` (PostgreSQL 16, schema `xendit`,
  Prisma; `apps/web/prisma/schema.prisma`, 32 models).
- Migrations are idempotent: `Dockerfile.migrate` → `prisma migrate deploy`.
- Critical tables with dedupe/idempotency invariants:
  `DurableOperation`, `WebhookDelivery`, `AuditEvent`
  (checksum drill pattern in `scripts/dr-restore-drill.mjs`).
- GCP Cloud SQL today: `db-f1-micro`, private IP only, user `paydash_app`
  (never `postgres` for the app), SCRAM-SHA-256.

## 3. Target

| Parameter | Value |
|---|---|
| Service | Lightsail Managed PostgreSQL 16 |
| Plan | **Micro** (1 GB RAM / 40 GB SSD / 100 GB transfer) — $15/bln |
| Region/AZ | `ap-southeast-1a` (same region **and same AZ** as the app instance) |
| Public access | **No** (`--no-publicly-accessible`) |
| DB name / app user | `xendit` / `paydash_app` (app never uses the master user) |
| Backups | Automatic (7-day PITR) + manual snapshot before each risky step |
| Connection string | `postgresql://paydash_app:<pw>@<endpoint>:5432/xendit?sslmode=require&connection_limit=10` |

> Micro tier = 40 max connections. Keep `connection_limit=10` in the app pool
> and never run more than 2–3 short-lived migration processes at once.

## 4. Phase M1 — Provision the Lightsail database

```bash
# 1) Resolve the exact ids for this account/region (don't hardcode versions):
aws lightsail get-relational-database-blueprints --region ap-southeast-1 \
  | grep -i '"id"' | grep -i postgres
aws lightsail get-relational-database-bundles --region ap-southeast-1 \
  | grep -B1 -A4 '"ramSizeInGb": 1' | grep '"bundleId"'   # expect micro_* (1GB/40GB)

# 2) Create (use the resolved blueprint/bundle ids):
aws lightsail create-relational-database \
  --relational-database-name paydash-db \
  --availability-zone ap-southeast-1a \
  --relational-database-blueprint-id postgres_16 \
  --relational-database-bundle-id micro_1_0 \
  --master-database-name xendit \
  --master-username postgres \
  --master-user-password "$(openssl rand -base64 24 | tr -d '/+=' )Ab1!" \
  --no-publicly-accessible \
  --preferred-backup-window "02:00-04:00" \
  --region ap-southeast-1

# 3) Wait for "available", then capture the endpoint + port:
aws lightsail get-relational-database --relational-database-name paydash-db \
  --region ap-southeast-1 --query 'relationalDatabase.{state:state, endpoint:masterEndpoint.address, port:masterEndpoint.port}'
```

**Verification:** state `available`; endpoint resolvable **from the app
instance** (`getent hosts <endpoint>` → 10.x private IP); `aws lightsail
get-relational-database` shows `publiclyAccessible: false`.

**Rollback:** `aws lightsail delete-relational-database --relational-database-name paydash-db` (nothing depends on it yet).

## 5. Phase M2 — Create the app user (least privilege)

```bash
# From the app instance (private network reachable):
psql "postgresql://postgres:<master-pw>@<endpoint>:5432/xendit?sslmode=require" <<'SQL'
CREATE ROLE paydash_app LOGIN PASSWORD '<openssl rand -base64 24>';
GRANT ALL ON SCHEMA public TO paydash_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO paydash_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO paydash_app;
SQL
```

**Verification:** `psql "postgresql://paydash_app:<pw>@<endpoint>:5432/xendit?sslmode=require" -c 'SELECT 1;'` → `1`.

## 6. Phase M3 — Extract from Cloud SQL (choose one path)

### Path Y (primary) — temporary public IP on Cloud SQL, tightly scoped

```bash
# GCP side: enable public IP, authorize ONLY the app instance's static IP,
# require SSL, keep private IP as-is (do not remove).
gcloud sql instances patch paydash-db --assign-ip --authorized-networks=<LIGHTSAIL_STATIC_IP>/32
gcloud sql instances patch paydash-db --require-ssl

# On the app instance: dump with the existing server CA + SCRAM user.
pg_dump "postgresql://paydash_app:<pw>@<CLOUD_SQL_PUBLIC_IP>:5432/xendit?sslmode=verify-full&sslrootcert=server-ca.pem" \
  --format=custom --no-owner --no-acl --file=/opt/paydash/migration/paydash.dump
```

### Path X (zero public exposure) — Cloud Run job → GCS, pull from Lightsail

```bash
# GCP: run a Cloud Run job that dumps to a private GCS bucket (reuses the
# existing in-VPC job pattern from docs/DEPLOY_GCP.md §6a). Then on the app
# instance: download with the scoped SA JSON and restore. Slightly more moving
# parts; choose this if opening the Cloud SQL IP is unacceptable.
```

**Verification (both paths):** dump size > 0; `pg_restore --list` shows 32 tables; **disable the Cloud SQL public IP immediately after the dump** (Path Y): `gcloud sql instances patch paydash-db --no-assign-ip`.

## 7. Phase M4 — Restore + verify on Lightsail

```bash
# On the app instance:
pg_restore --dbname="postgresql://paydash_app:<pw>@<endpoint>:5432/xendit?sslmode=require" \
  --no-owner --no-acl --jobs=2 /opt/paydash/migration/paydash.dump

# Migrations must be a no-op proof (idempotent; never db push):
docker compose -f infra/aws/compose.aws.yaml --profile migrate run --rm migrate
```

**Integrity verification (financial invariants — same checks as the repo's restore drill):**

```sql
-- Row counts of the critical tables
SELECT (SELECT count(*) FROM "DurableOperation") AS durable_ops,
       (SELECT count(*) FROM "WebhookDelivery") AS webhook_deliveries,
       (SELECT count(*) FROM "AuditEvent")     AS audit_events;

-- Dedupe/idempotency indexes must survive the restore
SELECT indexname FROM pg_indexes WHERE indexname IN
  ('DurableOperation_idempotencyKey_key','WebhookDelivery_provider_providerEventId_key');

-- Financial totals must match the source exactly (compare to the same query on GCP before cutover)
SELECT sum("amountMinor") FROM "DurableOperation";
```

**Verification:** all three row counts + financial totals identical to the source
query results; unique indexes present. **Rollback:** drop & re-restore from a new dump (source DB untouched).

## 8. Phase M5 — Staging smoke against the new DB (before production cutover)

On the app instance, run the app container with an alternate `DATABASE_URL`
pointing at Lightsail (staging `.env`), then:

- `/api/health` → `db: ok`
- sign-in (Better Auth), transactions list, balance, payouts pages render
- `pnpm --filter web test` (unit/integration against a test DB snapshot)
- one agent run: `POST /api/agent/run` → `status: completed` with tool activity

Do **not** move production traffic until this passes.

## 9. Phase M6 — Production cutover (short maintenance window)

1. Announce a 15–30 min maintenance window.
2. Take a **manual snapshot** on Lightsail + final `pg_dump` from Cloud SQL.
3. Re-run Phase M4 restore + verification against the final dump.
4. Update `/opt/paydash/.env`: `DATABASE_URL=postgresql://paydash_app:<pw>@<endpoint>:5432/xendit?sslmode=require&connection_limit=10`.
5. `IMAGE_TAG=<sha> docker compose -f infra/aws/compose.aws.yaml up -d --wait`
6. Smoke: `/api/health` (`db: ok`), sign-in, transactions, payout pages,
   `/api/agent/run` golden path.

**Rollback (instant):** restore the previous `DATABASE_URL` (Cloud SQL) + `docker compose up -d` + resume Cloud SQL (`--activation-policy=ALWAYS`). DNS never moves in this phase.

## 10. Phase M7 — Rollback window (2 weeks) → decommission

- Keep Cloud SQL for 2 weeks with `--activation-policy=NEVER` (storage-only cost) as the emergency rollback target.
- Keep the final dump in `/opt/paydash/migration/` **and** encrypted in GCS (off-server copy).
- After the window: `gcloud sql instances delete paydash-db` (after `export` of the last dump), remove any leftover authorized networks.

## 11. Ongoing operations (Lightsail specifics)

- **Backups:** automatic (7-day PITR, restore = new DB from a point in time). Manual snapshot before every risky migration; snapshots can be retained beyond 7 days.
- **Restore drill:** keep the monthly drill (`scripts/dr-restore-drill.mjs` adapted to a Lightsail restore target).
- **Scale path:** Micro → Small (2 GB/$30) via `--relational-database-bundle-id small_1_0` (brief downtime); HA plan (standby in another AZ) = 2× price when RTO demands it.
- **Connections:** 40 max on Micro. Alert when app pool exceeds ~25.
- **Encryption:** at rest + in transit by default; `sslmode=require` on the app.
- **Spend guardrails:** AWS total now ≈$28/bln (near the $30 cap). Do NOT add ECR/Secrets Manager/extra snapshots without removing something else. Keep the $20/$25/$30 Budget alarms.

## 12. Cost & guardrail summary

| Item | $/bln |
|---|---|
| Lightsail instance ($12) | 12 |
| Lightsail managed DB Micro ($15) | 15 |
| Domain (amortized) | ~1 |
| Cloudflare / UptimeRobot / GHCR | 0 |
| **AWS total** | **≈28** |
| GCP removed: Cloud SQL | **−10 to −13** |

Guardrails: Budgets $20 warn / $25 critical / $30 hard-stop · monthly leak
checklist (static IP attached, stale snapshots, unused instances) · Bedrock
usage tracked separately from server cost.
