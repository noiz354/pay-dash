import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DATA_SOURCES, getRuntimeSettingsStore, type RuntimeSettingsStore } from "@/server/settings/runtime-settings";
import {
  getMcpStatusHandler,
  getRuntimeSettingsHandler,
  pingHandler,
  rotateMcpTokenHandler,
  setDataSourceHandler,
} from "./handlers";
import { registerDomainTools } from "./domain-tools";
import type { OrganizationContext } from "@/domain/tenancy/organization-context";
import { registerXenditTools } from "./xendit-tools";
import { registerJournalTools } from "./journal-tools";

export function buildMcpServer(
  store: RuntimeSettingsStore = getRuntimeSettingsStore(),
  organization?: OrganizationContext | null,
): McpServer {
  const server = new McpServer({ name: "paydash", version: "1.0.0" });

  // Wave 7A: the tenant bound to *this request* is threaded into the domain
  // tools. Tools outside this wave's slice (balance, payouts, …) are untouched on
  // purpose — see the Wave 7B quarantine note in WAVE_7A_IMPLEMENTATION_REPORT.md.
  registerDomainTools(server, organization);
  registerXenditTools(server);
  registerJournalTools(server);

  server.registerTool(
    "ping",
    { title: "Ping", description: "PayDash MCP health check." },
    async () => pingHandler()
  );

  server.registerTool(
    "get_runtime_settings",
    {
      title: "Get runtime settings",
      description: "Read the current data source, MCP and Xendit runtime settings.",
    },
    async () => getRuntimeSettingsHandler(store)
  );

  server.registerTool(
    "get_mcp_status",
    {
      title: "Get MCP status",
      description: "Whether the MCP server is enabled and a bearer token is configured.",
    },
    async () => getMcpStatusHandler(store)
  );

  server.registerTool(
    "set_data_source",
    {
      title: "Set data source",
      description: "Switch the dashboard and MCP data source between in-memory and PostgreSQL.",
      inputSchema: { dataSource: z.enum(DATA_SOURCES) },
    },
    async ({ dataSource }) => setDataSourceHandler(store, dataSource)
  );

  server.registerTool(
    "rotate_mcp_token",
    {
      title: "Rotate MCP token",
      description: "Generate a new MCP bearer token, revoking the previous one.",
    },
    async () => rotateMcpTokenHandler(store)
  );

  return server;
}