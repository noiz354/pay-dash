// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { addBlocklist } from "@/server/data/blocklist";
import { GET } from "./route";

/**
 * Wave 7G Q1 (route level) — the fraud blocklist CSV export boundary (G-7).
 *
 * A blocklist export is another merchant's fraud investigation state with a
 * filename: blocked IPs, masked card ranges and email domains. The route asked
 * `guardExport(request, "audit.read")` for a tenant and then **discarded
 * `guard.organizationId`**, listing every entry in the process (the 7A shape #3
 * defect, spec P-5). It also answered `Cache-Control: no-store` with no
 * `private` and no `Vary: Cookie`, so a shared cache could hold one tenant's
 * fraud controls.
 *
 * RED on `6c104ab`: no tenant predicate, no `private`, no `Vary`.
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
  const req = new NextRequest(`http://localhost/api/exports/blocklist${query}`);
  return GET(req as never).then(async (res) => ({
    res,
    csv: res.status === 200 ? await res.text() : "",
  }));
}

async function twoTenants() {
  await addBlocklist(ctxA, { type: "IP", value: "198.51.100.7", reason: "KNOWN_MALICIOUS" });
  await addBlocklist(ctxA, { type: "EMAIL", value: "throwaway.test", reason: "HIGH_FREQUENCY" });
  await addBlocklist(ctxB, { type: "IP", value: "203.0.113.99", reason: "CHARGEBACK_ABUSE" });
}

const PREV_AUTH_ENFORCED = process.env.AUTH_ENFORCED;

beforeEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticBlocklistStore;
  process.env.AUTH_ENFORCED = "off";
  asOrg(ORG_A);
});

afterEach(() => {
  if (PREV_AUTH_ENFORCED === undefined) delete process.env.AUTH_ENFORCED;
  else process.env.AUTH_ENFORCED = PREV_AUTH_ENFORCED;
});

describe("GET /api/exports/blocklist — tenant scoping", () => {
  it("Org A's export contains only A's entries", async () => {
    await twoTenants();
    const { csv } = await download();
    expect(csv).toContain("198.51.100.7");
    expect(csv).toContain("throwaway.test");
    expect(csv).not.toContain("203.0.113.99");
    // The prototype seed is the demo tenant's, not A's.
    expect(csv).not.toContain("mailinator.com");
  });

  it("the filters narrow inside the tenant and never widen across it", async () => {
    await twoTenants();
    const ips = await download("?type=ip");
    expect(ips.csv).toContain("198.51.100.7");
    expect(ips.csv).not.toContain("throwaway.test");

    // A needle that matches only B answers with a header and no rows.
    const crossNeedle = await download("?q=203.0.113.99");
    expect(crossNeedle.res.status).toBe(200);
    expect(crossNeedle.csv.trim().split("\n")).toHaveLength(1);
  });

  it("a browser-supplied ?organizationId= never wins over the session", async () => {
    await twoTenants();
    const { csv } = await download("?organizationId=org_beta");
    expect(csv).toContain("198.51.100.7");
    expect(csv).not.toContain("203.0.113.99");
  });

  it("the CSV header keeps its frozen vocabulary and carries no tenant column", async () => {
    await twoTenants();
    const { csv } = await download();
    expect(csv.split("\n")[0]).toBe("type,value,reason,added_at");
    expect(csv).not.toMatch(/organization|tenant/i);
  });

  it("the response is per-user: private, no-store, Vary: Cookie (spec P-5)", async () => {
    await twoTenants();
    const { res } = await download();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Vary")).toMatch(/Cookie/);
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="blocklist-/);
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
