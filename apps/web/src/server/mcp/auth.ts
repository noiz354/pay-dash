import "server-only";

import { getRuntimeSettingsStore, type RuntimeSettingsStore } from "@/server/settings/runtime-settings";
import type { OrganizationContext } from "@/domain/tenancy/organization-context";

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

/**
 * Wave 7A — the tenant bound to an MCP request.
 *
 * The MCP endpoint is authorized by a single global bearer token, which answers
 * "is this PayDash's agent?" and says nothing about *which organization* it may
 * read or move money for. Every transaction-shaped tool therefore needs a
 * context, and the only honest source for one is the same session resolution the
 * dashboard uses — a header or tool argument naming an organization is ignored,
 * by construction, because an API surface with one shared credential must not
 * let the caller pick the tenant.
 *
 * `null` means "unattributable". Transaction tools refuse in that state rather
 * than falling back to a default organization, so a deployment that has not
 * wired per-token tenant binding exposes *no* ledger instead of *every* ledger.
 */
export async function resolveMcpOrganization(_request: Request): Promise<OrganizationContext | null> {
  try {
    const { resolveTransactionOrganizationContext } = await import("@/server/services/transaction-organization-context");
    const access = await resolveTransactionOrganizationContext();
    return access.context;
  } catch {
    return null;
  }
}
