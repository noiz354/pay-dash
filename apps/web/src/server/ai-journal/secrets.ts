import "server-only";

import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

let cachedGeminiApiKey: string | undefined;
let secretManagerClient: SecretManagerServiceClient | undefined;

function projectId() {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

function geminiSecretResourceName() {
  if (process.env.GEMINI_API_KEY_SECRET_RESOURCE) return process.env.GEMINI_API_KEY_SECRET_RESOURCE;

  const project = projectId();
  if (!project) return undefined;

  const secretId = process.env.GEMINI_API_KEY_SECRET_ID ?? "GEMINI_API_KEY";
  const version = process.env.GEMINI_API_KEY_SECRET_VERSION ?? "latest";
  return `projects/${project}/secrets/${secretId}/versions/${version}`;
}

function client() {
  secretManagerClient ??= new SecretManagerServiceClient();
  return secretManagerClient;
}

export async function getGeminiApiKey(): Promise<string> {
  if (cachedGeminiApiKey) return cachedGeminiApiKey;

  const resourceName = geminiSecretResourceName();
  if (!resourceName) {
    const allowLocalFallback =
      process.env.NODE_ENV !== "production" && process.env.AI_JOURNAL_ALLOW_ENV_GEMINI_KEY === "true";
    const localKey = process.env.GEMINI_API_KEY;
    if (allowLocalFallback && localKey) {
      cachedGeminiApiKey = localKey.trim();
      return cachedGeminiApiKey;
    }

    throw new Error(
      "GEMINI_API_KEY Secret Manager resource is not configured. Set GEMINI_API_KEY_SECRET_RESOURCE or GOOGLE_CLOUD_PROJECT."
    );
  }

  const [version] = await client().accessSecretVersion({ name: resourceName });
  const payload = version.payload?.data;
  const value = typeof payload === "string" ? payload.trim() : payload?.toString("utf8").trim();

  if (!value) {
    throw new Error("Gemini API key Secret Manager payload is empty.");
  }

  cachedGeminiApiKey = value;
  return cachedGeminiApiKey;
}
