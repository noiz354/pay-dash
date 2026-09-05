import { afterEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { RuntimeSettingsStore } from "./runtime-settings";

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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("RuntimeSettingsStore", () => {
  it("returns defaults when Firestore is empty and env is memory", async () => {
    vi.stubEnv("PAYDASH_DATA_SOURCE", "memory");
    const store = new RuntimeSettingsStore(createFakeFirestore());
    const settings = await store.get();
    expect(settings).toMatchObject({
      dataSource: "memory",
      mcpEnabled: false,
      mcpToken: null,
      xenditEnabled: false,
    });
    expect(settings.updatedAt).toBeNull();
  });

  it("honours the postgres env default when Firestore has no value", async () => {
    vi.stubEnv("PAYDASH_DATA_SOURCE", "postgres");
    const store = new RuntimeSettingsStore(createFakeFirestore());
    expect((await store.get()).dataSource).toBe("postgres");
  });

  it("falls back to the MCP_ACCESS_TOKEN env when Firestore has no token", async () => {
    vi.stubEnv("MCP_ACCESS_TOKEN", "env-token");
    const store = new RuntimeSettingsStore(createFakeFirestore());
    expect((await store.get()).mcpToken).toBe("env-token");
  });

  it("reads persisted settings from Firestore over env defaults", async () => {
    const store = new RuntimeSettingsStore(
      createFakeFirestore({
        "settings/runtime": {
          dataSource: "postgres",
          mcpEnabled: true,
          mcpToken: "stored-token",
          xenditEnabled: true,
        },
      })
    );
    const settings = await store.get();
    expect(settings).toMatchObject({
      dataSource: "postgres",
      mcpEnabled: true,
      mcpToken: "stored-token",
      xenditEnabled: true,
    });
  });

  it("persists an update and stamps updatedAt", async () => {
    const store = new RuntimeSettingsStore(createFakeFirestore());
    const updated = await store.update({ mcpEnabled: true, dataSource: "postgres" });
    expect(updated.mcpEnabled).toBe(true);
    expect(updated.dataSource).toBe("postgres");
    const reloaded = await store.get();
    expect(reloaded.mcpEnabled).toBe(true);
    expect(reloaded.dataSource).toBe("postgres");
    expect(typeof reloaded.updatedAt).toBe("string");
  });

  it("rotates the MCP token and persists a new unique token", async () => {
    const store = new RuntimeSettingsStore(createFakeFirestore());
    const first = await store.rotateMcpToken();
    expect(first.token).toBeTruthy();
    expect(first.token.length).toBeGreaterThanOrEqual(32);
    const second = await store.rotateMcpToken();
    expect(second.token).not.toBe(first.token);
    expect((await store.get()).mcpToken).toBe(second.token);
  });
});