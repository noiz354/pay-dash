import "server-only";

import { BedrockModel, type Model } from "@strands-agents/sdk";
import type { BaseModelConfig } from "@strands-agents/sdk";

/**
 * Model provider — AWS only (per project decision: all agent tech on AWS,
 * GCP left untouched).
 *
 * Amazon Bedrock is the Strands default provider. Credentials are NEVER
 * stored in the repo:
 *   - on AWS (Lightsail/EC2/ECS): instance IAM role or container credentials;
 *   - on Lightsail (no IAM role): AWS_BEARER_TOKEN_BEDROCK (Bedrock API key)
 *     or short-lived creds injected via env — see infra/aws/README.md;
 *   - local dev: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN
 *     in the developer's environment only (never committed).
 *
 * NOTE: `@google/genai` remains in package.json solely because the Strands
 * SDK main entry imports its Google module at load time. The agent itself
 * never constructs a Google model.
 */

export const DEFAULT_BEDROCK_MODEL_ID = "global.anthropic.claude-sonnet-4-6";

export function createAgentModel(): Model<BaseModelConfig> {
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
