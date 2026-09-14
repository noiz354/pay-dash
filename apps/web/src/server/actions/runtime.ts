"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  DATA_SOURCES,
  getRuntimeSettingsStore,
  type DataSource,
  type RuntimeSettings,
} from "@/server/settings/runtime-settings";
import type { Permission } from "@/domain/organization/roles";
import { OrgContextError } from "@/server/services/org-context";
import { requireStrictOrgContext } from "@/server/services/session-org-context";
import type { ActionState } from "./settings";

/**
 * Audit finding S-04 — these actions gate the *whole deployment*, not one tenant.
 *
 * `getRuntimeSettingsStore()` is process-global and deliberately not org-scoped:
 * `dataSource` moves every organization between the in-memory demo ledger and
 * Postgres, `xenditEnabled` decides whether payment calls reach the real
 * provider, and `mcpToken` authenticates the MCP surface.
 *
 * The previous guard answered only "is anybody signed in?". Any authenticated
 * principal — including a SUPPORT user, and including the memberless registrant
 * that §3.5 used to hand OWNER of `org_demo` — could therefore switch every
 * tenant between `"memory"` and `"postgres"`, disable or enable live Xendit
 * calls, rotate the MCP token, and read the new token straight back out of the
 * response body.
 *
 * Each action now names the least privilege it actually needs and goes through
 * `requireStrictOrgContext`, the same seam every other mutation uses, so the demo
 * fallback cannot satisfy it in production either.
 *
 * STILL OPEN (roadmap Phase 3): `settings.manage` is OWNER-only, but it is OWNER
 * *of some tenant*. These settings are global, so one tenant's owner still
 * changes behaviour for all of them. Narrowing that needs the platform-admin
 * principal Phase 3 introduces; this commit removes the "any signed-in user"
 * half of the exposure, not the cross-tenant half.
 */
// Typed `ActionState<never>` rather than a generic: a denial carries no payload,
// and `never` is assignable to every `data?: T` the actions below declare, so the
// payload type does not have to be repeated at six call sites.
async function requireRuntimePermission(permission: Permission): Promise<ActionState<never> | null> {
  try {
    await requireStrictOrgContext(permission);
    return null;
  } catch (e) {
    if (e instanceof OrgContextError) {
      return {
        status: "error",
        message: e.message.includes("Authentication")
          ? "Sign in to manage MCP and runtime settings."
          : "You don't have permission to manage MCP and runtime settings.",
      };
    }
    return {
      status: "error",
      message: e instanceof Error ? e.message : "Sign in to manage MCP and runtime settings.",
    };
  }
}

function revalidateRuntimeSettings() {
  revalidatePath("/[locale]/settings/mcp", "page");
  revalidatePath("/settings/mcp");
}

export type RuntimeSettingsState = ActionState<{
  settings: RuntimeSettings;
  hasCustomToken: boolean;
}>;

export async function getRuntimeSettingsAction(): Promise<RuntimeSettingsState> {
  const denied = await requireRuntimePermission("settings.manage");
  if (denied) return denied;
  const store = getRuntimeSettingsStore();
  const settings = await store.get();
  return {
    status: "success",
    message: "Loaded runtime settings.",
    data: { settings, hasCustomToken: Boolean(settings.mcpToken) },
  };
}

const DataSourceSchema = z.enum(DATA_SOURCES);

export async function setDataSourceAction(rawSource: string): Promise<RuntimeSettingsState> {
  const denied = await requireRuntimePermission("settings.manage");
  if (denied) return denied;
  const parsed = DataSourceSchema.safeParse(rawSource);
  if (!parsed.success) {
    return { status: "error", message: "Choose a valid data source." };
  }
  const store = getRuntimeSettingsStore();
  const next = await store.update({ dataSource: parsed.data });
  revalidateRuntimeSettings();
  return {
    status: "success",
    message: `Data source switched to ${next.dataSource}.`,
    data: { settings: next, hasCustomToken: Boolean(next.mcpToken) },
  };
}

export async function setMcpEnabledAction(rawEnabled: boolean): Promise<RuntimeSettingsState> {
  const denied = await requireRuntimePermission("settings.manage");
  if (denied) return denied;
  const store = getRuntimeSettingsStore();
  const next = await store.update({ mcpEnabled: rawEnabled === true });
  revalidateRuntimeSettings();
  return {
    status: "success",
    message: `MCP server ${next.mcpEnabled ? "enabled" : "disabled"}.`,
    data: { settings: next, hasCustomToken: Boolean(next.mcpToken) },
  };
}

export async function setXenditEnabledAction(rawEnabled: boolean): Promise<RuntimeSettingsState> {
  const denied = await requireRuntimePermission("provider.connect.live");
  if (denied) return denied;
  const store = getRuntimeSettingsStore();
  const next = await store.update({ xenditEnabled: rawEnabled === true });
  revalidateRuntimeSettings();
  return {
    status: "success",
    message: `Xendit live calls ${next.xenditEnabled ? "enabled" : "disabled"}.`,
    data: { settings: next, hasCustomToken: Boolean(next.mcpToken) },
  };
}

export type RotateMcpTokenState = ActionState<{
  token: string;
  hasCustomToken: boolean;
}>;

export async function rotateMcpTokenAction(): Promise<RotateMcpTokenState> {
  const denied = await requireRuntimePermission("settings.manage");
  if (denied) return denied;
  const store = getRuntimeSettingsStore();
  const { token, settings } = await store.rotateMcpToken();
  revalidateRuntimeSettings();
  return {
    status: "success",
    message: "A new MCP token was generated.",
    data: { token, hasCustomToken: true },
  };
}

export type TestXenditConnectionState = ActionState<{ ok: boolean; detail: string }>;

export async function testXenditConnectionAction(): Promise<TestXenditConnectionState> {
  const denied = await requireRuntimePermission("provider.connect.test");
  if (denied) return denied;
  const settings = await getRuntimeSettingsStore().get();
  if (!settings.xenditEnabled) {
    return {
      status: "error",
      message: "Xendit live calls are disabled.",
      data: { ok: false, detail: "Enable Xendit live calls on this page first." },
    };
  }
  const secretKey = process.env.XENDIT_SECRET_KEY;
  if (!secretKey) {
    return {
      status: "error",
      message: "Xendit secret key is not configured.",
      data: { ok: false, detail: "Set XENDIT_SECRET_KEY in the environment." },
    };
  }
  try {
    const { createXenditClient } = await import("@/lib/xendit");
    const client = createXenditClient(secretKey) as unknown as {
      Balance: { getBalance(opts: { accountType: string; currency: string }): Promise<{ balance: number; currency: string }> };
    };
    const balance = await client.Balance.getBalance({ accountType: "CASH", currency: "IDR" });
    const detail = `Connected to the Xendit sandbox. ${balance.currency} ${balance.balance.toLocaleString()} available (CASH).`;
    return { status: "success", message: "Xendit connection verified.", data: { ok: true, detail } };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return { status: "error", message: "Xendit test connection failed.", data: { ok: false, detail } };
  }
}