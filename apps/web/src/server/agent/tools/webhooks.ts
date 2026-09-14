import "server-only";

import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { getSystemWebhookSummary } from "@/server/data/webhooks";
import { okResult, type AgentContext, type ToolResultContract } from "../types";

/**
 * Strands tool adapter over the existing webhook summary.
 *
 * SAFETY NOTE: the current webhook store is system-level (not tenant-scoped —
 * see `server/data/webhooks.ts`). This tool therefore exposes AGGREGATE counts
 * only (last 24h totals, last callback time). It never returns event ids or
 * payloads, so no cross-tenant event detail can leak through the agent.
 * Event-level tools arrive when the webhook store becomes tenant-scoped.
 */
export function buildWebhookTools(_context: AgentContext) {
  return [
    tool({
      name: "agent_get_webhook_summary",
      description:
        "Read-only. Returns aggregate inbound-webhook health for the last 24 hours: total, received, duplicated and rejected counts, plus when the newest callback arrived. Use this to spot webhook anomalies (spikes of rejects/duplicates, or a stalled callback stream).",
      inputSchema: z.object({}),
      callback: async (): Promise<ToolResultContract> => {
        const summary = getSystemWebhookSummary();
        return okResult(
          `Webhooks (last 24h): ${summary.last24h.total} total — ${summary.last24h.received} received, ${summary.last24h.duplicated} duplicated, ${summary.last24h.rejected} rejected. Last callback: ${summary.lastReceivedAt ?? "none"}.`,
          {
            last24h: summary.last24h,
            lastReceivedAt: summary.lastReceivedAt,
          },
          ["webhook_summary_24h"],
        );
      },
    }),
  ];
}
