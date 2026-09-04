// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertWithinAiJournalRateLimit, RateLimitError } from "./rate-limit";

describe("AI journal rate limit", () => {
  it("limits Gemini calls per Firebase UID in the demo window", () => {
    const uid = `rate-user-${Math.random()}`;
    const now = Date.now();

    for (let i = 0; i < 10; i += 1) {
      expect(() => assertWithinAiJournalRateLimit(uid, now + i)).not.toThrow();
    }

    expect(() => assertWithinAiJournalRateLimit(uid, now + 11)).toThrow(RateLimitError);
    expect(() => assertWithinAiJournalRateLimit(uid, now + 10 * 60 * 1000 + 20)).not.toThrow();
  });
});
