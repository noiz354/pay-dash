import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  buildXenditReadDeps,
  executeXenditReadTool,
  type MinimalXenditClient,
  type XenditReadDeps,
} from "@/server/ai-journal/xendit-read";
import { textResult, type McpToolResult } from "./handlers";

export type { MinimalXenditClient };
export type XenditToolDeps = XenditReadDeps;
export const buildXenditToolDeps = buildXenditReadDeps;

export async function xenditGetBalance(deps: XenditToolDeps): Promise<McpToolResult> {
  const result = await executeXenditReadTool("xendit_get_balance", {}, deps);
  return textResult(result.ok ? result.data : { error: result.error });
}

export async function xenditCreateInvoice(
  deps: XenditToolDeps,
  input: { externalId: string; amount: number; description?: string; payerEmail?: string }
): Promise<McpToolResult> {
  const settings = await deps.store.get();
  if (!settings.xenditEnabled) {
    return textResult({ error: "Xendit live calls are disabled in runtime settings." });
  }
  const secret = deps.getSecret();
  if (!secret) {
    return textResult({ error: "Xendit secret key is not configured." });
  }
  try {
    const client = await deps.createClient(secret);
    const invoice = await client.Invoice.createInvoice({
      external_id: input.externalId,
      amount: input.amount,
      description: input.description ?? "PayDash invoice",
      ...(input.payerEmail ? { payer_email: input.payerEmail } : {}),
    });
    return textResult({ id: invoice.id, invoiceUrl: invoice.invoice_url ?? null, status: invoice.status ?? null, source: "xendit-live" });
  } catch (error) {
    return textResult({ error: error instanceof Error ? error.message : "Xendit invoice creation failed." });
  }
}

export async function xenditListTransactions(deps: XenditToolDeps, input: { limit?: number }): Promise<McpToolResult> {
  const result = await executeXenditReadTool("xendit_list_transactions", { limit: input.limit }, deps);
  return textResult(result.ok ? result.data : { error: result.error });
}

export function registerXenditTools(server: McpServer, deps: XenditToolDeps = buildXenditToolDeps()): void {
  server.registerTool("xendit_get_balance", { title: "Xendit balance", description: "Live Xendit balance (CASH/IDR). Requires Xendit live calls enabled." }, async () => xenditGetBalance(deps));
  server.registerTool(
    "xendit_create_invoice",
    {
      title: "Xendit create invoice",
      description: "Create a hosted payment invoice via Xendit (TEST mode).",
      inputSchema: { externalId: z.string().min(1), amount: z.number().positive(), description: z.string().optional(), payerEmail: z.string().email().optional() },
    },
    async ({ externalId, amount, description, payerEmail }) => xenditCreateInvoice(deps, { externalId, amount, description, payerEmail })
  );
  server.registerTool(
    "xendit_list_transactions",
    { title: "Xendit list transactions", description: "List recent Xendit transactions (TEST mode).", inputSchema: { limit: z.number().int().positive().max(100).optional() } },
    async ({ limit }) => xenditListTransactions(deps, { limit })
  );
}