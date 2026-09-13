// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { createBatch } from "@/server/data/payouts";
import { GET } from "./route";

/**
 * Wave 7B Q1 (U-6, route level) — the payout CSV export boundary.
 *
 * `guardExport()` knows the actor's organization and the route throws that
 * knowledge away (`route.ts:10-21`), exporting the process-wide batch set. A
 * CSV is the highest-impact leak in a dashboard because it is designed to
 * leave the building. These tests pin the fix: the guard's organization id
 * becomes the query predicate.
 *
 * RED on main: the route takes no tenant predicate.
 */

const ORG_A = "org_alpha";
const ORG_B = "org_beta";

const session = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/session-org-context", () => ({
  resolveSessionOrgContext: session,
  requireStrictOrgContext: session,
}));

function asOrg(organizationId: string, userId: string | null = "user_a") {
  session.mockResolvedValue({ organizationId, roles: ["OWNER"], userId, isDemoFallback: false });
}

function download(query = "") {
  const req = new NextRequest(`http://localhost/api/exports/payouts${query}`);
  return GET(req as never).then(async (res) => ({
    res,
    csv: res.status === 200 ? await res.text() : "",
  }));
}

async function twoTenants() {
  await createBatch(
    parseOrganizationContext({ organizationId: ORG_A }),
    {
      name: "Alpha export batch",
      recipients: [
        { line: 1, name: "Alpha Supplier", bank: "BCA", accountNumber: "1111111111", amount: 1_500_000, reference: "INV-A-X" },
      ],
    },
    { createdBy: "user_a" },
  );
  await createBatch(
    parseOrganizationContext({ organizationId: ORG_B }),
    {
      name: "Beta export batch",
      recipients: [
        { line: 1, name: "Beta Supplier", bank: "Mandiri", accountNumber: "2222222222", amount: 7_500_000, reference: "INV-B-X" },
      ],
    },
    { createdBy: "user_b" },
  );
}

const PREV_AUTH_ENFORCED = process.env.AUTH_ENFORCED;

beforeEach(() => {
  (globalThis as unknown as { __kineticPayoutStore?: unknown }).__kineticPayoutStore = undefined;
  process.env.AUTH_ENFORCED = "off";
  asOrg(ORG_A);
});

afterEach(() => {
  if (PREV_AUTH_ENFORCED === undefined) delete process.env.AUTH_ENFORCED;
  else process.env.AUTH_ENFORCED = PREV_AUTH_ENFORCED;
});

describe("GET /api/exports/payouts — tenant scoping", () => {
  it("Org A's CSV contains only A's batches", async () => {
    await twoTenants();
    const { res, csv } = await download();
    expect(res.status).toBe(200);
    expect(csv).toContain("Alpha export batch");
    expect(csv).not.toContain("Beta export batch");
    expect(csv).not.toContain("Beta Supplier");
  });

  it("a browser-supplied organizationId never changes which tenant is exported", async () => {
    await twoTenants();
    const { res, csv } = await download(`?organizationId=${ORG_B}`);
    expect(res.status).toBe(200);
    expect(csv).toContain("Alpha export batch");
    expect(csv).not.toContain("Beta export batch");
  });

  it("filters narrow inside A and cannot reach B's data", async () => {
    await twoTenants();
    const { csv } = await download(`?q=${encodeURIComponent("Beta export")}`);
    expect(csv.trim().split("\n")).toHaveLength(1); // header only
    const own = await download(`?q=${encodeURIComponent("Alpha export")}`);
    expect(own.csv).toContain("Alpha export batch");
  });

  it("refuses rather than exporting an empty file when the guard resolved no tenant", async () => {
    await twoTenants();
    asOrg("unknown");
    const { res, csv } = await download();
    expect(res.status).toBe(401);
    expect(csv).toBe("");
  });

  it("answers private, no-store and varies on Cookie so a CSV is never cached across tenants", async () => {
    await twoTenants();
    const { res } = await download();
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("cache-control")).toContain("private");
    expect(res.headers.get("vary")).toMatch(/cookie/i);
  });
});
