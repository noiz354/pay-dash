"use server";

import { revalidatePath } from "next/cache";
import {
  changeMemberRole,
  deactivateMember,
  inviteMember,
  reactivateMember,
  resendInvite,
  revokeInvite,
  TEAM_ROLES,
  type TeamRole,
} from "@/server/data/team";
import { TenantIsolationError } from "@/domain/security/tenant";
import {
  identityAccessDeniedState,
  requireIdentityOrganizationContext,
} from "@/server/services/identity-organization-context";
import type { ActionState } from "./payouts";

export type { ActionState };

/**
 * Wave 7F — the action seam for the team roster.
 *
 * Two defects closed here, in this order:
 *
 *  1. **No authorization at all.** Before this wave every action below ran for
 *     anybody who could POST a form: invite members, change roles (privilege
 *     escalation), deactivate staff. Roles are per tenant, so each action now
 *     resolves the tenant *and* asserts `team.manage` before touching a store
 *     (spec P-9). Validation still runs first — a malformed email is a field
 *     error, not an auth error, and answering it as an auth error would leak
 *     which of the two a caller hit.
 *  2. **No tenant.** Each action passes the resolved context to the DAL, so an
 *     id from another organization is refused there (audited) and mapped here to
 *     the same message an unknown id gets: no enumeration oracle on the wire.
 *
 * The bulk actions scope **per row**. A multi-select that contains one foreign
 * id must not silently report success for it, and must not abort the rows the
 * actor does own — so each row is attempted, refusals are caught, and the
 * message states the honest count.
 */

function revalidateTeam() {
  revalidatePath("/[locale]/team", "page");
  revalidatePath("/team");
}

function roles(): TeamRole[] {
  return TEAM_ROLES.map((r) => r.value);
}

function isRole(v: string): v is TeamRole {
  return (roles() as string[]).includes(v);
}

function idsOf(formData: FormData): string[] {
  return formData.getAll("ids").map((v) => String(v)).filter(Boolean);
}

/** A cross-tenant id answers exactly like an unknown one (C-5). */
function isCrossTenant(e: unknown): boolean {
  return e instanceof TenantIsolationError;
}

function denied(e: unknown): ActionState {
  return identityAccessDeniedState(e) as ActionState;
}

// Invite a new member (Add Member dialog). Lands in INVITED — the app's own
// outbound record, listed under Pending Invites (ADR-0022).
export async function inviteMemberAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "");

  if (name.length < 2) return { status: "error", message: "Enter the member's name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }
  if (!isRole(role)) return { status: "error", message: "Pick a role." };

  let access;
  try {
    access = await requireIdentityOrganizationContext("team.manage");
  } catch (e) {
    return denied(e);
  }

  try {
    // The invitee joins the *session* tenant: the form carries no organization
    // field, so there is nothing to aim at another tenant's roster (P-10).
    const member = await inviteMember(access.context, { name, email, role });
    revalidateTeam();
    return { status: "success", message: `Invite sent to ${member.email} (${member.role.toLowerCase()}).` };
  } catch (e) {
    return isCrossTenant(e) ? { status: "error", message: "Member not found." } : denied(e);
  }
}

// Change the role of one or more selected members (bulk bar).
export async function changeRoleAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const ids = idsOf(formData);
  const role = String(formData.get("role") ?? "");
  if (ids.length === 0) return { status: "error", message: "Select at least one member." };
  if (!isRole(role)) return { status: "error", message: "Pick a role." };

  let access;
  try {
    access = await requireIdentityOrganizationContext("team.manage");
  } catch (e) {
    return denied(e);
  }

  let changed = 0;
  for (const id of ids) {
    try {
      // Tenant → row → role, per row: a foreign id is refused by the DAL and
      // audited there, so this loop cannot re-role another organization's Admin.
      if (await changeMemberRole(access.context, id, role)) changed += 1;
    } catch (e) {
      if (!isCrossTenant(e)) return denied(e);
    }
  }
  revalidateTeam();
  const skipped = ids.length - changed;
  return {
    status: "success",
    message:
      skipped === 0
        ? `Role updated for ${changed} member${changed === 1 ? "" : "s"}.`
        : `Role updated for ${changed} member${changed === 1 ? "" : "s"}; ${skipped} not in your team.`,
  };
}

// Deactivate one or more selected members (bulk bar).
export async function deactivateAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const ids = idsOf(formData);
  if (ids.length === 0) return { status: "error", message: "Select at least one member." };

  let access;
  try {
    access = await requireIdentityOrganizationContext("team.manage");
  } catch (e) {
    return denied(e);
  }

  let changed = 0;
  for (const id of ids) {
    try {
      if (await deactivateMember(access.context, id)) changed += 1;
    } catch (e) {
      if (!isCrossTenant(e)) return denied(e);
    }
  }
  revalidateTeam();
  const skipped = ids.length - changed;
  return {
    status: "success",
    message:
      skipped === 0
        ? `${changed} member${changed === 1 ? "" : "s"} deactivated.`
        : `${changed} members deactivated; ${skipped} not in your team.`,
  };
}

export async function reactivateAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();

  let access;
  try {
    access = await requireIdentityOrganizationContext("team.manage");
  } catch (e) {
    return denied(e);
  }

  try {
    const member = await reactivateMember(access.context, id);
    if (!member) return { status: "error", message: "Member not found." };
    revalidateTeam();
    return { status: "success", message: `${member.name} reactivated.` };
  } catch (e) {
    return isCrossTenant(e) ? { status: "error", message: "Member not found." } : denied(e);
  }
}

export async function resendInviteAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();

  let access;
  try {
    access = await requireIdentityOrganizationContext("team.manage");
  } catch (e) {
    return denied(e);
  }

  try {
    const member = await resendInvite(access.context, id);
    if (!member) return { status: "error", message: "No invite to resend." };
    revalidateTeam();
    return { status: "success", message: `Invite re-sent to ${member.email}.` };
  } catch (e) {
    return isCrossTenant(e) ? { status: "error", message: "No invite to resend." } : denied(e);
  }
}

export async function revokeInviteAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();

  let access;
  try {
    access = await requireIdentityOrganizationContext("team.manage");
  } catch (e) {
    return denied(e);
  }

  try {
    const removed = await revokeInvite(access.context, id);
    if (!removed) return { status: "error", message: "No invite to revoke." };
    revalidateTeam();
    return { status: "success", message: "Invite revoked." };
  } catch (e) {
    return isCrossTenant(e) ? { status: "error", message: "No invite to revoke." } : denied(e);
  }
}
