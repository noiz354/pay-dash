import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { RuntimeSettingsStore } from "@/server/settings/runtime-settings";
import {
  getMcpStatusHandler,
  getRuntimeSettingsHandler,
  pingHandler,
  rotateMcpTokenHandler,
  setDataSourceHandler,
  textResult,
} from "./handlers";

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

function readText(result: ReturnType<typeof textResult>): string {
  return result.content[0]?.text ?? "";
}

describe("mcp handlers", () => {
  it("ping returns ok + service name", async () => {
    const result = await pingHandler();
    const parsed = JSON.parse(readText(result)) as { ok: boolean; service: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.service).toBe("paydash");
  });

  it("getRuntimeSettingsHandler returns the persisted settings", async () => {
    const store = new RuntimeSettingsStore(
      createFakeFirestore({
        "settings/runtime": { dataSource: "postgres", mcpEnabled: true, mcpToken: "tok", xenditEnabled: true },
      })
    );
    const parsed = JSON.parse(readText(await getRuntimeSettingsHandler(store))) as {
      dataSource: string;
      mcpEnabled: boolean;
      mcpToken: string;
    };
    expect(parsed.dataSource).toBe("postgres");
    expect(parsed.mcpEnabled).toBe(true);
    expect(parsed.mcpToken).toBe("tok");
  });

  it("getMcpStatusHandler reports enabled + token presence without leaking the token", async () => {
    const store = new RuntimeSettingsStore(
      createFakeFirestore({ "settings/runtime": { mcpEnabled: true, mcpToken: "secret-token" } })
    );
    const parsed = JSON.parse(readText(await getMcpStatusHandler(store))) as {
      mcpEnabled: boolean;
      hasToken: boolean;
      mcpToken?: string;
    };
    expect(parsed).toEqual({ mcpEnabled: true, hasToken: true });
  });

  it("setDataSourceHandler switches the source and persists it", async () => {
    const store = new RuntimeSettingsStore(createFakeFirestore());
    await setDataSourceHandler(store, "postgres");
    expect((await store.get()).dataSource).toBe("postgres");
  });

  it("setDataSourceHandler rejects an invalid source", async () => {
    const store = new RuntimeSettingsStore(createFakeFirestore());
    const result = JSON.parse(readText(await setDataSourceHandler(store, "bogus"))) as { error: string };
    expect(result.error).toContain("Invalid data source");
    expect((await store.get()).dataSource).toBe("memory");
  });

  it("rotateMcpTokenHandler generates a new token and persists it", async () => {
    const store = new RuntimeSettingsStore(createFakeFirestore());
    const parsed = JSON.parse(readText(await rotateMcpTokenHandler(store))) as { token: string };
    expect(parsed.token).toBeTruthy();
    expect((await store.get()).mcpToken).toBe(parsed.token);
  });
});