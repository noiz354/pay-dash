"use server";

import { revalidatePath } from "next/cache";
import { parseAmount } from "@/lib/payout-status";
import {
  deployRiskSettings,
  discardDraft,
  getRiskOverview,
  patchDraft,
} from "@/server/data/risk";
import type { ActionState } from "./payouts";

export type { ActionState };

function revalidateRisk() {
  revalidatePath("/[locale]/risk", "page");
  revalidatePath("/risk");
}

// Save the volume-limit inputs to the draft (they change nothing live until
// Deploy Changes — ADR-0023).
export async function saveVolumeDraftAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const daily = parseAmount(String(formData.get("dailyVolumeLimit") ?? ""));
  const monthly = parseAmount(String(formData.get("monthlyVolumeLimit") ?? ""));

  if (daily === null || daily <= 0) {
    return { status: "error", message: "Enter a daily volume limit greater than zero." };
  }
  if (monthly === null || monthly <= 0) {
    return { status: "error", message: "Enter a monthly volume limit greater than zero." };
  }
  if (monthly < daily) {
    return { status: "error", message: "The monthly cap must be at least the daily cap." };
  }

  patchDraft({ dailyVolumeLimit: daily, monthlyVolumeLimit: monthly });
  revalidateRisk();
  return { status: "success", message: "Draft updated — deploy to make it live." };
}

// The card switch drafts the enabled state immediately (the app's
// optimistic-switch convention from /settings/notifications).
export async function setVolumeEnabledAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const enabled = String(formData.get("enabled") ?? "") === "true";
  const overview = await getRiskOverview();
  if (overview.effective.volumeLimitsEnabled === enabled) {
    return { status: "error", message: "Already in that state." };
  }
  patchDraft({ volumeLimitsEnabled: enabled });
  revalidateRisk();
  return {
    status: "success",
    message: enabled ? "Volume limits drafted as enabled." : "Volume limits drafted as disabled.",
  };
}

// A rules-table row switch drafts that rule's enabled state.
export async function toggleRuleAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const ruleId = String(formData.get("id") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "") === "true";
  const rule = (await getRiskOverview()).effective.rules.find((r) => r.id === ruleId);
  if (!rule) return { status: "error", message: "Rule not found." };
  if (rule.enabled === enabled) return { status: "error", message: "Already in that state." };

  patchDraft({ ruleId, ruleEnabled: enabled });
  revalidateRisk();
  return {
    status: "success",
    message: `${rule.name} drafted as ${enabled ? "enabled" : "disabled"}.`,
  };
}

export async function deployRiskAction(
  _prev: ActionState | undefined,
  _formData: FormData
): Promise<ActionState> {
  const overview = await getRiskOverview();
  if (!overview.draft) return { status: "error", message: "No draft to deploy." };
  const { ruleCount } = deployRiskSettings();
  revalidateRisk();
  return { status: "success", message: `Ruleset deployed — ${ruleCount} rules live.` };
}

export async function discardDraftAction(
  _prev: ActionState | undefined,
  _formData: FormData
): Promise<ActionState> {
  const removed = discardDraft();
  if (!removed) return { status: "error", message: "No draft to discard." };
  revalidateRisk();
  return { status: "success", message: "Draft discarded." };
}
