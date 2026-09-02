"use server";

import { revalidatePath } from "next/cache";
import { addBlocklist, getBlocklistEntry, removeBlocklist } from "@/server/data/blocklist";
import type { ActionState } from "./payouts";

export type { ActionState };

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
  const id = String(formData.get("id") ?? "").trim();
  const entry = await getBlocklistEntry(id);
  const removed = await removeBlocklist(id);
  if (!removed) return { status: "error", message: "Entry not found." };
  revalidateFraud();
  return { status: "success", message: `${entry?.value ?? "Entry"} removed from the blocklist.` };
}
