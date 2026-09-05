# PayDash — GCP Deployment Runbook

One runbook to ship `apps/web` (Next.js 16 standalone, Prisma/Postgres, Xendit + Stripe, Better Auth, Sentry/OTel, Firebase + Gemini journal) to **Google Cloud Platform**.

Target topology (all serverless, no GKE):

| Component | GCP service |
|---|---|
| Web app | Cloud Run (container from the existing `Dockerfile` standalone build) |
| Database | Cloud SQL for PostgreSQL (private IP) |
| Secrets | Secret Manager |
| KMS (provider-secret store) | Cloud KMS (CKM key) |
| Images | Artifact Registry |
| Build | Cloud Build + GitHub Actions |
| WAF / edge | Cloud Armor + Cloud Load Balancer (front Cloud Run) |
| Auth (journal) | Firebase Auth + Firestore (see `docs/AI_JOURNAL_CLOUD_RUN.md`) |
| Observability | Sentry + OTel (already wired) |

> The container already runs with `PORT=3000` and `/api/health`. Cloud Run only needs `PORT=3000` and the healthcheck path.

---

## 0. Gates before you start

Run these **before every prod deploy**. They map to the repo's agent skills.

1. **Pre-flight** — `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter web build`
2. **Prisma** — `pnpm --filter web exec prisma migrate diff --from-empty --to-schema-datamodel apps/web/prisma/schema.prisma --script` review; new migrations must be committed before deploy.
3. **E2E** — `npx playwright install --with-deps && pnpm test:e2e`
4. **Security audit** — review the diff for payment-data regressions (`security-audit`): never log `XENDIT_SECRET_KEY`, never bundle secrets client-side, keep `SECRET_STORE_MODE=kms` in prod.
5. **Browser smoke** — open the preview/staging URL, confirm TEST MODE banner + health endpoint (`browser-testing-with-devtools`).

---

## 1. Project + billing

```bash
export PROJECT_ID="paydash-prod"
export REGION="asia-southeast2"          # pick nearest to your merchants
export SERVICE_NAME="paydash-web"

gcloud projects create "$PROJECT_ID"
gcloud config set project "$PROJECT_ID"
gcloud auth application-default login
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  cloudkms.googleapis.com \
  compute.googleapis.com \
  cloudresourcemanager.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com
```

---

## 2. Database — Cloud SQL (PostgreSQL 16)

```bash
# Private IP + a VPC connector so Cloud Run can reach it without public internet
gcloud compute networks create paydash-vpc --subnet-mode=auto

gcloud sql instances create paydash-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \                       # scale up later (payment data = be generous)
  --region="$REGION" \
  --network=paydash-vpc \
  --no-assign-ip \
  --backup-start-time=02:00 \
  --enable-point-in-time-recovery \
  --storage-size=10GB --storage-auto-increase \
  --database-flags=password_encryption=scram-sha-256,cloudsql.iam_authentication=on

gcloud sql databases create xendit --instance=paydash-db

gcloud sql users create postgres \
  --instance=paydash-db \
  --password="$(openssl rand -base64 32)"
```

**Security:** create a dedicated app user, not `postgres`:

```bash
gcloud sql users create paydash_app \
  --instance=paydash-db \
  --password="$(openssl rand -base64 32)"
```

---

## 3. Secrets — Secret Manager

Everything that lives in `apps/web/.env.prod` today moves to Secret Manager. Never commit real values.

```bash
# Database + app core
printf 'postgresql://paydash_app:CHANGE_ME@10.128.0.3:5432/xendit' | \
  gcloud secrets create DATABASE_URL --data-file=- --replication-policy=automatic

# One secret per value. Illustrative list; fill from .env.example:
for S in BETTER_AUTH_SECRET SENTRY_DSN XENDIT_SECRET_KEY XENDIT_WEBHOOK_TOKEN \
         STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET NEXT_PUBLIC_APP_URL \
         PAYMENTS_PUBLIC_ORIGIN GEMINI_API_KEY; do
  echo "create secret: $S"
  # printf '<value>' | gcloud secrets create "$S" --data-file=-
done
```

Note `NEXT_PUBLIC_*` vars must also be baked at build time in Cloud Build (see §7). Runtime Secret Manager works only for server vars.

### 3a. KMS for the provider-secret store

