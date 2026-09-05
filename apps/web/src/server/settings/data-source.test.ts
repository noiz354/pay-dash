import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { RuntimeSettingsStore } from "@/server/settings/runtime-settings";
import { dataSourceError, isDataSource, resolveDataSource } from "./data-source";

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

describe("resolveDataSource", () => {
  it("prefers the per-tool override", async () => {
    const store = new RuntimeSettingsStore(createFakeFirestore({ "settings/runtime": { dataSource: "memory" } }));
    expect(await resolveDataSource("postgres", store)).toBe("postgres");
    expect(await resolveDataSource("memory", store)).toBe("memory");
  });

  it("falls back to the runtime setting", async () => {
    const store = new RuntimeSettingsStore(createFakeFirestore({ "settings/runtime": { dataSource: "postgres" } }));
    expect(await resolveDataSource(undefined, store)).toBe("postgres");
  });

  it("ignores invalid overrides and uses the runtime setting", async () => {
    const store = new RuntimeSettingsStore(createFakeFirestore({ "settings/runtime": { dataSource: "memory" } }));
    expect(await resolveDataSource("bogus", store)).toBe("memory");
  });

  it("isDataSource only accepts memory/postgres", () => {
    expect(isDataSource("memory")).toBe(true);
    expect(isDataSource("postgres")).toBe(true);
    expect(isDataSource("mongo")).toBe(false);
    expect(isDataSource(undefined)).toBe(false);
  });

  it("dataSourceError names the domain", () => {
    expect(dataSourceError("list_invoices").error).toContain("list_invoices");
  });
});