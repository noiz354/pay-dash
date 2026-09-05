import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { RuntimeSettingsStore } from "@/server/settings/runtime-settings";
import { buildXenditToolDeps, type MinimalXenditClient, xenditCreateInvoice, xenditGetBalance, xenditListTransactions } from "./xendit-tools";

type DocData = Record<string, unknown>;

function createFakeFirestore(initial: Record<string, DocData> = {}) {
  const map = new Map<string, DocData>(Object.entries(initial));
  return {
    doc(path: string) {
      return {
        async get() {
          const data = map.get(path);
          return { exists: data !== undefined, data: () => data ?? {} };
        },
        async set(data: DocData) {
          map.set(path, { ...data });
        },
      };
    },
  } as unknown as Firestore;
}

function storeWith(settings: DocData) {
  return new RuntimeSettingsStore(createFakeFirestore({ "settings/runtime": settings }));
}

function fakeClient(): MinimalXenditClient {
  return {
    Balance: { getBalance: async () => ({ balance: 1250000, currency: "IDR" }) },
    Invoice: {
      createInvoice: async (input: Record<string, unknown>) => ({
        id: "inv_123",
        invoice_url: "https://invoice.xendit.co/abc",
        status: "PENDING",
        ...input,
      }),
    },
    Transaction: { getAllTransactions: async () => [{ id: "txn_1" }, { id: "txn_2" }] },
  } as unknown as MinimalXenditClient;
}

function readText(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0]?.text ?? "";
}

const enabledDeps = () =>
  buildXenditToolDeps({
    store: storeWith({ xenditEnabled: true }),
    getSecret: () => "sk_test_123",
    createClient: () => fakeClient(),
  });

describe("xendit mcp tools", () => {
  it("refuses calls when Xendit live calls are disabled", async () => {
    const deps = buildXenditToolDeps({ store: storeWith({ xenditEnabled: false }) });
    const result = JSON.parse(readText(await xenditGetBalance(deps))) as { error: string };
    expect(result.error).toContain("disabled");
  });

  it("refuses calls when the secret key is missing", async () => {
    const deps = buildXenditToolDeps({ store: storeWith({ xenditEnabled: true }), getSecret: () => null });
    const result = JSON.parse(readText(await xenditGetBalance(deps))) as { error: string };
    expect(result.error).toContain("not configured");
  });

  it("xenditGetBalance returns the live balance", async () => {
    const parsed = JSON.parse(readText(await xenditGetBalance(enabledDeps()))) as {
      available: number;
      currency: string;
      source: string;
    };
    expect(parsed).toEqual({ available: 1250000, currency: "IDR", source: "xendit-live" });
  });

  it("xenditCreateInvoice returns the invoice id and URL", async () => {
    const parsed = JSON.parse(readText(await xenditCreateInvoice(enabledDeps(), { externalId: "ext_1", amount: 25000 }))) as {
      id: string;
      invoiceUrl: string;
      status: string;
    };
    expect(parsed).toMatchObject({ id: "inv_123", invoiceUrl: "https://invoice.xendit.co/abc", status: "PENDING" });
  });

  it("xenditListTransactions returns the transaction count", async () => {
    const parsed = JSON.parse(readText(await xenditListTransactions(enabledDeps(), { limit: 10 }))) as {
      count: number;
      source: string;
    };
    expect(parsed).toEqual({ count: 2, source: "xendit-live" });
  });
});