// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { createSubscription } from "@/server/data/subscriptions";
import { GET } from "./route";

/**
 * Wave 7D Q1 (route level) — the subscriptions CSV export boundary.
 *
 * `guardExport()` knows the actor's organization and the route throws that
 * knowledge away, exporting the process-wide plan book. It also answers with a
 * shared-cache header (`no-store` without `private`, no `Vary: Cookie`) — the
 * 7A shape #3 defect (spec P-6).
 *
 * RED on `af18cc4`: the route takes no tenant predicate and its cache headers
 * are not per-user.
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
  const req = new NextRequest(`http://localhost/api/exports/subscriptions${query}`);
  return GET(req as never).then(async (res) => ({
    res,
    csv: res.status === 200 ? await res.text() : "",
  }));
}

const plan = (customerEmail: string, planName: string, amount: number) => ({
  customerName: customerEmail.split("@")[0]!,
  customerEmail,
  planName,
  interval: "monthly" as const,
  amount,
});

async function twoTenants() {
  await createSubscription(parseOrganizationContext({ organizationId: ORG_A }), plan("export@alpha.example", "Growth", 15_000_000));
  await createSubscription(parseOrganizationContext({ organizationId: ORG_B }), plan("export@beta.example", "Growth", 15_000_999));
}

const PREV_AUTH_ENFORCED = process.env.AUTH_ENFORCED;

beforeEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticSubscriptionStore;
  delete g.__kineticInvoiceStore;
  delete g.__kineticTxStore;
  process.env.AUTH_ENFORCED = "off";
  asOrg(ORG_A);
});

afterEach(() => {
  if (PREV_AUTH_ENFORCED === undefined) delete process.env.AUTH_ENFORCED;
  else process.env.AUTH_ENFORCED = PREV_AUTH_ENFORCED;
});

describe("GET /api/exports/subscriptions — tenant scoping", () => {
  it("Org A's CSV contains only A's plans", async () => {
    await twoTenants();
    const { csv } = await download();
    expect(csv).toContain("export@alpha.example");
    expect(csv).not.toContain("export@beta.example");
    // The demo tenant's prototype plans are not A's to export either.
    expect(csv).not.toContain("finance@initech.eu");
  });

  it("a browser-supplied ?organizationId= never wins over the session", async () => {
    await twoTenants();
    const { csv } = await download("?organizationId=org_beta");
    expect(csv).toContain("export@alpha.example");
    expect(csv).not.toContain("export@beta.example");
  });

  it("filters are applied inside the tenant, not before the predicate", async () => {
    await twoTenants();
    const { csv } = await download("?q=beta");
    expect(csv.split("\n")).toHaveLength(1); // header only
    expect(csv).not.toContain("export@beta.example");
  });

  it("the CSV header carries no tenant column (spec R-5)", async () => {
    await twoTenants();
    const { csv } = await download();
    const header = csv.split("\n")[0]!;
    expect(header).toBe("id,plan,customer_name,customer_email,interval,amount,currency,status,started_at,next_billing_at,cancelled_at");
    expect(header).not.toMatch(/organization/i);
  });

  it("the response is per-user: private, no-store, Vary: Cookie (spec P-6)", async () => {
    await twoTenants();
    const { res } = await download();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Vary")).toMatch(/Cookie/);
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="subscriptions-/);
  });

  it("an unresolved guard organization is refused with 401, never exported", async () => {
    session.mockRejectedValue(new Error("no session"));
    await twoTenants();
    const { res, csv } = await download();
    expect(res.status).toBe(401);
    expect(csv).toBe("");
  });
});
