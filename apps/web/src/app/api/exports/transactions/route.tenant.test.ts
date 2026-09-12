// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { createTransaction, seedDemoLedgerForOrganization } from "@/server/data/transactions";
import { GET } from "./route";

/**
 * Wave 7A T-6 (route level) — the CSV export boundary.
 *
 * `guardExport()` has always known the actor's organization and the route has
 * always thrown that knowledge away. These tests pin the one line that closes
 * it: the guard's organization id becomes the query predicate.
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

async function download(query = "") {
  const res = await GET(new Request(`http://localhost/api/exports/transactions${query}`) as never);
  return { res, csv: res.status === 200 ? await res.text() : "" };
}

async function twoTenants() {
  const a = await createTransaction(parseOrganizationContext({ organizationId: ORG_A }), {
    amount: 1_500_000,
    currency: "IDR",
    channel: "CARD",
    customerName: "Alpha Merchant",
    customerEmail: "ops@alpha.test",
    description: "Alpha invoice",
    referenceId: "txn_export_alpha",
  });
  const b = await createTransaction(parseOrganizationContext({ organizationId: ORG_B }), {
    amount: 7_500_000,
    currency: "IDR",
    channel: "VA",
    customerName: "Beta Merchant",
    customerEmail: "ops@beta.test",
    description: "Beta invoice",
    referenceId: "txn_export_beta",
  });
  return { a, b };
}

beforeEach(() => {
  (globalThis as unknown as { __kineticTxStore?: unknown }).__kineticTxStore = undefined;
  process.env.AUTH_ENFORCED = "off";
  asOrg(ORG_A);
});

describe("GET /api/exports/transactions — tenant scoping", () => {
  it("Org A's CSV contains only A's rows", async () => {
    await twoTenants();
    const { res, csv } = await download();
    expect(res.status).toBe(200);
    expect(csv).toContain("txn_export_alpha");
    expect(csv).not.toContain("txn_export_beta");
    expect(csv).not.toContain("ops@beta.test");
    expect(csv).not.toContain("Beta Merchant");
  });

  it("a browser-supplied organizationId never changes which tenant is exported", async () => {
    await twoTenants();
    const { res, csv } = await download(`?organizationId=${ORG_B}`);
    expect(res.status).toBe(200);
    expect(csv).toContain("txn_export_alpha");
    expect(csv).not.toContain("txn_export_beta");
  });

  it("filters narrow inside A and cannot reach B's data", async () => {
    await twoTenants();
    const { csv } = await download(`?q=${encodeURIComponent("Beta invoice")}`);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(1); // header only
    const own = await download(`?q=${encodeURIComponent("Alpha invoice")}`);
    expect(own.csv).toContain("txn_export_alpha");
  });

  it("refuses to export when no organization can be resolved", async () => {
    await twoTenants();
    asOrg("");
    const { res, csv } = await download();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(csv).toBe("");
  });

  it("refuses rather than exporting an empty file when the guard resolved no tenant", async () => {
    // `"unknown"` is what `guardExport()` returns in a non-enforcing mode when no
    // session exists. An empty-but-200 CSV is the worst shape for that: it looks
    // like "this tenant has no transactions" to whoever reports on it.
    await twoTenants();
    asOrg("unknown");
    const { res, csv } = await download();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthorized" });
    expect(csv).toBe("");
  });

  it("answers with no-store so a CSV is never cached across tenants", async () => {
    await twoTenants();
    const { res } = await download();
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("the export is capped to A's own row set, not the process-wide one", async () => {
    const ctxA = parseOrganizationContext({ organizationId: ORG_A });
    const ctxB = parseOrganizationContext({ organizationId: ORG_B });
    seedDemoLedgerForOrganization(ctxA, { count: 30 });
    seedDemoLedgerForOrganization(ctxB, { count: 40 });
    const { csv } = await download("?pageSize=100");
    const rows = csv.trim().split("\n").slice(1);
    expect(rows.length).toBeLessThanOrEqual(30);
    expect(rows.length).toBeGreaterThan(0);
    expect(csv).not.toContain("org_beta");
  });
});
