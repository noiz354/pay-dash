import "server-only";

import { applicationDefault, cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const FIREBASE_ADMIN_APP_NAME = "paydash-ai-journal";

function projectId() {
  return (
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

function serviceAccountFromEnv(): ServiceAccount | undefined {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const parsed = JSON.parse(json) as ServiceAccount & {
      client_email?: string;
      private_key?: string;
      project_id?: string;
    };
    return {
      clientEmail: parsed.clientEmail ?? parsed.client_email,
      privateKey: (parsed.privateKey ?? parsed.private_key)?.replace(/\\n/g, "\n"),
      projectId: parsed.projectId ?? parsed.project_id ?? projectId(),
    };
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const resolvedProjectId = projectId();

  if (!clientEmail || !privateKey || !resolvedProjectId) return undefined;

  return {
    clientEmail,
    privateKey,
    projectId: resolvedProjectId,
  };
}

export function getFirebaseAdminApp(): App {
  const existing = getApps().find((app) => app.name === FIREBASE_ADMIN_APP_NAME);
  if (existing) return existing;

  const account = serviceAccountFromEnv();
  return initializeApp(
    {
      credential: account ? cert(account) : applicationDefault(),
      projectId: projectId(),
    },
    FIREBASE_ADMIN_APP_NAME
  );
}

export function getFirebaseAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminFirestore(): Firestore {
  return getFirestore(getFirebaseAdminApp());
}
