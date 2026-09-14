import { describe, expect, it } from "vitest";
import type { Message, ModelStreamEvent, StreamOptions } from "@strands-agents/sdk";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { seedDemoLedgerForOrganization } from "@/server/data/transactions";
import { runMerchantOpsAgent } from "./agent";
import { buildAgentContext } from "./context";
import { MockModel } from "./testing/mock-model";

const FINAL_ANSWER =
  "Settlement is lower because 3 payouts failed today (evidence: agent_get_payouts_overview). Recommend reviewing the failed batch before release.";

describe("merchant ops agent (Strands orchestration, offline)", () => {
  it("runs the Strands loop end-to-end: model selects a tool, tool executes, answer is synthesized", async () => {
    const orgCtx = parseOrganizationContext({ organizationId: "agent_e2e_org" });
    seedDemoLedgerForOrganization(orgCtx, {
      rows: [{ id: "txn_e2e_1", amount: 5_000, status: "SUCCEEDED" }],
      mode: "replace",
    });

    const model = new MockModel([
      { kind: "tool", tool: "agent_get_ledger_metrics", input: {} },
      { kind: "text", text: FINAL_ANSWER },
    ]);

    const result = await runMerchantOpsAgent({
      context: buildAgentContext({ organizationId: "agent_e2e_org", userId: "u_e2e" }),
      message: "Why is today's settlement lower than yesterday?",
      model,
    });

    expect(result.status).toBe("completed");
    expect(result.mode).toBe("read_only");
    expect(result.summary).toContain("Settlement is lower");
    expect(result.toolActivity.map((entry) => entry.tool)).toContain("agent_get_ledger_metrics");
    expect(result.toolActivity.every((entry) => entry.status === "ok")).toBe(true);
  });

  it("surfaces model failures instead of inventing success", async () => {
    class BrokenModel extends MockModel {
      override async *stream(
        _messages: Message[],
        _options?: StreamOptions,
      ): AsyncIterable<ModelStreamEvent> {
        throw new Error("mock model failed");
      }
    }

    const result = await runMerchantOpsAgent({
      context: buildAgentContext({ organizationId: "agent_e2e_org" }),
      message: "hello",
      model: new BrokenModel([]),
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("mock model failed");
    expect(result.summary).toContain("No action was taken");
  });
});