`SECRET_STORE_MODE=kms` in prod (AES-256-GCM backed by Cloud KMS, not `local`):

```bash
gcloud kms keyrings create paydash-ring --location="$REGION"
gcloud kms keys create paydash-provider-key \
  --location="$REGION" --keyring=paydash-ring \
  --purpose=encryption

gcloud secrets create SECRET_STORE_KMS_KEY_ID --data-file=-
# value: projects/$PROJECT_ID/locations/$REGION/keyRings/paydash-ring/cryptoKeys/paydash-provider-key
```

---

## 4. Cloud Run — private network + IAM

```bash
# Service account Cloud Run will run as (least privilege)
gcloud iam service-accounts create paydash-runner \
  --description="PayDash Cloud Run runtime SA"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:paydash-runner@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:paydash-runner@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyEncrypterDecrypter"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:paydash-runner@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:paydash-runner@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/datastore.user"          # Firestore journal
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:paydash-runner@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

# VPC connector (Serverless VPC Access) for private Cloud SQL
gcloud compute networks vpc-access connectors create paydash-connector \
  --region="$REGION" \
  --network=paydash-vpc \
  --range=10.8.0.0/28 \
  --min-instances=2 --max-instances=3
```

---

## 5. Image pipeline — Artifact Registry + Cloud Build

```bash
gcloud artifacts repositories create paydash \
  --repository-format=docker \
  --location="$REGION"

gcloud artifacts repositories add-iam-policy-binding paydash \
  --location="$REGION" \
  --member="serviceAccount:$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')@cloudbuild.gserviceaccount.com" \
  --role=roles/artifactregistry.writer
```

Deploy from the repo's existing `Dockerfile` (standalone + Prisma generate):

```bash
# build once, tag, push
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/paydash/web:$(git rev-parse --short HEAD)"
gcloud builds submit --region="$REGION" --tag "$IMAGE" .
```

---

## 6. Deploy to Cloud Run

```bash
gcloud run deploy "$SERVICE_NAME" \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --service-account=paydash-runner@$PROJECT_ID.iam.gserviceaccount.com \
  --vpc-connector=paydash-connector \
  --vpc-egress=private-ranges-only \
  --memory=1Gi --cpu=1 \
  --min-instances=1 \              # avoid cold start on payment pages
  --max-instances=10 \
  --concurrency=80 \
  --timeout=300s \
  --port=3000 \
  --set-env-vars="APP_ENV=production,NEXT_PUBLIC_APP_URL=https://pay.yourdomain.com,PAYMENTS_PUBLIC_ORIGIN=https://pay.yourdomain.com,FIREBASE_PROJECT_ID=$PROJECT_ID,GEMINI_API_KEY_SECRET_RESOURCE=projects/$PROJECT_ID/secrets/GEMINI_API_KEY/versions/latest,SECRET_STORE_MODE=kms,GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,BETTER_AUTH_SECRET=BETTER_AUTH_SECRET:latest,SENTRY_DSN=SENTRY_DSN:latest,XENDIT_SECRET_KEY=XENDIT_SECRET_KEY:latest,XENDIT_WEBHOOK_TOKEN=XENDIT_WEBHOOK_TOKEN:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest,SECRET_STORE_KMS_KEY_ID=SECRET_STORE_KMS_KEY_ID:latest" \
  --allow-unauthenticated
```

### 6a. Migrations

Run once against prod DB after deploy:

```bash
gcloud run jobs create paydash-migrate \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account=paydash-runner@$PROJECT_ID.iam.gserviceaccount.com \
  --vpc-connector=paydash-connector \
  --vpc-egress=private-ranges-only \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest" \
  --command="pnpm" \
  --args="--filter,web,exec,prisma,migrate,deploy"
gcloud run jobs execute paydash-migrate --region="$REGION"
```

> Prisma migrations are **idempotent** (`migrate deploy`), so run this job before pointing traffic at a new revision. Never run `prisma db push` in prod.

### 6b. Health + smoke

```bash
URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(status.url)')
curl -f "$URL/api/health"
```

Then run the `playwright-cli` / `browser-testing-with-devtools` smoke: sign-in, TEST MODE banner present, a payment page loads, journal sign-in works.

---

## 7. CI/CD — GitHub Actions

The existing `.github/workflows/ci.yml` stays as the PR gate. Add a deploy job (on `main`) that mirrors §5–§6. **`NEXT_PUBLIC_*` vars must be build-time:**

