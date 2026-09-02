import { describe, expect, it } from "vitest";
import {
  changeMemberRole,
  deactivateMember,
  getMember,
  inviteMember,
  INVITE_TTL_DAYS,
  listMembers,
  membersToCsv,
  reactivateMember,
  resendInvite,
  revokeInvite,
  roleCatalog,
} from "./team";

const ALL = { pageSize: 100 };

describe("team store (ADR-0022)", () => {
  it("seeds six members on the merchant's own domain (five active, one invite)", async () => {
    const { rows } = await listMembers(ALL);
    expect(rows).toHaveLength(6);
    for (const m of rows) {
      expect(m.email).toMatch(/@acmecorp\.com$/);
      expect(m.id).toMatch(/^mem_[0-9a-z]+$/);
    }
    const byStatus = (s: string) => rows.filter((m) => m.status === s).length;
    expect(byStatus("ACTIVE")).toBe(5);
    expect(byStatus("INVITED")).toBe(1);
    expect(byStatus("DEACTIVATED")).toBe(0);
  });

  it("invited members have no join date or last-active, and a join date is set on reactivation", async () => {
    const { rows } = await listMembers({ status: "INVITED", pageSize: 100 });
    expect(rows).toHaveLength(1);
    const invite = rows[0];
    expect(invite.joinedAt).toBeNull();
    expect(invite.lastActiveAt).toBeNull();
    expect(invite.invitedAt).not.toBeNull();

    const reactivated = await reactivateMember(invite.id);
    expect(reactivated?.status).toBe("ACTIVE");
    expect(reactivated?.joinedAt).not.toBeNull();
    expect(reactivated?.invitedAt).toBeNull();
  });

  it("filters by query and role, and sorts active before invited before deactivated", async () => {
    const byQuery = await listMembers({ q: "daniel" });
    expect(byQuery.total).toBe(1);
    expect(byQuery.rows[0].role).toBe("ADMIN");

    const devs = await listMembers({ role: "DEVELOPER" });
    expect(devs.total).toBe(2);
    expect(devs.rows.every((m) => m.role === "DEVELOPER")).toBe(true);

    const all = await listMembers(ALL);
    const rank = { ACTIVE: 0, INVITED: 1, DEACTIVATED: 2 } as const;
    const ranks = all.rows.map((m) => rank[m.status]);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    }
  });

  it("inviteMember adds an INVITED member that the Pending Invites view can see", async () => {
    const pendingBefore = (await listMembers({ status: "INVITED", pageSize: 100 })).total;
    const member = await inviteMember({
      name: "Anna Wijaya",
      email: "anna@acmecorp.com",
      role: "RISK_ANALYST",
    });
    expect(member.status).toBe("INVITED");
    expect(member.invitedAt).not.toBeNull();
    expect(member.joinedAt).toBeNull();
    const pending = await listMembers({ status: "INVITED", pageSize: 100 });
    expect(pending.total).toBe(pendingBefore + 1);
    expect(pending.rows.map((m) => m.email)).toContain("anna@acmecorp.com");
  });

  it("changeMemberRole, deactivate/reactivate, resend and revoke all take effect", async () => {
    const member = await inviteMember({
      name: "Test Invitee",
      email: "invitee@acmecorp.com",
      role: "ANALYST",
    });

    const asAdmin = await changeMemberRole(member.id, "ADMIN");
    expect(asAdmin?.role).toBe("ADMIN");

    const resent = await resendInvite(member.id);
    expect(resent?.invitedAt).not.toBeNull();

    const revoked = await revokeInvite(member.id);
    expect(revoked).toBe(true);
    expect(await getMember(member.id)).toBeNull();
    // revoking a non-invite is a no-op
    const { rows } = await listMembers(ALL);
    const active = rows.find((m) => m.status === "ACTIVE");
    expect(await revokeInvite(active!.id)).toBe(false);
    expect(await getMember(active!.id)).not.toBeNull();

    // deactivate + reactivate round trip
    const deactivated = await deactivateMember(active!.id);
    expect(deactivated?.status).toBe("DEACTIVATED");
    const back = await reactivateMember(active!.id);
    expect(back?.status).toBe("ACTIVE");
  });

  it("the roles catalog reports four roles with derived active member counts", async () => {
    const catalog = await roleCatalog();
    expect(catalog).toHaveLength(4);
    const values = catalog.map((r) => r.value);
    expect(values).toContain("ADMIN");
    expect(values).toContain("RISK_ANALYST");
    const sum = catalog.reduce((n, r) => n + r.members, 0);
    const { total } = await listMembers(ALL);
    // cancelled/invited members are not counted as active members of a role
    expect(sum).toBeLessThanOrEqual(total);
    expect(sum).toBeGreaterThanOrEqual(4);
  });

  it("exports csv with one line per member and raw values", async () => {
    const { rows } = await listMembers(ALL);
    const csv = membersToCsv(rows);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("id,name,email,role,status,joined_at,invited_at,last_active_at");
    expect(lines).toHaveLength(rows.length + 1);
    for (const line of lines.slice(1)) {
      const cells = line.split(",");
      expect(cells).toHaveLength(8);
      expect(cells[0]).toMatch(/^mem_/);
    }
    // the invited member exports with empty joined_at and a filled invited_at
    const invitedLine = lines.find((l) => l.includes(",INVITED,"));
    expect(invitedLine).toBeDefined();
    expect(invitedLine!.split(",")[5]).toBe("");
    expect(invitedLine!.split(",")[6]).not.toBe("");
    // invite TTL is a stable, stated constant
    expect(INVITE_TTL_DAYS).toBe(7);
  });
});
