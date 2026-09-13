// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { TenantIsolationError } from "@/domain/security/tenant";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { __resetTenantDenials, listTenantDenials } from "@/server/services/tenant-denial";
import {
  changeMemberRole,
  countTeamTenants,
  deactivateMember,
  getMember,
  inviteMember,
  listMembers,
  membersToCsv,
  reactivateMember,
  resendInvite,
  revokeInvite,
  roleCatalog,
  soleTeamOrganizationId,
} from "./team";

/**
 * Wave 7F Q1 — Team tenant isolation, target-API tests (F-1..F-5, F-13a).
 *
 * Invariant: **Org A cannot list, invite, re-role, deactivate or read the
 * members of Org B — even knowing the member id exactly.** A role grant in A
 * never authorises anything in B, so a cross-tenant `changeMemberRole` is
 * privilege escalation rather than a display bug: F-13a pins that the tenant
 * check runs *before* the role is examined or written (7B M8 / 7D B-13
 * precedent — an order claim needs a pin, not a review).
 *
 * Membership is the tenant edge (spec P-10): `inviteMember` binds a user to the
 * *caller's* org only, there is no cross-org invite, and `memberIdFromEmail`
 * stays a pure global hash — so the same email in two tenants is two membership
 * rows distinguished by the composite key `(organizationId, id)`.
 *
 * RED on `f7cb1e2`: `team.ts` accepts no tenant at all — one process-wide
 * `{ members }` array (P-1) and five unscoped role mutations (P-2).
 */

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA: OrganizationContext = parseOrganizationContext({ organizationId: ORG_A });
const ctxB: OrganizationContext = parseOrganizationContext({ organizationId: ORG_B });
const ctxDemo: OrganizationContext = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });

function resetStores() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticTeamStore;
  __resetTenantDenials();
}

beforeEach(() => {
  resetStores();
});

/** One member per tenant, invited through the public API (no store poking). */
async function twoTenants() {
  const a = await inviteMember(ctxA, { name: "Alpha Owner", email: "owner@alpha.example", role: "ADMIN" });
  const b = await inviteMember(ctxB, { name: "Beta Owner", email: "owner@beta.example", role: "ADMIN" });
  return { a, b };
}

describe("F-1 Org A lists → only A's members", () => {
  it("the roster is the caller's, and the prototype team is the demo tenant's", async () => {
    await twoTenants();

    const pageA = await listMembers(ctxA, { pageSize: 100 });
    expect(pageA.rows.map((m) => m.email)).toEqual(["owner@alpha.example"]);
    expect(pageA.total).toBe(1);
    expect(pageA.rows.every((m) => m.organizationId === ORG_A)).toBe(true);

    // The five seeded members + one seeded invite belong to the demo tenant and
    // are not A's roster (the seed rule 7C/7D established).
    const demo = await listMembers(ctxDemo, { pageSize: 100 });
    expect(demo.total).toBe(6);
    expect(demo.rows.some((m) => m.email === "daniel@acmecorp.com")).toBe(true);
    expect(pageA.rows.some((m) => m.email === "daniel@acmecorp.com")).toBe(false);
  });

  it("every page and status filter of A stays inside A", async () => {
    await twoTenants();
    await inviteMember(ctxA, { name: "Alpha Dev", email: "dev@alpha.example", role: "DEVELOPER" });
    await inviteMember(ctxB, { name: "Beta Dev", email: "dev@beta.example", role: "DEVELOPER" });

    for (const filters of [
      { pageSize: 1 },
      { page: 2, pageSize: 1 },
      { role: "DEVELOPER" as const },
      { statuses: ["INVITED"] as ("INVITED" | "ACTIVE")[] },
      { q: "beta" },
    ]) {
      const page = await listMembers(ctxA, filters);
      expect(page.rows.every((m) => m.organizationId === ORG_A), JSON.stringify(filters)).toBe(true);
      expect(page.rows.some((m) => m.email.includes("@beta.example")), JSON.stringify(filters)).toBe(false);
    }
    // A needle that matches only B answers empty rather than crossing over.
    expect((await listMembers(ctxA, { q: "owner@beta.example" })).total).toBe(0);
  });
});

