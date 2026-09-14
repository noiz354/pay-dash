import "server-only";

import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { getPayoutsOverview } from "@/server/data/payouts";
import { toOrganizationContext } from "../context";
import { okResult, type AgentContext, type ToolResultContract } from "../types";

/**
 * Strands tool adapter over the existing payouts overview (READ_ONLY).
 * Payout mutations stay behind the approval flow (WAVE 5-6); they are
 * deliberately NOT exposed as direct agent tools.
 */
export function buildPayoutTools(context: AgentContext) {
  const org = toOrganizationContext(context);

  return [
    tool({
      name: "agent_get_payouts_overview",
      description:
        "Read-only. Returns this merchant's payout aggregates: pending amount/batches/recipients, completed volume in the last 30 days, failed amount/recipients, and the next scheduled payout. Use this to investigate settlement gaps caused by failed or pending payouts.",
      inputSchema: z.object({}),
      callback: async (): Promise<ToolResultContract> => {
        const overview = await getPayoutsOverview(org);
        return okResult(
          `Payouts: pending ${overview.currency} ${overview.pendingAmount} (${overview.pendingBatches} batches, ${overview.pendingRecipients} recipients), failed ${overview.failedAmount} (${overview.failedRecipients} recipients), completed 30d ${overview.completedAmount30d}, next scheduled ${overview.nextScheduledAt ?? "none"}.`,
          { ...overview },
          ["payouts_overview"],
        );
      },
    }),
  ];
}
