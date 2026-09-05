import "server-only";

import { randomBytes } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/server/firebase/admin";

export const DATA_SOURCES = ["memory", "postgres"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export type RuntimeSettings = {
  dataSource: DataSource;
  mcpEnabled: boolean;
  mcpToken: string | null;
  xenditEnabled: boolean;
  updatedAt: string | null;
};

const RUNTIME_SETTINGS_DOC = "settings/runtime";

function envDataSource(): DataSource {
  return process.env.PAYDASH_DATA_SOURCE === "postgres" ? "postgres" : "memory";
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export class RuntimeSettingsStore {
  constructor(private readonly db: Firestore) {}

  async get(): Promise<RuntimeSettings> {
    const doc = await this.db.doc(RUNTIME_SETTINGS_DOC).get();
    const data = doc.exists ? (doc.data() ?? {}) : {};
    const envToken = process.env.MCP_ACCESS_TOKEN ?? null;
    return {
      dataSource: data.dataSource === "postgres" ? "postgres" : envDataSource(),
      mcpEnabled: data.mcpEnabled === true,
      mcpToken: typeof data.mcpToken === "string" && data.mcpToken ? data.mcpToken : envToken,
      xenditEnabled: data.xenditEnabled === true,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    };
  }

  async update(patch: Partial<RuntimeSettings>): Promise<RuntimeSettings> {
    const current = await this.get();
    const next: RuntimeSettings = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await this.db.doc(RUNTIME_SETTINGS_DOC).set(next);
    return next;
  }

  async rotateMcpToken(): Promise<{ token: string; settings: RuntimeSettings }> {
    const token = randomToken();
    const settings = await this.update({ mcpToken: token });
    return { token, settings };
  }
}

let cachedStore: RuntimeSettingsStore | undefined;

export function getRuntimeSettingsStore(db: Firestore = getFirebaseAdminFirestore()): RuntimeSettingsStore {
  cachedStore ??= new RuntimeSettingsStore(db);
  return cachedStore;
}