describe("F-2 member detail → foreign is null", () => {
  it("own id resolves, foreign id is indistinguishable from an unknown one", async () => {
    const { a, b } = await twoTenants();

    expect((await getMember(ctxA, a.id))?.email).toBe("owner@alpha.example");
    expect(await getMember(ctxA, b.id)).toBeNull();
    expect(await getMember(ctxA, "mem_doesnotexist")).toBeNull();
    // …and the demo roster is not A's either.
    const demoAdmin = (await listMembers(ctxDemo, { pageSize: 100 })).rows[0]!;
    expect(await getMember(ctxA, demoAdmin.id)).toBeNull();
  });
});

describe("F-3 invite binds to the caller's org only (spec P-10)", () => {
  it("the owner comes from the context, never from the input", async () => {
    const member = await inviteMember(ctxA, { name: "Alpha Analyst", email: "analyst@alpha.example", role: "ANALYST" });
    expect(member.organizationId).toBe(ORG_A);
    expect(member.status).toBe("INVITED");
    expect((await listMembers(ctxB, { pageSize: 100 })).rows.some((m) => m.id === member.id)).toBe(false);
  });

  it("the same email in two tenants is two memberships (composite key)", async () => {
    const inA = await inviteMember(ctxA, { name: "Shared Person", email: "shared@example.com", role: "ANALYST" });
    const inB = await inviteMember(ctxB, { name: "Shared Person", email: "shared@example.com", role: "ADMIN" });

    // `memberIdFromEmail` is a pure global hash, so the id *prefix* collides by
    // design; isolation is the (org, id) pair, not id uniqueness.
    expect(inA.id.slice(0, 12)).toBe(inB.id.slice(0, 12));
    expect(inA.organizationId).toBe(ORG_A);
    expect(inB.organizationId).toBe(ORG_B);
    // Each tenant resolves its own row, and only its own role.
    expect((await getMember(ctxA, inA.id))?.role).toBe("ANALYST");
    expect((await getMember(ctxB, inB.id))?.role).toBe("ADMIN");
    expect(await getMember(ctxB, inA.id)).toBeNull();
  });

  it("a forced id collision still resolves each tenant's own row (composite key, not id uniqueness)", async () => {
    const { a } = await twoTenants();
    // Production code mints unique ids, so the collision is forced through the
    // raw store slot (a test seam, FS-5): what is under test is that isolation
    // is the pair (organizationId, id) — a shared id must not make one tenant's
    // row answerable, or writable, from another.
    const slot = (
      globalThis as unknown as {
        __kineticTeamStore?: { tenants: Map<string, { members: { id: string; role: string }[] }> };
      }
    ).__kineticTeamStore;
    slot!.tenants.get(ORG_B)!.members[0]!.id = a.id;

    expect((await getMember(ctxA, a.id))?.email).toBe("owner@alpha.example");
    expect((await getMember(ctxB, a.id))?.email).toBe("owner@beta.example");

    // The escalation edge resolves by partition, not by id: re-roling `a.id` as
    // A changes A's member and leaves B's identically-keyed member alone.
    await changeMemberRole(ctxA, a.id, "DEVELOPER");
    expect((await getMember(ctxA, a.id))?.role).toBe("DEVELOPER");
    expect((await getMember(ctxB, a.id))?.role).toBe("ADMIN");

    // And the roster each tenant lists is still its own.
    expect((await listMembers(ctxA, { pageSize: 100 })).rows.map((m) => m.email)).toEqual(["owner@alpha.example"]);
    expect((await listMembers(ctxB, { pageSize: 100 })).rows.map((m) => m.email)).toEqual(["owner@beta.example"]);
  });
});

