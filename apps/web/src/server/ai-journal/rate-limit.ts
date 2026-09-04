import "server-only";

export class RateLimitError extends Error {
  status = 429;
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("You have reached the demo AI message limit. Please wait a few minutes before sending another prompt.");
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type BucketStore = Map<string, number[]>;

declare global {
  var __paydashAiJournalRateLimit: BucketStore | undefined;
}

const WINDOW_MS = 10 * 60 * 1000;
const MAX_MESSAGES = 10;

function buckets(): BucketStore {
  globalThis.__paydashAiJournalRateLimit ??= new Map();
  return globalThis.__paydashAiJournalRateLimit;
}

export function assertWithinAiJournalRateLimit(uid: string, now = Date.now()) {
  const store = buckets();
  const cutoff = now - WINDOW_MS;
  const recent = (store.get(uid) ?? []).filter((timestamp) => timestamp > cutoff);

  if (recent.length >= MAX_MESSAGES) {
    const oldest = Math.min(...recent);
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    store.set(uid, recent);
    throw new RateLimitError(retryAfterSeconds);
  }

  recent.push(now);
  store.set(uid, recent);
}

export function getAiJournalRateLimitPolicy() {
  return {
    maxMessages: MAX_MESSAGES,
    windowMinutes: WINDOW_MS / 60_000,
  };
}
