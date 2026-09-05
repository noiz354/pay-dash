import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { RuntimeSettingsStore } from "@/server/settings/runtime-settings";
import {
  buildXenditReadDeps,
  executeXenditReadTool,
  XENDIT_READ_FUNCTIONS,
  type MinimalXenditClient,
} from "./xendit-read";

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
    Balance: { getBalance: async () => ({ balance: 1005870599, currency: "IDR" }) },
    Invoice: {
      createInvoice: async (input: Record<string, unknown>) => ({ id: "inv_1", invoice_url: "https://x", status: "PENDING", ...input }),
    },
    Transaction: { getAllTransactions: async () => [{ id: "t1" }, { id: "t2" }, { id: "t3" }] },
  } as unknown as MinimalXenditClient;
}

const enabledDeps = () =>
  buildXenditReadDeps({
    store: storeWith({ xenditEnabled: true }),
    getSecret: () => "sk_test",
    createClient: () => fakeClient(),
  });

describe("XENDIT_READ_FUNCTIONS", () => {
  it("declares the two read-only tools", () => {
    const names = XENDIT_READ_FUNCTIONS.map((fn) => fn.name);
    expect(names).toEqual(["xendit_get_balance", "xendit_list_transactions"]);
  });
});

describe("executeXenditReadTool", () => {
  it("returns an error when Xendit live calls are disabled", async () => {
    const deps = buildXenditReadDeps({ store: storeWith({ xenditEnabled: false }) });
    const result = await executeXenditReadTool("xendit_get_balance", {}, deps);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("disabled");
  });

  it("returns an error when the secret key is missing", async () => {
    const deps = buildXenditReadDeps({ store: storeWith({ xenditEnabled: true }), getSecret: () => null });
    const result = await executeXenditReadTool("xendit_get_balance", {}, deps);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("not configured");
  });

  it("reads the live balance", async () => {
    const result = await executeXenditReadTool("xendit_get_balance", {}, enabledDeps());
    expect(result).toEqual({ ok: true, data: { available: 1005870599, currency: "IDR", source: "xendit-live" } });
  });

  it("reads the transaction count with a bounded limit", async () => {
    const result = await executeXenditReadTool("xendit_list_transactions", { limit: 1000 }, enabledDeps());
    expect(result).toEqual({ ok: true, data: { count: 3, source: "xendit-live" } });
  });

  it("rejects an unknown tool name", async () => {
    const result = await executeXenditReadTool("xendit_create_invoice", {}, enabledDeps());
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("Unknown Xendit read tool");
  });
});