describe("F-4 role change is tenant-bound (privilege escalation edge)", () => {
  it("A re-roles A's own member", async () => {
    const { a } = await twoTenants();
    const updated = await changeMemberRole(ctxA, a.id, "DEVELOPER");
    expect(updated?.role).toBe("DEVELOPER");
    expect((await getMember(ctxA, a.id))?.role).toBe("DEVELOPER");
  });

  it("A cannot re-role B's member: throws cross-tenant, target untouched", async () => {
    const { b } = await twoTenants();

    await expect(changeMemberRole(ctxA, b.id, "ANALYST")).rejects.toThrow(/cross-tenant/i);
    await expect(changeMemberRole(ctxA, b.id, "ANALYST")).rejects.toBeInstanceOf(TenantIsolationError);

    // The escalation did not land, in either tenant's view.
    expect((await getMember(ctxB, b.id))?.role).toBe("ADMIN");
    expect((await getMember(ctxA, b.id))).toBeNull();

    // The refusal is audited, and the record carries ids only — never a name,
    // email or role (the sink's own contract).
    const denials = listTenantDenials().filter((d) => d.surface === "server/data/team.changeMemberRole");
    expect(denials.length).toBeGreaterThan(0);
    expect(denials[0]!.actorOrg).toBe(ORG_A);
    expect(denials[0]!.requestedOrg).toBe(ORG_B);
    expect(denials[0]!.resourceId).toBe(b.id);
    expect(JSON.stringify(denials[0])).not.toMatch(/owner@beta|Beta Owner|ANALYST|ADMIN/i);
  });

  it("an unknown member id answers null, not a throw", async () => {
    await twoTenants();
    expect(await changeMemberRole(ctxA, "mem_nope", "ANALYST")).toBeNull();
  });
});

describe("F-5 lifecycle mutations are tenant-bound", () => {
  it.each([
    ["deactivateMember", deactivateMember],
    ["reactivateMember", reactivateMember],
    ["resendInvite", resendInvite],
  ] as const)("%s refuses a foreign member and leaves the target untouched", async (_name, fn) => {
    const { b } = await twoTenants();
    await expect((fn as (ctx: OrganizationContext, id: string) => Promise<unknown>)(ctxA, b.id)).rejects.toBeInstanceOf(
      TenantIsolationError,
    );
    // B's member is exactly as it was: still INVITED, still ADMIN.
    const after = await getMember(ctxB, b.id);
    expect(after?.status).toBe("INVITED");
    expect(after?.role).toBe("ADMIN");
  });

  it("revokeInvite cannot delete another tenant's invite", async () => {
    const { b } = await twoTenants();
    await expect(revokeInvite(ctxA, b.id)).rejects.toBeInstanceOf(TenantIsolationError);
    expect((await getMember(ctxB, b.id))).not.toBeNull();
    // A's own invite can be revoked, and the answer is the honest boolean.
    const own = await inviteMember(ctxA, { name: "Temp", email: "temp@alpha.example", role: "ANALYST" });
    expect(await revokeInvite(ctxA, own.id)).toBe(true);
    expect(await getMember(ctxA, own.id)).toBeNull();
    expect(await revokeInvite(ctxA, own.id)).toBe(false);
  });

  it("own lifecycle mutations still work", async () => {
    const { a } = await twoTenants();
    expect((await deactivateMember(ctxA, a.id))?.status).toBe("DEACTIVATED");
    expect((await reactivateMember(ctxA, a.id))?.status).toBe("ACTIVE");
    const invite = await inviteMember(ctxA, { name: "Resend Me", email: "resend@alpha.example", role: "ANALYST" });
    const first = (await getMember(ctxA, invite.id))!.invitedAt;
    const resent = await resendInvite(ctxA, invite.id);
    expect(resent?.invitedAt).not.toBeNull();
    expect(resent?.invitedAt! >= first!).toBe(true);
  });
});

