import "server-only";

import { env } from "@/lib/env";
import { getRuntimeSettingsStore, type RuntimeSettingsStore } from "@/server/settings/runtime-settings";

export type MinimalXenditClient = {
  Balance: { getBalance(opts: { accountType: string; currency: string }): Promise<{ balance: number; currency: string }> };
  Invoice: { createInvoice(opts: Record<string, unknown>): Promise<{ id: string; invoice_url?: string; status?: string }> };
  Transaction: { getAllTransactions(opts?: Record<string, unknown>): Promise<Array<Record<string, unknown>>> };
};

export type XenditReadDeps = {
  store: RuntimeSettingsStore;
  getSecret: () => string | null;
  createClient: (secret: string) => MinimalXenditClient | Promise<MinimalXenditClient>;
};

export function buildXenditReadDeps(overrides: Partial<XenditReadDeps> = {}): XenditReadDeps {
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

export const XENDIT_READ_FUNCTIONS = [
  {
    name: "xendit_get_balance",
    description: "Read the live Xendit balance (CASH, IDR) in test mode. Returns available, currency and source.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "xendit_list_transactions",
    description: "Read the recent Xendit transactions in test mode. Returns the number of transactions.",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", description: "Number of transactions to fetch (max 100)." } },
    },
  },
] as const;

export type XenditReadToolName = (typeof XENDIT_READ_FUNCTIONS)[number]["name"];

export type XenditReadResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export async function executeXenditReadTool(
  name: string,
  args: Record<string, unknown> = {},
  deps: XenditReadDeps = buildXenditReadDeps()
): Promise<XenditReadResult> {
  const settings = await deps.store.get();
  if (!settings.xenditEnabled) {
    return { ok: false, error: "Xendit live calls are disabled in runtime settings." };
  }
  const secret = deps.getSecret();
  if (!secret) {
    return { ok: false, error: "Xendit secret key is not configured." };
  }
  const client = await deps.createClient(secret);
  try {
    if (name === "xendit_get_balance") {
      const balance = await client.Balance.getBalance({ accountType: "CASH", currency: "IDR" });
      return { ok: true, data: { available: balance.balance, currency: balance.currency, source: "xendit-live" } };
    }
    if (name === "xendit_list_transactions") {
      const limit = Math.min(Math.max(Number(args.limit ?? 20), 1), 100);
      const transactions = await client.Transaction.getAllTransactions({ limit: String(limit) });
      return { ok: true, data: { count: Array.isArray(transactions) ? transactions.length : 0, source: "xendit-live" } };
    }
    return { ok: false, error: `Unknown Xendit read tool: ${name}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Xendit call failed." };
  }
}