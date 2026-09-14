import "server-only";

/**
 * Agent-run rate limiter (WAVE 3).
 *
 * Model invocations cost money (Bedrock is usage-based), so the agent route
 * gets its own sliding-window limiter — separate from the journal's, keyed by
 * the authenticated actor. Mirrors `server/ai-journal/rate-limit.ts` pattern.
 */

export class AgentRateLimitError extends Error {
  status = 429;
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Agent run limit reached. Please wait a moment before the next run.");
    this.name = "AgentRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type BucketStore = Map<string, number[]>;

declare global {
  var __paydashAgentRunLimit: BucketStore | undefined;
}

const WINDOW_MS = 10 * 60 * 1000;
const MAX_RUNS = 10;

function buckets(): BucketStore {
  globalThis.__paydashAgentRunLimit ??= new Map();
  return globalThis.__paydashAgentRunLimit;
}

export function assertWithinAgentRateLimit(key: string, now = Date.now()): void {
  const store = buckets();
  const cutoff = now - WINDOW_MS;
  const recent = (store.get(key) ?? []).filter((timestamp) => timestamp > cutoff);

  if (recent.length >= MAX_RUNS) {
    const oldest = Math.min(...recent);
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    store.set(key, recent);
    throw new AgentRateLimitError(retryAfterSeconds);
  }

  recent.push(now);
  store.set(key, recent);
}

export function getAgentRateLimitPolicy() {
  return {
    maxRuns: MAX_RUNS,
    windowMinutes: WINDOW_MS / 60_000,
  };
}
