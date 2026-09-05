import "server-only";

import { getRuntimeSettingsStore, type RuntimeSettingsStore } from "@/server/settings/runtime-settings";

export const DATA_SOURCES = ["memory", "postgres"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export function isDataSource(value: unknown): value is DataSource {
  return value === "memory" || value === "postgres";
}

/**
 * Resolve the effective data source for an operation.
 * - `override` (per-tool / per-request) wins when present.
 * - Otherwise the runtime setting (Firestore) wins, falling back to env.
 */
export async function resolveDataSource(
  override?: string,
  store: RuntimeSettingsStore = getRuntimeSettingsStore()
): Promise<DataSource> {
  if (isDataSource(override)) return override;
  const settings = await store.get();
  return settings.dataSource;
}

export function dataSourceError(domain: string): { error: string } {
  return {
    error: `PostgreSQL store not implemented yet for ${domain}. Switch dataSource back to "memory" or use the in-memory store.`,
  };
}