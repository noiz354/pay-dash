import "server-only";

import { BedrockModel, type Model } from "@strands-agents/sdk";
import { GoogleModel } from "@strands-agents/sdk/models/google";
import type { BaseModelConfig } from "@strands-agents/sdk";

/**
 * Model provider abstraction (spec §6).
 *
 * Default: Amazon Bedrock (Claude Sonnet 4.6 — the Strands default model).
 * Optional fallback: Google (Gemini) for environments where Bedrock is not
 * configured yet. Credentials are NEVER stored in the repo:
 *   - Bedrock: AWS_* env vars / IAM role (no static keys in code), or
 *     AWS_BEARER_TOKEN_BEDROCK (Bedrock API key).
 *   - Google:  standard GOOGLE_API_KEY env handled by the SDK.
 */

export const DEFAULT_BEDROCK_MODEL_ID = "global.anthropic.claude-sonnet-4-6";
export const DEFAULT_GOOGLE_MODEL_ID = "gemini-3.6-flash";

export type AgentModelKind = "bedrock" | "google";

export function resolveModelKind(): AgentModelKind {
  const raw = process.env.AGENT_MODEL_PROVIDER?.trim().toLowerCase();
  return raw === "google" ? "google" : "bedrock";
}

export function createAgentModel(): Model<BaseModelConfig> {
  const kind = resolveModelKind();
  if (kind === "google") {
    return new GoogleModel({
      modelId: process.env.AGENT_GOOGLE_MODEL ?? DEFAULT_GOOGLE_MODEL_ID,
    }) as unknown as Model<BaseModelConfig>;
  }
  return new BedrockModel({
    modelId: process.env.BEDROCK_MODEL_ID ?? DEFAULT_BEDROCK_MODEL_ID,
    region: process.env.AWS_REGION,
    temperature: 0.2,
    maxTokens: 1024,
  }) as unknown as Model<BaseModelConfig>;
}

/** Positive integer env helper with a safe fallback. */
export function readPositiveInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}
