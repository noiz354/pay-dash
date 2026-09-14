import "server-only";

import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { listTransactions } from "@/server/data/transactions";
import { toOrganizationContext } from "../context";
import { okResult, type AgentContext, type ToolResultContract } from "../types";

/**
 * Strands tool adapter over the existing tenant-scoped ledger listing.
 *
 * READ_ONLY. Output is deliberately capped and normalized: the model never
 * receives full row payloads, only the fields relevant to an investigation
 * plus row counts (spec §17 — avoid dumping the ledger into the model).
 */

const ROW_FIELDS = [
  "id",
  "referenceId",
  "status",
  "amount",
  "currency",
  "channel",
  "methodLabel",
  "refundState",
  "createdAt",
] as const;

const MAX_ROWS = 20;

function pickRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ROW_FIELDS) out[key] = row[key];
  return out;
}

export function buildTransactionTools(context: AgentContext) {
  const org = toOrganizationContext(context);

  return [
    tool({
      name: "agent_list_transactions",
      description:
        "Read-only. Lists this merchant's ledger transactions with an optional status filter (SUCCEEDED, PROCESSING, PENDING, FAILED, REFUNDED). Returns at most 20 rows. Use this to find failed or stuck transactions behind a settlement anomaly; then inspect one with agent_get_transaction.",
      inputSchema: z.object({
        status: z
          .enum(["SUCCEEDED", "PROCESSING", "PENDING", "FAILED", "REFUNDED"])
          .optional()
          .describe("Filter by transaction status; omit for all"),
      }),
      callback: async ({ status }): Promise<ToolResultContract> => {
        const page = await listTransactions(
          org,
          { status: status ?? "ALL", range: "all", page: 1, pageSize: MAX_ROWS, sort: "date", direction: "desc" },
          {},
        );
        const rows = page.rows.map((row) => pickRow(row as unknown as Record<string, unknown>));
        const statusText = status ? ` with status ${status}` : "";
        return okResult(
          `Ledger${statusText}: ${page.total} matching transaction(s) in this merchant's scope; showing ${rows.length} newest.`,
          { total: page.total, shown: rows.length, rows },
          rows.map((row) => String(row.id)),
        );
      },
    }),
  ];
}
