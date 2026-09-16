// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrgContextError } from "@/server/services/org-context";
import { listMembers } from "@/server/data/team";
import {
  changeRoleAction,
  deactivateAction,
  inviteMemberAction,
  reactivateAction,
  resendInviteAction,
  revokeInviteAction,
} from "./team";

/**
 * Audit finding S-02 — team management was 6 of the 32 Server Actions with no
 * authorization at all.
 *
 * Every action in `actions/team.ts` ran straight through to the store on the
 * strength of being reachable. None of them read the session, so there was not
 * even an actor to compare against. The sharpest consequence was
 * `changeRoleAction`: it took a role and a list of member ids from the form and
 * applied one to the other, so any signed-in principal could set their own role
 * to ADMIN and inherit everything ADMIN allows — including `team.manage`, which
 * makes the escalation permanent.
 *
 * `deactivateAction` was the denial-of-service half: switch off any member,
 * including the owner. `inviteMemberAction` could mint an ADMIN outright.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireStrict = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/session-org-context", () => ({
  requireStrictOrgContext: requireStrict,
}));

function asRole(roles: string[], userId = "user_caller") {
  requireStrict.mockResolvedValue({
    organizationId: "org_alpha",
    roles,
    userId,
    isDemoFallback: false,
  });
}

function signedOut() {
  requireStrict.mockRejectedValue(
    new OrgContextError("FORBIDDEN", "Authentication required — please sign in."),
  );
}

function authenticatedButNotOwner() {
  // A real session holding FINANCE_ADMIN: authenticated, and still not permitted
  // to manage the team. This is the case the old code could not distinguish.
  requireStrict.mockRejectedValue(
    new OrgContextError("FORBIDDEN", "Actor is not authorized for team.manage in org_alpha"),
  );
}

function resetStore() {
  (globalThis as unknown as { __kineticTeamStore?: unknown }).__kineticTeamStore = undefined;
}

function inviteForm(email = "new.admin@acmecorp.test", role = "ADMIN") {
  const fd = new FormData();
  fd.set("name", "New Admin");
  fd.set("email", email);
  fd.set("role", role);
  return fd;
}

function idsForm(ids: string[], extra?: Record<string, string>) {
  const fd = new FormData();
  for (const id of ids) fd.append("ids", id);
  for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
  return fd;
}

function idForm(id: string) {
  const fd = new FormData();
  fd.set("id", id);
  return fd;
}

async function roster() {
  const result = await listMembers({ page: 1, pageSize: 100 });
  return result.rows;
}

beforeEach(() => {
  resetStore();
  requireStrict.mockReset();
  asRole(["OWNER"]);
});

describe("every team action demands team.manage", () => {
  const EXPECTED: Array<[string, () => Promise<unknown>]> = [
    ["inviteMemberAction", () => inviteMemberAction(undefined, inviteForm())],
    ["changeRoleAction", () => changeRoleAction(undefined, idsForm(["m1"], { role: "ADMIN" }))],
    ["deactivateAction", () => deactivateAction(undefined, idsForm(["m1"]))],
    ["reactivateAction", () => reactivateAction(undefined, idForm("m1"))],
    ["resendInviteAction", () => resendInviteAction(undefined, idForm("m1"))],
    ["revokeInviteAction", () => revokeInviteAction(undefined, idForm("m1"))],
  ];

  it.each(EXPECTED)("%s authorizes team.manage", async (_name, invoke) => {
    await invoke();
    expect(requireStrict).toHaveBeenCalledWith("team.manage");
  });
});

describe("S-02 — a signed-out caller changes no one", () => {
  it("refuses all six actions and leaves the roster untouched", async () => {
    const before = await roster();
    signedOut();

    const results = await Promise.all([
      inviteMemberAction(undefined, inviteForm("ghost@acmecorp.test")),
      changeRoleAction(undefined, idsForm([before[0]!.id], { role: "ADMIN" })),
      deactivateAction(undefined, idsForm([before[0]!.id])),
      reactivateAction(undefined, idForm(before[0]!.id)),
      resendInviteAction(undefined, idForm(before[0]!.id)),
      revokeInviteAction(undefined, idForm(before[0]!.id)),
    ]);

    for (const r of results) {
      expect(r.status).toBe("error");
      expect(r.message).toMatch(/Sign in to manage your team/i);
    }

    const after = await roster();
    expect(after).toHaveLength(before.length);
    expect(after.find((m) => m.id === before[0]!.id)).toEqual(before[0]);
  });
});

describe("S-02 — an authenticated non-owner cannot manage the team", () => {
  it("cannot escalate itself to ADMIN", async () => {
    const before = await roster();
    const me = before[0]!;
    authenticatedButNotOwner();

    const state = await changeRoleAction(undefined, idsForm([me.id], { role: "ADMIN" }));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/don't have permission/i);

    const after = await roster();
    // The regression that matters: the role is exactly what it was, and the
    // caller did not acquire team.manage by granting it to themselves.
    expect(after.find((m) => m.id === me.id)?.role).toBe(me.role);
  });

  it("cannot mint an ADMIN", async () => {
    const before = await roster();
    authenticatedButNotOwner();

    const state = await inviteMemberAction(undefined, inviteForm());
    expect(state.status).toBe("error");
    expect(await roster()).toHaveLength(before.length);
  });

  it("cannot deactivate the owner", async () => {
    const before = await roster();
    const owner = before.find((m) => m.role === "ADMIN") ?? before[0]!;
    authenticatedButNotOwner();

    const state = await deactivateAction(undefined, idsForm([owner.id]));
    expect(state.status).toBe("error");

    const after = await roster();
    expect(after.find((m) => m.id === owner.id)?.status).toBe(owner.status);
  });

  it("cannot revoke a pending invitation", async () => {
    const before = await roster();
    const invited = before.find((m) => m.status === "INVITED");
    expect(invited).toBeTruthy();
    authenticatedButNotOwner();

    const state = await revokeInviteAction(undefined, idForm(invited!.id));
    expect(state.status).toBe("error");
    expect((await roster()).find((m) => m.id === invited!.id)).toBeTruthy();
  });
});

describe("an OWNER still gets working team management", () => {
  it("invites a member", async () => {
    const before = await roster();
    const state = await inviteMemberAction(undefined, inviteForm("owner.invite@acmecorp.test", "ANALYST"));

    expect(state.status).toBe("success");
    const after = await roster();
    expect(after).toHaveLength(before.length + 1);
    expect(after.find((m) => m.email === "owner.invite@acmecorp.test")?.role).toBe("ANALYST");
  });

  it("changes a role", async () => {
    const before = await roster();
    const target = before.find((m) => m.role !== "DEVELOPER")!;

    const state = await changeRoleAction(undefined, idsForm([target.id], { role: "DEVELOPER" }));
    expect(state.status).toBe("success");
    expect((await roster()).find((m) => m.id === target.id)?.role).toBe("DEVELOPER");
  });

  it("still validates input after authorizing", async () => {
    const state = await inviteMemberAction(undefined, inviteForm("not-an-email", "ADMIN"));
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/valid email address/i);
  });

  it("reports a re-set invitation without claiming an email was sent", async () => {
    const invited = (await roster()).find((m) => m.status === "INVITED")!;

    const state = await resendInviteAction(undefined, idForm(invited.id));
    expect(state.status).toBe("success");
    expect(state.message).toMatch(/no email was sent/i);
    expect(state.message).not.toMatch(/Invite re-sent/i);
  });
});
