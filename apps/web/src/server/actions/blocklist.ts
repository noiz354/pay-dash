"use server";

import { revalidatePath } from "next/cache";
import { TenantIsolationError } from "@/domain/security/tenant";
import { isBlocklistReason, isBlocklistType } from "@/lib/blocklist-options";
import {
  addBlocklist,
  getBlocklistEntry,
  isValidEmailDomain,
  isValidIp,
  maskCardNumber,
  removeBlocklist,
} from "@/server/data/blocklist";
import {
  ingestAccessDeniedState,
  requireIngestOrganizationContext,
} from "@/server/services/ingest-organization-context";
import type { ActionState } from "./payouts";

export type { ActionState };

/** A cross-tenant id answers exactly like an unknown one (C-5). */
function isCrossTenant(e: unknown): boolean {
  return e instanceof TenantIsolationError;
}

function denied(e: unknown): ActionState {
  return ingestAccessDeniedState(e) as ActionState;
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
  const type = String(formData.get("type") ?? "");
  const value = String(formData.get("value") ?? "");
  const reason = String(formData.get("reason") ?? "");

  // Validation runs before tenancy: a bad value is a field error, not an auth
  // error, and answering it as an auth error would leak which of the two a
  // caller hit (7F precedent). Nothing is written by a rejected attempt. The
  // DAL re-validates and normalises — this gate only fixes the ordering.
  if (!isBlocklistType(type) || !isBlocklistReason(reason)) {
    return { status: "error", message: "Pick a type and a reason." };
  }
  const trimmed = value.trim();
  if (type === "IP") {
    if (!isValidIp(trimmed)) return { status: "error", message: "Enter a valid IPv4 or IPv6 address." };
  } else if (type === "CARD") {
    if (!maskCardNumber(trimmed)) return { status: "error", message: "Enter the full card number (12–19 digits)." };
  } else if (!isValidEmailDomain(trimmed)) {
    return { status: "error", message: "Enter a domain (e.g. example.com), not a full email." };
  }

  let access;
  try {
    access = await requireIngestOrganizationContext("settings.manage");
  } catch (e) {
    return denied(e);
  }

  // The owner comes from the session tenant, never from the form (P-10).
  const result = await addBlocklist(access.context, { type, value, reason });
  if (!result.ok) return { status: "error", message: result.error };

  revalidateFraud();
  return { status: "success", message: `${result.entry.value} added to the blocklist.` };
}

export async function removeBlocklistAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();

  let access;
  try {
    access = await requireIngestOrganizationContext("settings.manage");
  } catch (e) {
    return denied(e);
  }

  try {
    const entry = await getBlocklistEntry(access.context, id);
    const removed = await removeBlocklist(access.context, id);
    if (!removed) return { status: "error", message: "Entry not found." };
    revalidateFraud();
    return { status: "success", message: `${entry?.value ?? "Entry"} removed from the blocklist.` };
  } catch (e) {
    // Pruning another tenant's fraud control is refused in the DAL (audited);
    // the wire answer is identical to an unknown id — no enumeration oracle.
    if (isCrossTenant(e)) return { status: "error", message: "Entry not found." };
    return denied(e);
  }
}