describe("F-13a order pin — the tenant check runs before the role check", () => {
  it("a foreign id is refused before the role is validated or written", async () => {
    const { b } = await twoTenants();
    // Even with a *valid* role and a member that exists, the tenant answer comes
    // first: the error is the isolation error, not a role-validation error, and
    // the write never happens.
    await expect(changeMemberRole(ctxA, b.id, "OWNER" as never)).rejects.toBeInstanceOf(TenantIsolationError);
    expect((await getMember(ctxB, b.id))?.role).toBe("ADMIN");

    // And nothing was recorded in the actor's partition either — a
    // write-before-check would leave a stray role change on A's own roster.
    const slot = (
      globalThis as unknown as {
        __kineticTeamStore?: { tenants?: Map<string, { members: { id: string; role: string }[] }> };
      }
    ).__kineticTeamStore;
    for (const [, partition] of slot?.tenants ?? new Map<string, { members: { id: string; role: string }[] }>()) {
      const hit = partition.members.find((m) => m.id === b.id);
      if (hit && partition !== slot?.tenants?.get(ORG_B)) {
        expect(hit.role, "a refused re-role must not appear anywhere else").toBe("ADMIN");
      }
    }
  });
});

describe("F-12b role catalog, probes and store privacy", () => {
  it("the role catalog counts one tenant's members", async () => {
    await twoTenants();
    await inviteMember(ctxA, { name: "Alpha Dev", email: "dev@alpha.example", role: "DEVELOPER" });
    await reactivateMember(ctxA, (await listMembers(ctxA, { pageSize: 100 })).rows.find((m) => m.email === "dev@alpha.example")!.id);

    const catalogA = await roleCatalog(ctxA);
    const developerRow = catalogA.find((r) => r.value === "DEVELOPER")!;
    expect(developerRow.members).toBe(1);
    // The demo tenant's own catalog is untouched by A's invite.
    const catalogDemo = await roleCatalog(ctxDemo);
    expect(catalogDemo.find((r) => r.value === "DEVELOPER")!.members).toBe(2);
  });

  it("the tenancy probes answer metadata, never rows", async () => {
    await twoTenants();
    expect(countTeamTenants()).toBe(3); // A, B and the seeded demo tenant
    const sole = soleTeamOrganizationId();
    expect(sole === null || typeof sole === "string").toBe(true);
    expect(sole).toBeNull(); // more than one tenant ⇒ no "the" team
    expect(JSON.stringify(sole)).not.toMatch(/owner@alpha|daniel@acmecorp/);
  });

  it("the store slot is partitioned, not one process-wide roster", async () => {
    await twoTenants();
    const slot = (globalThis as unknown as { __kineticTeamStore?: { members?: unknown } }).__kineticTeamStore;
    expect(slot?.members).toBeUndefined();
  });

  it("the CSV serializer stays pure and carries no tenant column", async () => {
    await twoTenants();
    const { rows } = await listMembers(ctxA, { pageSize: 100 });
    const csv = membersToCsv(rows);
    expect(csv.split("\n")[0]).toBe("id,name,email,role,status,joined_at,invited_at,last_active_at");
    expect(csv).not.toMatch(/organization/i);
    expect(csv).toContain("owner@alpha.example");
    expect(csv).not.toContain("owner@beta.example");
  });
});

describe("F-12c no context, no tenant", () => {
  it("every team entry point refuses a missing or malformed ctx", async () => {
    await twoTenants();
    // @ts-expect-error — a missing ctx must not be callable where it counts
    await expect(listMembers({ pageSize: 10 })).rejects.toThrow();
    // @ts-expect-error — same for the escalation edge
    await expect(changeMemberRole("mem_x", "ANALYST")).rejects.toThrow();
    expect(() => parseOrganizationContext({ organizationId: "   " })).toThrow();
  });
});
