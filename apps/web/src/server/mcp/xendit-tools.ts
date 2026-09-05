import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { env } from "@/lib/env";
import { getRuntimeSettingsStore, type RuntimeSettingsStore } from "@/server/settings/runtime-settings";
import { textResult } from "./handlers";

export type MinimalXenditClient = {
  Balance: { getBalance(opts: { accountType: string; currency: string }): Promise<{ balance: number; currency: string }> };
  Invoice: { createInvoice(opts: Record<string, unknown>): Promise<{ id: string; invoice_url?: string; status?: string }> };
  Transaction: { getAllTransactions(opts?: Record<string, unknown>): Promise<Array<Record<string, unknown>>> };
};

export type XenditToolDeps = {
  store: RuntimeSettingsStore;
  getSecret: () => string | null;
  createClient: (secret: string) => MinimalXenditClient | Promise<MinimalXenditClient>;
};

export function buildXenditToolDeps(overrides: Partial<XenditToolDeps> = {}): XenditToolDeps {
  return {
    store: overrides.store ?? getRuntimeSettingsStore(),
    getSecret: overrides.getSecret ?? (() => env.XENDIT_SECRET_KEY ?? null),
    createClient:
      overrides.createClient ??
      (async (secret) => {
        const { createXenditClient } = await import("@/lib/xendit");
        return createXenditClient(secret) as unknown as MinimalXenditClient;
      }),
  };
}

export async function xenditGetBalance(deps: XenditToolDeps): Promise<{ content: Array<{ type: "text"; text: string }> }> {
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
    const balance = await client.Balance.getBalance({ accountType: "CASH", currency: "IDR" });
    return textResult({ available: balance.balance, currency: balance.currency, source: "xendit-live" });
  } catch (error) {
    return textResult({ error: error instanceof Error ? error.message : "Xendit balance call failed." });
  }
}

export async function xenditCreateInvoice(
  deps: XenditToolDeps,
  input: { externalId: string; amount: number; description?: string; payerEmail?: string }
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
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

export async function xenditListTransactions(
  deps: XenditToolDeps,
  input: { limit?: number }
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
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
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const transactions = await client.Transaction.getAllTransactions({ limit: String(limit) });
    return textResult({ count: Array.isArray(transactions) ? transactions.length : 0, source: "xendit-live" });
  } catch (error) {
    return textResult({ error: error instanceof Error ? error.message : "Xendit transactions call failed." });
  }
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