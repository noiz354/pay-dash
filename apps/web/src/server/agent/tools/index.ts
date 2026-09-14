import "server-only";

import type { InvokableTool } from "@strands-agents/sdk";

import type { AgentContext, ToolRisk } from "../types";
import { buildLedgerTools } from "./ledger";
import { buildPayoutTools } from "./payouts";

/**
 * Tool registry (spec §7). Every tool adapter is classified by risk.
 * WAVE 1-4 exposes READ_ONLY tools only — writes arrive via the approval
 * flow (WAVE 5-6) and are never added to this list.
 */

export type AgentToolSpec = {
  readonly name: string;
  readonly risk: ToolRisk;
  readonly purpose: string;
};

export const READ_ONLY_TOOL_SPECS: readonly AgentToolSpec[] = [
  { name: "agent_get_ledger_metrics", risk: "READ_ONLY", purpose: "7d ledger aggregates + deltas" },
  { name: "agent_get_transaction", risk: "READ_ONLY", purpose: "single ledger transaction by id (tenant-scoped)" },
  { name: "agent_get_payouts_overview", risk: "READ_ONLY", purpose: "payout aggregates (pending/failed/completed)" },
];

/** Builds the read-only Strands tools bound to a trusted agent context. */
export function buildReadOnlyTools(context: AgentContext): InvokableTool<unknown, unknown>[] {
  return [...buildLedgerTools(context), ...buildPayoutTools(context)];
}
