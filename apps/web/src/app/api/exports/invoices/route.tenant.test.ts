// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { seedDemoLedgerForOrganization } from "@/server/data/transactions";
import { GET } from "./route";

/**
 * Wave 7D Q1 (route level) — the statement (invoices) CSV export boundary.
 *
 * Invoices are ledger-derived, so an unscoped export leaks a *computed* view of
 * every tenant's fees: the aggregate is the leak, not just the rows. The route
 * also answers with a shared-cache header (7A shape #3, spec P-6).
 *
 * RED on `af18cc4`: no tenant predicate, no `private` / `Vary: Cookie`.
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
  const req = new NextRequest(`http://localhost/api/exports/invoices${query}`);
  return GET(req as never).then(async (res) => ({
    res,
    csv: res.status === 200 ? await res.text() : "",
  }));
}

function row(id: string, createdAt: string, amount: number, fee: number) {
  return {
    id,
    createdAt,
    amount,
    fee,
    net: amount - fee,
    status: "SUCCEEDED" as const,
    currency: "IDR",
    channel: "CARD" as const,
    customerName: `${id} buyer`,
    customerEmail: `${id}@example.com`,
  };
}

function twoTenants() {
  seedDemoLedgerForOrganization(ctxA, { mode: "replace", rows: [row("txn_a_jan", "2026-01-15T10:00:00.000Z", 1_000_000, 29_000)] });
  seedDemoLedgerForOrganization(ctxB, { mode: "replace", rows: [row("txn_b_feb", "2026-02-15T10:00:00.000Z", 2_000_000, 58_000)] });
}

const PREV_AUTH_ENFORCED = process.env.AUTH_ENFORCED;

beforeEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticInvoiceStore;
  delete g.__kineticSubscriptionStore;
  delete g.__kineticTxStore;
  process.env.AUTH_ENFORCED = "off";
  asOrg(ORG_A);
});

afterEach(() => {
  if (PREV_AUTH_ENFORCED === undefined) delete process.env.AUTH_ENFORCED;
  else process.env.AUTH_ENFORCED = PREV_AUTH_ENFORCED;
});

describe("GET /api/exports/invoices — tenant scoping", () => {
  it("Org A's statement contains only A's invoice periods", async () => {
    twoTenants();
    const { csv } = await download();
    expect(csv).toContain("INV-2026-01-LEDGER");
    expect(csv).not.toContain("INV-2026-02-LEDGER");
    // The prototype statements belong to the demo tenant.
    expect(csv).not.toContain("INV-2023-08-4421");
    expect(csv).not.toContain("INV-2023-09-5102");
  });

  it("the exported amount is A's fee total, not the process total", async () => {
    twoTenants();
    const { csv } = await download();
    // Every cell is quoted (`escape`), so the row key is quoted too.
    const line = csv.split("\n").find((l) => l.startsWith('"INV-2026-01-LEDGER",'))!;
    expect(line).toContain('"29000"');
    expect(line).not.toContain('"58000"');
  });

  it("a browser-supplied ?organizationId= never wins over the session", async () => {
    twoTenants();
    const { csv } = await download("?organizationId=org_beta");
    expect(csv).toContain("INV-2026-01-LEDGER");
    expect(csv).not.toContain("INV-2026-02-LEDGER");
  });

  it("the CSV header carries no tenant column (spec R-5)", async () => {
    twoTenants();
    const { csv } = await download();
    const header = csv.split("\n")[0]!;
    expect(header).toBe("invoice_id,period_start,period_end,issued_at,due_at,status,amount,currency,transactions,processed_volume,paid_at");
    expect(header).not.toMatch(/organization/i);
  });

  it("the response is per-user: private, no-store, Vary: Cookie (spec P-6)", async () => {
    twoTenants();
    const { res } = await download();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Vary")).toMatch(/Cookie/);
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="statement-/);
  });

  it("an unresolved guard organization is refused with 401, never exported", async () => {
    session.mockRejectedValue(new Error("no session"));
    twoTenants();
    const { res, csv } = await download();
    expect(res.status).toBe(401);
    expect(csv).toBe("");
  });
});
