import "server-only";

import { getRuntimeSettingsStore, type RuntimeSettingsStore } from "@/server/settings/runtime-settings";

export type McpAuthResult = { ok: true } | { ok: false; status: number; reason: string };

export async function authorizeMcpRequest(
  request: Request,
  store: RuntimeSettingsStore = getRuntimeSettingsStore()
): Promise<McpAuthResult> {
  const settings = await store.get();
  if (!settings.mcpEnabled) {
    return { ok: false, status: 403, reason: "MCP server is disabled in runtime settings." };
  }
  const token = settings.mcpToken;
  if (!token) {
    return { ok: false, status: 401, reason: "MCP token is not configured." };
  }
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return { ok: false, status: 401, reason: "Missing Bearer token." };
  }
  const candidate = header.slice("Bearer ".length).trim();
  if (candidate.length === 0 || candidate !== token) {
    return { ok: false, status: 401, reason: "Invalid MCP token." };
  }
  return { ok: true };
}