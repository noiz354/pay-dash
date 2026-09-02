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
import type { ActionState } from "./payouts";

export type { ActionState };

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

  const member = await inviteMember({ name, email, role });
  revalidateTeam();
  return { status: "success", message: `Invite sent to ${member.email} (${member.role.toLowerCase()}).` };
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

  let changed = 0;
  for (const id of ids) {
    if (await changeMemberRole(id, role)) changed += 1;
  }
  revalidateTeam();
  return {
    status: "success",
    message: changed === 1 ? "Role updated." : `Role updated for ${changed} members.`,
  };
}

// Deactivate one or more selected members (bulk bar).
export async function deactivateAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const ids = idsOf(formData);
  if (ids.length === 0) return { status: "error", message: "Select at least one member." };

  let changed = 0;
  for (const id of ids) {
    if (await deactivateMember(id)) changed += 1;
  }
  revalidateTeam();
  return {
    status: "success",
    message: changed === 1 ? "Member deactivated." : `${changed} members deactivated.`,
  };
}

export async function reactivateAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();
  const member = await reactivateMember(id);
  if (!member) return { status: "error", message: "Member not found." };
  revalidateTeam();
  return { status: "success", message: `${member.name} reactivated.` };
}

export async function resendInviteAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();
  const member = await resendInvite(id);
  if (!member) return { status: "error", message: "No invite to resend." };
  revalidateTeam();
  return { status: "success", message: `Invite re-sent to ${member.email}.` };
}

export async function revokeInviteAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();
  const removed = await revokeInvite(id);
  if (!removed) return { status: "error", message: "No invite to revoke." };
  revalidateTeam();
  return { status: "success", message: "Invite revoked." };
}
