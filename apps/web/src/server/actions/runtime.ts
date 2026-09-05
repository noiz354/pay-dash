"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  DATA_SOURCES,
  getRuntimeSettingsStore,
  type DataSource,
  type RuntimeSettings,
} from "@/server/settings/runtime-settings";
import type { ActionState } from "./settings";

async function requireSession(): Promise<boolean> {
  try {
    const { auth } = await import("@/lib/auth");
    const { headers } = await import("next/headers");
    const session = await auth.api.getSession({ headers: await headers() });
    return Boolean(session?.user?.id);
  } catch {
    return false;
  }
}

function unauthorized(): ActionState {
  return { status: "error", message: "Sign in to manage MCP and runtime settings." };
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
  if (!(await requireSession())) return unauthorized();
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
  if (!(await requireSession())) return unauthorized();
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
  if (!(await requireSession())) return unauthorized();
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
  if (!(await requireSession())) return unauthorized();
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
  if (!(await requireSession())) return unauthorized();
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
  if (!(await requireSession())) return unauthorized();
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