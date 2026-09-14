"use server";

import { revalidatePath } from "next/cache";
import { OrgContextError } from "@/server/services/org-context";
import { requireStrictOrgContext } from "@/server/services/session-org-context";
import { addBlocklist, getBlocklistEntry, removeBlocklist } from "@/server/data/blocklist";
import type { ActionState } from "./payouts";

export type { ActionState };

/**
 * Audit finding S-02 — the fraud blocklist could be edited by anyone who could reach the endpoint.
 *
 * `addBlocklistAction` blocks an arbitrary card, email or IP — so a caller could block legitimate customers and cause declines that look like a provider outage. `removeBlocklistAction` is worse in the other direction: it un-blocks a known fraudster, letting a blocked card back through screening.
 *
 * `risk.manage` is the permission added while closing the risk actions: OWNER and RISK_ANALYST, the two roles with a fraud-prevention duty. The blocklist is fraud tooling, so it belongs with the ruleset rather than with merchant settings.
 *
 * STILL OPEN (roadmap Phase 3): `data/blocklist.ts` is one process-global list with no `organizationId`, so this narrows *who* may edit the blocklist, not *whose* blocklist. One tenant's analyst still blocks and unblocks for all of them.
 */
async function requireBlocklistManage(): Promise<ActionState<never> | null> {
  try {
    await requireStrictOrgContext("risk.manage");
    return null;
  } catch (e) {
    if (e instanceof OrgContextError) {
      return {
        status: "error",
        message: e.message.includes("Authentication")
          ? "Sign in to manage the blocklist."
          : "You don't have permission to manage the blocklist.",
      };
    }
    return { status: "error", message: e instanceof Error ? e.message : "Sign in to manage the blocklist." };
  }
}

function revalidateFraud() {
  revalidatePath("/[locale]/fraud", "page");
  revalidatePath("/[locale]/fraud/blocklist", "page");
  revalidatePath("/fraud");
  revalidatePath("/fraud/blocklist");
}

// Add to Blocklist (ADR-0024) — one dialog on both fraud pages, one store.
// Values are validated per type: IPv4/IPv6, raw card digits (stored masked),
// email domains (not full addresses). Duplicates are rejected.
export async function addBlocklistAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const denied = await requireBlocklistManage();
  if (denied) return denied;

  const type = String(formData.get("type") ?? "");
  const value = String(formData.get("value") ?? "");
  const reason = String(formData.get("reason") ?? "");

  const result = await addBlocklist({ type, value, reason });
  if (!result.ok) return { status: "error", message: result.error };

  revalidateFraud();
  return { status: "success", message: `${result.entry.value} added to the blocklist.` };
}

export async function removeBlocklistAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const denied = await requireBlocklistManage();
  if (denied) return denied;

  const id = String(formData.get("id") ?? "").trim();
  const entry = await getBlocklistEntry(id);
  const removed = await removeBlocklist(id);
  if (!removed) return { status: "error", message: "Entry not found." };
  revalidateFraud();
  return { status: "success", message: `${entry?.value ?? "Entry"} removed from the blocklist.` };
}
