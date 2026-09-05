import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { RuntimeSettingsStore } from "@/server/settings/runtime-settings";
import { buildMcpServer } from "./server";

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

function parseBody(text: string, contentType: string): unknown {
  if (contentType.includes("text/event-stream")) {
    const dataLines = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim());
    return JSON.parse(dataLines.join("\n"));
  }
  return JSON.parse(text);
}

async function rpc(method: string, params: Record<string, unknown>): Promise<{ result: Record<string, unknown> | undefined }> {
  const store = new RuntimeSettingsStore(createFakeFirestore());
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = buildMcpServer(store);
  await server.connect(transport);
  try {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const response = await transport.handleRequest(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body,
      })
    );
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    const parsed = parseBody(text, contentType) as { result?: Record<string, unknown>; error?: unknown };
    expect(response.status).toBe(200);
    return { result: parsed.result };
  } finally {
    await server.close().catch(() => undefined);
  }
}

describe("MCP server transport handshake", () => {
  it("initialize advertises the paydash server", async () => {
    const { result } = await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0" },
    });
    expect(result?.serverInfo).toMatchObject({ name: "paydash" });
  });

  it("tools/list exposes the settings and ping tools", async () => {
    const { result } = await rpc("tools/list", {});
    const names = ((result?.tools as Array<{ name: string }>) ?? []).map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(["ping", "get_runtime_settings", "get_mcp_status", "set_data_source", "rotate_mcp_token"])
    );
    expect(names).toContain("list_transactions");
    expect(names).toContain("list_invoices");
    expect(names).toContain("xendit_get_balance");
    expect(names).toContain("list_journal_conversations");
  });

  it("tools/call honors the per-tool postgres override (not-implemented path)", async () => {
    const { result } = await rpc("tools/call", { name: "list_invoices", arguments: { dataSource: "postgres" } });
    const content = (result?.content as Array<{ type: string; text: string }>) ?? [];
    expect(content[0]?.text ?? "").toContain("PostgreSQL store not implemented");
  });

  it("tools/call list_transactions in memory mode returns ledger rows", async () => {
    const { result } = await rpc("tools/call", { name: "list_transactions", arguments: { dataSource: "memory", page: 1, pageSize: 5 } });
    const content = (result?.content as Array<{ type: string; text: string }>) ?? [];
    expect(content[0]?.text ?? "").toContain("rows");
  });
});