"use client";

import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { browserLocalPersistence, getAuth, GoogleAuthProvider, setPersistence, type Auth } from "firebase/auth";

export type FirebasePublicConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
};

export type FirebaseClientStatus = {
  configured: boolean;
  missing: string[];
  config: FirebasePublicConfig | null;
};

const buildTimeFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let persistenceConfigured = false;

function toStatus(config: Partial<FirebasePublicConfig>): FirebaseClientStatus {
  const entries = [
    ["NEXT_PUBLIC_FIREBASE_API_KEY", config.apiKey],
    ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", config.authDomain],
    ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", config.projectId],
    ["NEXT_PUBLIC_FIREBASE_APP_ID", config.appId],
  ] as const;
  const missing = entries.filter(([, value]) => !value).map(([key]) => key);

  return {
    configured: missing.length === 0,
    missing,
    config:
      missing.length === 0
        ? {
            apiKey: config.apiKey ?? "",
            authDomain: config.authDomain ?? "",
            projectId: config.projectId ?? "",
            appId: config.appId ?? "",
          }
        : null,
  };
}

export function getBuildTimeFirebaseClientStatus() {
  return toStatus(buildTimeFirebaseConfig);
}

export function normalizeFirebaseClientStatus(value: unknown): FirebaseClientStatus {
  if (!value || typeof value !== "object") return getBuildTimeFirebaseClientStatus();
  const candidate = value as { config?: Partial<FirebasePublicConfig> | null; missing?: unknown; configured?: unknown };
  const status = toStatus(candidate.config ?? {});
  if (status.configured) return status;

  const missing = Array.isArray(candidate.missing)
    ? candidate.missing.filter((entry): entry is string => typeof entry === "string")
    : status.missing;

  return {
    configured: candidate.configured === true && missing.length === 0,
    missing,
    config: null,
  };
}

export function getFirebaseApp(config: FirebasePublicConfig): FirebaseApp {
  const options: FirebaseOptions = config;
  return getApps().length > 0 ? getApp() : initializeApp(options);
}

export function getFirebaseAuth(config: FirebasePublicConfig): Auth {
  const auth = getAuth(getFirebaseApp(config));
  if (!persistenceConfigured) {
    persistenceConfigured = true;
    void setPersistence(auth, browserLocalPersistence).catch(() => {
      persistenceConfigured = false;
    });
  }
  return auth;
}

export function getGoogleAuthProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}
