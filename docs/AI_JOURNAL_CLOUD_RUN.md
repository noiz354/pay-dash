# PayDash Gemini Journal — Cloud Run Ideathon Deployment

This app adds an Ideathon-ready **Personal Gemini Journal** agent at `/ai-journal`, plus three PayDash-specific agent pages at `/ai-journal/ops-copilot`, `/ai-journal/recovery-agent`, and `/ai-journal/readiness-agent`. It is designed for the Gen AI Academy APAC Ideathon requirements:

- **Firebase Authentication**: browser sign-in with Google via Firebase Auth.
- **Cloud Firestore**: user-isolated journal threads stored under `users/{uid}/interactions/{interactionId}` with message subcollections.
- **Gemini API**: server-side multi-turn generation with mode-specific instructions.
- **Google Cloud Secret Manager**: the Gemini API key is retrieved at runtime; it is never bundled into the browser.
- **Cloud Run**: the existing standalone Next.js Dockerfile deploys the app as a container.

## 1. Brainstormed concept

The selected concept is **Secure Merchant Ops Gemini Journal**. It keeps the baseline Personal Gemini Journal, but makes the domain specific to payment/merchant operators and adds three original enhancements:

1. **Merchant Ops Copilot page** — uses PayDash ledger, balance, payout, risk, and webhook snapshots for daily operations briefs.
2. **Failed Payment Recovery page** — uses failed transaction samples to draft recovery plans and customer-safe follow-ups.
3. **Launch Readiness page** — uses onboarding, payout, risk, and webhook state to score launch readiness.
4. **Brainstorm Skill** — applies Addy Osmani-style idea refinement: How Might We framing, variations, assumptions, and a Not Doing list.
5. **Submission Coach** — checks the Ideathon deliverables and drafts a sub-1024-character submission brief.
6. **Submission Cockpit** — a copy-ready UI for prototype/social/repo links, readiness checklist, brief text, and social post draft.

See `docs/ideas/secure-merchant-ops-gemini-journal.md` for the full brainstorming one-pager and `docs/AI_STUDIO_CUSTOM_INSTRUCTIONS.md` for the Google AI Studio system instructions used to keep extensions secure.

## 2. Google Cloud prerequisites

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="asia-southeast2" # or your chosen Cloud Run region
export SERVICE_NAME="paydash-gemini-journal"

gcloud config set project "$PROJECT_ID"

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com
```

Create/enable a Firebase project for the same Google Cloud project, then enable **Authentication → Sign-in method → Google** in the Firebase console. Add your Cloud Run URL domain to **Authentication → Settings → Authorized domains** after deployment.

## 3. Firestore database and security rules

Create Firestore in Native mode:

```bash
gcloud firestore databases create \
  --database="(default)" \
  --location="$REGION"
```

Deploy the owner-bound rules in `firestore.rules`:

```bash
firebase use "$PROJECT_ID"
firebase deploy --only firestore:rules
```

The rules intentionally avoid insecure defaults:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /interactions/{interactionId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
        match /messages/{messageId} {
          allow read, write: if request.auth != null && request.auth.uid == userId;
        }
      }
    }
  }
}
```

> The Next.js API uses the Firebase Admin SDK on Cloud Run, but keeping strict rules documents the intended isolation boundary and protects any future direct client reads.

## 4. Store the Gemini API key in Secret Manager

```bash
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
```

Grant the Cloud Run runtime service account access. For the default compute service account:

```bash
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export RUNTIME_SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/secretmanager.secretAccessor"
```

Also grant Firestore access if you use a custom runtime service account:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/datastore.user"
```

## 5. Required environment variables

Set these values from Firebase project settings → Web app configuration. The browser receives them from `/api/ai-journal/firebase-config` at runtime, so Cloud Run `--set-env-vars` works even when the Docker image was built before the final service URL existed:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY="..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="${PROJECT_ID}.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="$PROJECT_ID"
NEXT_PUBLIC_FIREBASE_APP_ID="..."
```

Server-side variables:

