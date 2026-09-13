// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { createCustomer } from "@/server/data/customers";
import { GET } from "./route";

/**
 * Wave 7C Q1 (route level) — the customer CSV export boundary.
 *
 * `guardExport()` knows the actor's organization and the route throws that
 * knowledge away, exporting the process-wide directory. These tests pin the
 * fix: the guard's organization id becomes the query predicate.
 *
 * RED on main: the route takes no tenant predicate.
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

function download(query = "") {
  const req = new NextRequest(`http://localhost/api/exports/customers${query}`);
  return GET(req as never).then(async (res) => ({
    res,
    csv: res.status === 200 ? await res.text() : "",
  }));
}

async function twoTenants() {
  await createCustomer(parseOrganizationContext({ organizationId: ORG_A }), {
    name: "Alpha Export Buyer",
    email: "export@alpha.example",
  });
  await createCustomer(parseOrganizationContext({ organizationId: ORG_B }), {
    name: "Beta Export Buyer",
    email: "export@beta.example",
  });
}

const PREV_AUTH_ENFORCED = process.env.AUTH_ENFORCED;

beforeEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticCustomerStore;
  delete g.__kineticTxStore;
  process.env.AUTH_ENFORCED = "off";
  asOrg(ORG_A);
});

afterEach(() => {
  if (PREV_AUTH_ENFORCED === undefined) delete process.env.AUTH_ENFORCED;
  else process.env.AUTH_ENFORCED = PREV_AUTH_ENFORCED;
});

describe("GET /api/exports/customers — tenant scoping", () => {
  it("Org A's CSV contains only A's customers", async () => {
    await twoTenants();
    const { csv } = await download();
    expect(csv).toContain("export@alpha.example");
    expect(csv).not.toContain("export@beta.example");
  });

  it("a browser-supplied ?organizationId= never wins over the session", async () => {
    await twoTenants();
    const { csv } = await download("?organizationId=org_beta");
    expect(csv).toContain("export@alpha.example");
    expect(csv).not.toContain("export@beta.example");
  });

  it("CSV header stays stable without tenancy columns", async () => {
    await twoTenants();
    const { csv } = await download();
    const header = csv.split("\n")[0];
    expect(header).toContain("customer_id");
    expect(header).not.toMatch(/organization/i);
  });

  it("sends private cache headers", async () => {
    await twoTenants();
    const { res } = await download();
    expect(res.headers.get("Cache-Control")).toMatch(/private/);
    expect(res.headers.get("Vary")).toMatch(/Cookie/i);
  });
});
