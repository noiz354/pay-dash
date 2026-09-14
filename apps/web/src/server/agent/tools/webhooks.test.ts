import { describe, expect, it } from "vitest";

import { buildAgentContext } from "../context";
import { buildWebhookTools } from "./webhooks";
import type { ToolResultContract } from "../types";

type Invokeable = { invoke(input: unknown): Promise<ToolResultContract> };

describe("webhook summary tool adapter (aggregates only)", () => {
  it("returns 24h aggregates without exposing event ids or payloads", async () => {
    const [summaryTool] = buildWebhookTools(buildAgentContext({ organizationId: "agent_whk" }));
    const result = await (summaryTool as unknown as Invokeable).invoke({});

    expect(result.status).toBe("ok");
    expect(result.summary).toContain("Webhooks");
    expect(result.data?.last24h).toMatchObject({
      total: expect.any(Number),
      received: expect.any(Number),
      duplicated: expect.any(Number),
      rejected: expect.any(Number),
    });

    // The system-level webhook store must never leak event detail through
    // the agent: no rows, no recent events, no payloads.
    expect(result.data?.rows).toBeUndefined();
    expect(result.data?.recent).toBeUndefined();
    expect(result.data?.payload).toBeUndefined();
  });
});