```yaml
# .github/workflows/deploy-gcp.yml
name: Deploy GCP
on:
  push:
    branches: [main]
  workflow_dispatch: {}

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20.9.0, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck && pnpm lint && pnpm test && pnpm --filter web build
      - id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: "projects/${{ vars.GCP_PROJECT_NUMBER }}/locations/global/workloadIdentityPools/github/providers/github"
          service_account: paydash-github@${{ vars.GCP_PROJECT_ID }}.iam.gserviceaccount.com
          token_format: access_token
      - uses: google-github-actions/setup-gcloud@v2
      - name: Build & push
        run: |
          IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/paydash/web:$GITHUB_SHA"
          gcloud builds submit --region="$REGION" \
            --config=cloudbuild.yaml --substitutions="_IMAGE=$IMAGE,REPO_NAME=$GITHUB_REPOSITORY,SHORT_SHA=$GITHUB_SHA" .
      - name: Deploy
        run: |
          gcloud run deploy "$SERVICE_NAME" --image="$IMAGE" --region="$REGION" ...
        env:
          REGION: asia-southeast2
          PROJECT_ID: ${{ vars.GCP_PROJECT_ID }}
```

Set GitHub Actions secrets: `GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`, plus any build-time `NEXT_PUBLIC_*`.

> Google-recommended alternative: put the whole pipeline in `cloudbuild.yaml` (Cloud Build + Cloud Run deploy + migrate job) and let GitHub Actions just trigger it. Prefer this if you want GCP to own the deploy path.

---

## 8. Edge — Cloud Armor WAF (payment gateway)

Front Cloud Run with a load balancer so you can enforce WAF rules and static IP egress for Xendit/Stripe webhook allow-lists.

```bash
# Backend service -> Cloud Run via serverless NEG (create in Console or gcloud)
gcloud compute security-policies create paydash-waf \
  --description="PayDash WAF"
gcloud compute security-policies rules create 1000 \
  --security-policy=paydash-waf \
  --expression="evaluatePreconfiguredExpr('xss-v33-stable') || evaluatePreconfiguredExpr('sqli-v33-stable') || evaluatePreconfiguredExpr('rce-v33-stable')" \
  --action=deny-403
# attach to the backend service of your LB (URL maps) — see Console:
#   Network services > Load balancing > edit backend > Security policy
```

Webhook callbacks from Xendit/Stripe should hit a **separate public path** (`/api/webhooks/*`); keep the rest behind auth. Confirm `PAYMENTS_PUBLIC_ORIGIN` matches the LB URL so redirects/callbacks are valid.

---

## 9. Observability & verification

- **Sentry**: DSN already set via Secret Manager; `@sentry/nextjs` traces server actions automatically.
- **OTel**: `@vercel/otel` + `useReportWebVitals` → configure OTLP endpoint/headers env in Secret Manager to your collector.
- **Logging**: Cloud Run → Cloud Logging by default. Add `pino` structured logs (already in stack).
- **Alerts**: Cloud Monitoring uptime check on `$URL/api/health` (2 min interval) + alert on 5xx > 1%.
- **Rollback** (payment gateway = critical): `gcloud run services update-traffic "$SERVICE_NAME" --region="$REGION" --to-revisions=PAYDASH-PREV=100` — keep the last good image tag.

---

## 10. Firestore + Gemini journal

Follow `docs/AI_JOURNAL_CLOUD_RUN.md` §2–§4 exactly: enable Firestore native, deploy `firestore.rules`, enable Firebase Auth (Google), add the Cloud Run URL to **Authorized domains**. The runner SA already has `roles/datastore.user` and `GEMINI_API_KEY` is read from Secret Manager at runtime.

---

## 11. Checklist (run every deploy)

- [ ] Gates from §0 all green (typecheck / lint / test / build / e2e / security audit)
- [ ] New Prisma migration committed and `migrate deploy` job ran green
- [ ] Secrets exist in Secret Manager (no `.env.prod` on the box)
- [ ] `SECRET_STORE_MODE=kms` + KMS key id set (not `local`)
- [ ] Cloud Run revision deployed; health `200`
- [ ] Browser smoke: sign-in, TEST MODE banner, payment page, journal
- [ ] Webhook callbacks reachable from Xendit/Stripe test
- [ ] Rollback image tag recorded