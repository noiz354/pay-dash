"use server";

import { revalidatePath } from "next/cache";
import { parseAmount } from "@/lib/payout-status";
import {
  deployRiskSettings,
  discardDraft,
  getRiskOverview,
  patchDraft,
} from "@/server/data/risk";
import { OrgContextError } from "@/server/services/org-context";
import { requireStrictOrgContext } from "@/server/services/session-org-context";
import type { ActionState } from "./payouts";

export type { ActionState };

/**
 * Audit finding S-02 — the five risk actions had no authorization at all.
 *
 * `setVolumeEnabledAction` switches volume screening off, `toggleRuleAction`
 * disables an individual fraud rule, and `deployRiskAction` pushes a draft
 * ruleset live. Reachable meant an attacker could turn off fraud screening
 * before running a stolen-card batch through `money_in.create`, and the draft
 * actions let them stage the change first so the deploy looked ordinary.
 *
 * These now require the new `risk.manage` permission, held by OWNER and
 * RISK_ANALYST, through `requireStrictOrgContext` — the same fail-closed seam the
 * money-out, team and settings mutations use, so the demo fallback cannot satisfy
 * it in production either.
 *
 * STILL OPEN (roadmap Phase 3): `data/risk.ts` is one process-global ruleset with
 * no `organizationId`, so this narrows *who* may edit fraud rules from "anyone who
 * can reach the endpoint" to "an OWNER or a RISK_ANALYST" — it does not yet scope
 * *whose* rules. One tenant's analyst still deploys to every tenant.
 */
async function requireRiskManage(): Promise<ActionState<never> | null> {
  try {
    await requireStrictOrgContext("risk.manage");
    return null;
  } catch (e) {
    if (e instanceof OrgContextError) {
      return {
        status: "error",
        message: e.message.includes("Authentication")
          ? "Sign in to manage risk rules."
          : "You don't have permission to manage risk rules.",
      };
    }
    return { status: "error", message: e instanceof Error ? e.message : "Sign in to manage risk rules." };
  }
}

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
  const denied = await requireRiskManage();
  if (denied) return denied;

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
  const denied = await requireRiskManage();
  if (denied) return denied;

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
  const denied = await requireRiskManage();
  if (denied) return denied;

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
  const denied = await requireRiskManage();
  if (denied) return denied;

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
  const denied = await requireRiskManage();
  if (denied) return denied;

  const removed = discardDraft();
  if (!removed) return { status: "error", message: "No draft to discard." };
  revalidateRisk();
  return { status: "success", message: "Draft discarded." };
}
