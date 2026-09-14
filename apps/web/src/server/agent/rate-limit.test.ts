import { describe, expect, it } from "vitest";

import { assertWithinAgentRateLimit, getAgentRateLimitPolicy } from "./rate-limit";

describe("agent rate limiter", () => {
  it("allows up to the policy maximum within the window", () => {
    const { maxRuns } = getAgentRateLimitPolicy();
    const t0 = 1_000_000;
    for (let i = 0; i < maxRuns; i += 1) {
      expect(() => assertWithinAgentRateLimit(`key_a_${i}`, t0 + i)).not.toThrow();
    }
  });

  it("throws with a positive retry-after once the window is exhausted", () => {
    const { maxRuns } = getAgentRateLimitPolicy();
    const t0 = 2_000_000;
    for (let i = 0; i < maxRuns; i += 1) {
      assertWithinAgentRateLimit("key_exhausted", t0 + i);
    }
    try {
      assertWithinAgentRateLimit("key_exhausted", t0 + maxRuns);
      throw new Error("expected AgentRateLimitError");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(String((error as Error).name)).toBe("AgentRateLimitError");
      expect((error as { retryAfterSeconds?: number }).retryAfterSeconds ?? 0).toBeGreaterThan(0);
    }
  });

  it("keeps buckets independent per actor", () => {
    const { maxRuns } = getAgentRateLimitPolicy();
    const t0 = 3_000_000;
    for (let i = 0; i < maxRuns; i += 1) {
      assertWithinAgentRateLimit("actor_a", t0 + i);
    }
    expect(() => assertWithinAgentRateLimit("actor_b", t0 + maxRuns + 1)).not.toThrow();
  });
});
