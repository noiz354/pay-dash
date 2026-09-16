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
import { OrgContextError } from "@/server/services/org-context";
import { requireStrictOrgContext } from "@/server/services/session-org-context";
import type { ActionState } from "./payouts";

export type { ActionState };

/**
 * Audit finding S-02 — the team endpoints were 6 of the 32 Server Actions that
 * had no authorization whatsoever.
 *
 * All six actions below ran straight through to the store on the strength of
 * being reachable. `changeRoleAction` took a role from the form and applied it to
 * any member id in the form, so any signed-in principal could set their own role
 * to ADMIN and then do everything ADMIN allows. `deactivateAction` could switch
 * off any member including the owner. `inviteMemberAction` could mint an ADMIN.
 * None of them read the session at all — there was no actor to compare against.
 *
 * `team.manage` is OWNER-only in the role catalogue, and the guard goes through
 * `requireStrictOrgContext`: the same fail-closed seam every money-out and
 * settings mutation uses, so the demo fallback cannot satisfy it in production.
 *
 * STILL OPEN (roadmap Phase 3): `Member` has no `organizationId` and the store is
 * one global list, so this narrows *who* may manage the team from "anyone signed
 * in" to "an OWNER" — it does not yet scope *which* team. An OWNER of one tenant
 * still manages every tenant's roster, and `/team` still renders that roster to
 * any authenticated caller. Tenant-scoping the store is Phase 3; page-level
 * authorization is its own change, because no page in this app currently gates by
 * permission and the redirect-versus-denied-state semantics need deciding once,
 * not per page.
 */
async function requireTeamManage(): Promise<ActionState | null> {
  try {
    await requireStrictOrgContext("team.manage");
    return null;
  } catch (e) {
    if (e instanceof OrgContextError) {
      return {
        status: "error",
        message: e.message.includes("Authentication")
          ? "Sign in to manage your team."
          : "You don't have permission to manage your team.",
      };
    }
    return { status: "error", message: e instanceof Error ? e.message : "Sign in to manage your team." };
  }
}

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
  const denied = await requireTeamManage();
  if (denied) return denied;

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
  // F-01: `inviteMember` writes an INVITED row to the app's own store. Nothing
  // sends mail — there is no mailer, no template and no provider in this
  // repository. "Invite sent" told the inviter to wait for a colleague to accept
  // an email that never existed, so the invitation silently never completed.
  return {
    status: "success",
    message: `Invitation recorded for ${member.email} (${member.role.toLowerCase()}) — no email was sent; share the sign-up link with them.`,
  };
}

// Change the role of one or more selected members (bulk bar).
export async function changeRoleAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const denied = await requireTeamManage();
  if (denied) return denied;

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
  const denied = await requireTeamManage();
  if (denied) return denied;

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
  const denied = await requireTeamManage();
  if (denied) return denied;

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
  const denied = await requireTeamManage();
  if (denied) return denied;

  const id = String(formData.get("id") ?? "").trim();
  const member = await resendInvite(id);
  if (!member) return { status: "error", message: "No invite to resend." };
  revalidateTeam();
  // F-01, same defect as `inviteMemberAction`: `resendInvite` bumps the stored
  // `invitedAt` timestamp and nothing sends mail. "Re-sent" told the inviter the
  // colleague had received a second email; they had received none, either time.
  return {
    status: "success",
    message: `Invitation for ${member.email} reset — no email was sent; share the sign-up link with them.`,
  };
}

export async function revokeInviteAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const denied = await requireTeamManage();
  if (denied) return denied;

  const id = String(formData.get("id") ?? "").trim();
  const removed = await revokeInvite(id);
  if (!removed) return { status: "error", message: "No invite to revoke." };
  revalidateTeam();
  return { status: "success", message: "Invite revoked." };
}