```bash
FIREBASE_PROJECT_ID="$PROJECT_ID"
GOOGLE_CLOUD_PROJECT="$PROJECT_ID"
GEMINI_API_KEY_SECRET_ID="GEMINI_API_KEY"
GEMINI_MODEL="gemini-3.6-flash"
NEXT_PUBLIC_APP_URL="https://YOUR_CLOUD_RUN_URL"
APP_ENV="production"
```

Local development can use Application Default Credentials:

```bash
gcloud auth application-default login
cd apps/web
cp .env.example .env.local
# Fill Firebase public values; do not put the Gemini key in public env vars.
```

## 6. Build and deploy to Cloud Run

From the repository root:

```bash
export FIREBASE_API_KEY="paste-from-firebase-web-app-config"
export FIREBASE_APP_ID="paste-from-firebase-web-app-config"

gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars="APP_ENV=production,FIREBASE_PROJECT_ID=$PROJECT_ID,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GEMINI_API_KEY_SECRET_ID=GEMINI_API_KEY,GEMINI_MODEL=gemini-3.6-flash,NEXT_PUBLIC_FIREBASE_API_KEY=$FIREBASE_API_KEY,NEXT_PUBLIC_FIREBASE_APP_ID=$FIREBASE_APP_ID,NEXT_PUBLIC_FIREBASE_PROJECT_ID=$PROJECT_ID,NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$PROJECT_ID.firebaseapp.com,NEXT_PUBLIC_APP_URL=https://REPLACE_AFTER_DEPLOY" \
  --update-labels="dev-tutorial=cloud-run-ai-challenge"
```

After the first deploy, copy the Cloud Run service URL and update `NEXT_PUBLIC_APP_URL` plus the Firebase authorized domain:

```bash
export SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)')"

gcloud run services update "$SERVICE_NAME" \
  --region "$REGION" \
  --update-env-vars="NEXT_PUBLIC_APP_URL=$SERVICE_URL" \
  --update-labels="dev-tutorial=cloud-run-ai-challenge"
```

Because the Firebase public config is served by `/api/ai-journal/firebase-config`, these values are safe as runtime environment variables. They are public identifiers, not operational secrets.

## 7. Walkthrough checklist

Use this for the demo video/blog post:

1. Open the Cloud Run URL and navigate to `/ai-journal`.
2. Click **Continue with Google** and sign in with Firebase Authentication.
3. Open `/ai-journal/ops-copilot` and run a daily operations briefing from PayDash ledger, payout, risk, and webhook signals.
4. Open `/ai-journal/recovery-agent` and generate a failed-payment recovery plan plus respectful customer message drafts.
5. Open `/ai-journal/readiness-agent` and generate a production/Ideathon readiness score.
6. Reload the app and open the same thread from **Firestore history** to prove persistence.
7. Use the **Submission Cockpit** to copy the brief and social post with `#AccelerateAIwithCloudRun`.
8. Show repository files: `firestore.rules`, `docs/AI_JOURNAL_CLOUD_RUN.md`, `src/server/ai-journal/secrets.ts`, and the Cloud Run label `dev-tutorial=cloud-run-ai-challenge`.

## 8. Submission-ready brief draft

> PayDash Gemini Journal is a secure merchant-ops AI workspace deployed on Cloud Run. Users sign in with Firebase Google Authentication, then use three PayDash-specific Gemini agents: Merchant Ops Copilot, Failed Payment Recovery, and Launch Readiness, plus Brainstorm and Submission Coach modes. Every prompt and Gemini response is stored privately in Cloud Firestore under `users/{uid}/interactions/{interactionId}/messages`, preventing cross-user leakage. The browser never receives Gemini credentials; the Cloud Run server verifies Firebase ID tokens with Firebase Admin and retrieves the Gemini API key from Google Cloud Secret Manager at runtime. The original enhancement is turning PayDash ledger, payout, risk, webhook, and onboarding context into private AI workflows for operations, revenue recovery, and launch/submission readiness.
