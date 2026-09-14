import "server-only";

import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { getLedgerMetrics, getTransaction } from "@/server/data/transactions";
import { toOrganizationContext } from "../context";
import { errorResult, okResult, type AgentContext, type ToolResultContract } from "../types";

/**
 * Strands tool adapters over the existing ledger data functions.
 *
 * Business logic is NOT duplicated: these callbacks are thin, tenant-scoped
 * wrappers that normalize the output for the model (spec §7, §17).
 */

function pick<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = obj[key];
  return out;
}

const TRANSACTION_FIELDS = [
  "id",
  "referenceId",
  "status",
  "amount",
  "currency",
  "fee",
  "net",
  "channel",
  "methodLabel",
  "refundedAmount",
  "refundState",
  "createdAt",
  "updatedAt",
] as const;

export function buildLedgerTools(context: AgentContext) {
  const org = toOrganizationContext(context);

  return [
    tool({
      name: "agent_get_ledger_metrics",
      description:
        "Read-only. Returns this merchant's ledger aggregates for the current 7-day window vs the previous window: total volume, succeeded/failed/processing counts, failure rate and deltas. Use this to quantify settlement or payment anomalies.",
      inputSchema: z.object({}),
      callback: async (): Promise<ToolResultContract> => {
        const metrics = await getLedgerMetrics(org);
        return okResult(
          `Ledger (7d): volume ${metrics.currency} ${metrics.totalVolume}, ${metrics.succeededCount} succeeded, ${metrics.failedCount} failed (rate ${metrics.failedRate}), ${metrics.processingCount} processing; vs previous period volume delta ${metrics.volumeDelta}.`,
          { ...metrics },
          ["ledger_metrics"],
        );
      },
    }),

    tool({
      name: "agent_get_transaction",
      description:
        "Read-only. Fetch ONE ledger transaction by id inside this merchant's scope. Returns null-shaped 'not found' when the id does not belong to this merchant. Never use to enumerate large lists.",
      inputSchema: z.object({
        transactionId: z.string().min(1).max(80).describe("The ledger transaction id, e.g. txn_..."),
      }),
      callback: async ({ transactionId }): Promise<ToolResultContract> => {
        const txn = await getTransaction(org, transactionId);
        if (!txn) {
          return errorResult(
            `Transaction ${transactionId} not found in this merchant's ledger (or belongs to another scope).`,
            "NOT_FOUND",
          );
        }
        return okResult(
          `Transaction ${txn.id} is ${txn.status}: ${txn.amount} ${txn.currency} via ${txn.channel}, refundState ${txn.refundState}.`,
          pick(txn as unknown as Record<string, unknown>, TRANSACTION_FIELDS) as unknown as Record<string, unknown>,
          [txn.id],
        );
      },
    }),
  ];
}
