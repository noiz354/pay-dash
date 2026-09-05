import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { RuntimeSettingsStore } from "@/server/settings/runtime-settings";
import { authorizeMcpRequest } from "./auth";

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

function requestWithToken(token: string | null): Request {
  const headers: Record<string, string> = {};
  if (token) headers["authorization"] = `Bearer ${token}`;
  return new Request("https://example.com/api/mcp", { method: "POST", headers });
}

describe("authorizeMcpRequest", () => {
  it("rejects when MCP is disabled", async () => {
    const result = await authorizeMcpRequest(requestWithToken("t"), storeWith({ mcpEnabled: false, mcpToken: "t" }));
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("rejects when no token is configured", async () => {
    const result = await authorizeMcpRequest(requestWithToken(null), storeWith({ mcpEnabled: true, mcpToken: null }));
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects when the Bearer token is missing", async () => {
    const result = await authorizeMcpRequest(requestWithToken(null), storeWith({ mcpEnabled: true, mcpToken: "abc" }));
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects when the Bearer token is wrong", async () => {
    const result = await authorizeMcpRequest(requestWithToken("wrong"), storeWith({ mcpEnabled: true, mcpToken: "abc" }));
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("accepts a matching Bearer token", async () => {
    const result = await authorizeMcpRequest(requestWithToken("abc"), storeWith({ mcpEnabled: true, mcpToken: "abc" }));
    expect(result).toEqual({ ok: true });
  });
});