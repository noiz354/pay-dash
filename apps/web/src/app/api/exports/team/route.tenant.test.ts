// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { inviteMember } from "@/server/data/team";
import { GET } from "./route";

/**
 * Wave 7F Q1 (route level) — the team roster CSV export boundary (F-11).
 *
 * A roster export is an identity leak with a filename: member names, emails and
 * roles. The route already asked `guardExport` for `team.manage`, then dropped
 * the guard's organization on the floor and listed *every* member in the process
 * (7A shape #3, spec P-7). It also answered `Cache-Control: no-store` without
 * `private` or `Vary: Cookie`, so a shared cache could hold one tenant's roster.
 *
 * RED on `f7cb1e2`: no tenant predicate, no `private`, no `Vary`.
 */

const session = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/session-org-context", () => ({
  resolveSessionOrgContext: session,
  requireStrictOrgContext: session,
}));

function asOrg(organizationId: string, userId: string | null = "user_a") {
  session.mockResolvedValue({ organizationId, roles: ["OWNER"], userId, isDemoFallback: false });
}

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA = parseOrganizationContext({ organizationId: ORG_A });
const ctxB = parseOrganizationContext({ organizationId: ORG_B });

function download(query = "") {
  const req = new NextRequest(`http://localhost/api/exports/team${query}`);
  return GET(req as never).then(async (res) => ({
    res,
    csv: res.status === 200 ? await res.text() : "",
  }));
}

async function twoTenants() {
  await inviteMember(ctxA, { name: "Alpha Owner", email: "owner@alpha.example", role: "ADMIN" });
  await inviteMember(ctxA, { name: "Alpha Analyst", email: "analyst@alpha.example", role: "ANALYST" });
  await inviteMember(ctxB, { name: "Beta Owner", email: "owner@beta.example", role: "ADMIN" });
}

const PREV_AUTH_ENFORCED = process.env.AUTH_ENFORCED;

beforeEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticTeamStore;
  process.env.AUTH_ENFORCED = "off";
  asOrg(ORG_A);
});

afterEach(() => {
  if (PREV_AUTH_ENFORCED === undefined) delete process.env.AUTH_ENFORCED;
  else process.env.AUTH_ENFORCED = PREV_AUTH_ENFORCED;
});

describe("GET /api/exports/team — tenant scoping", () => {
  it("Org A's roster contains only A's members", async () => {
    await twoTenants();
    const { csv } = await download();
    expect(csv).toContain("owner@alpha.example");
    expect(csv).toContain("analyst@alpha.example");
    expect(csv).not.toContain("owner@beta.example");
    expect(csv).not.toContain("Beta Owner");
    // The prototype roster is the demo tenant's, not A's.
    expect(csv).not.toContain("daniel@acmecorp.com");
  });

  it("the filters narrow inside the tenant and never widen across it", async () => {
    await twoTenants();
    const byRole = await download("?role=ANALYST");
    expect(byRole.csv).toContain("analyst@alpha.example");
    expect(byRole.csv).not.toContain("owner@alpha.example");

    // A needle that matches only B answers with a header and no rows.
    const crossNeedle = await download("?q=owner%40beta.example");
    expect(crossNeedle.res.status).toBe(200);
    expect(crossNeedle.csv.trim().split("\n")).toHaveLength(1);
  });

  it("a browser-supplied ?organizationId= never wins over the session", async () => {
    await twoTenants();
    const { csv } = await download("?organizationId=org_beta");
    expect(csv).toContain("owner@alpha.example");
    expect(csv).not.toContain("owner@beta.example");
  });

  it("the CSV header carries no tenant column and keeps its vocabulary", async () => {
    await twoTenants();
    const { csv } = await download();
    const header = csv.split("\n")[0]!;
    expect(header).toBe("id,name,email,role,status,joined_at,invited_at,last_active_at");
    expect(header).not.toMatch(/organization/i);
    expect(csv).not.toMatch(/organization/i);
  });

  it("the response is per-user: private, no-store, Vary: Cookie (spec P-7)", async () => {
    await twoTenants();
    const { res } = await download();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Vary")).toMatch(/Cookie/);
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="team-/);
  });

  it("an unresolved guard organization is refused with 401, never exported", async () => {
    session.mockRejectedValue(new Error("no session"));
    await twoTenants();
    const { res, csv } = await download();
    expect(res.status).toBe(401);
    expect(csv).toBe("");
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/);
  });
});
