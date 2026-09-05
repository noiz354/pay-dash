import "server-only";

import type { RuntimeSettingsStore } from "@/server/settings/runtime-settings";

export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

export function textResult(data: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }],
  };
}

export async function pingHandler(): Promise<McpToolResult> {
  return textResult({ ok: true, service: "paydash", at: new Date().toISOString() });
}

export async function getRuntimeSettingsHandler(store: RuntimeSettingsStore): Promise<McpToolResult> {
  const settings = await store.get();
  return textResult(settings);
}

export async function getMcpStatusHandler(store: RuntimeSettingsStore): Promise<McpToolResult> {
  const settings = await store.get();
  return textResult({ mcpEnabled: settings.mcpEnabled, hasToken: Boolean(settings.mcpToken) });
}

export async function setDataSourceHandler(store: RuntimeSettingsStore, rawSource: string): Promise<McpToolResult> {
  if (rawSource !== "memory" && rawSource !== "postgres") {
    return textResult({ error: `Invalid data source: ${rawSource}` });
  }
  const next = await store.update({ dataSource: rawSource });
  return textResult({ dataSource: next.dataSource, message: `Data source switched to ${next.dataSource}.` });
}

export async function rotateMcpTokenHandler(store: RuntimeSettingsStore): Promise<McpToolResult> {
  const { token } = await store.rotateMcpToken();
  return textResult({ token, message: "New MCP token generated. The previous token is revoked." });
}