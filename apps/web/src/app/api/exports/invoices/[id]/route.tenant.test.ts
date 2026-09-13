// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { seedDemoLedgerForOrganization } from "@/server/data/transactions";
import { GET } from "./route";

/**
 * Wave 7D Q1 (route level) — the single-invoice statement download.
 *
 * This is the sharpest edge of the billing export surface: the id is in the URL,
 * so a caller who knows (or guesses) another tenant's period can ask for its
 * statement directly. The wire answer must be the same 404 for "not yours" and
 * "does not exist" (spec §2 C-5), and the CSV must never carry the owner.
 *
 * RED on `af18cc4`: the route calls `invoiceStatementCsv(id)` with no tenant at
 * all, so any authenticated caller can download any invoice statement.
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

function download(id: string, query = "") {
  const req = new NextRequest(`http://localhost/api/exports/invoices/${encodeURIComponent(id)}${query}`);
  return GET(req as never, { params: Promise.resolve({ id: encodeURIComponent(id) }) }).then(async (res) => ({
    res,
    body: await res.text(),
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

describe("GET /api/exports/invoices/[id] — tenant scoping", () => {
  it("A can download A's own statement", async () => {
    twoTenants();
    const { res, body } = await download("INV-2026-01-LEDGER");
    expect(res.status).toBe(200);
    expect(body).toContain("INV-2026-01-LEDGER");
    expect(body).toContain("29000");
  });

  it("B's period is 404 for A, byte-identical to an id that never existed", async () => {
    twoTenants();
    const foreign = await download("INV-2026-02-LEDGER");
    const unknown = await download("INV-1999-01-LEDGER");
    expect(foreign.res.status).toBe(404);
    expect(unknown.res.status).toBe(404);
    expect(foreign.body).toBe(unknown.body);
    expect(foreign.body).not.toContain("58000");
    expect(foreign.body).not.toMatch(/line_item|period/i);
  });

  it("the demo tenant's prototype statement is not A's to download", async () => {
    twoTenants();
    const { res, body } = await download("INV-2023-09-5102");
    expect(res.status).toBe(404);
    expect(body).not.toContain("13050000");
  });

  it("a browser-supplied ?organizationId= cannot select another tenant's statement", async () => {
    twoTenants();
    const { res } = await download("INV-2026-02-LEDGER", "?organizationId=org_beta");
    expect(res.status).toBe(404);
  });

  it("the statement carries no tenant column and the response is per-user", async () => {
    twoTenants();
    const { res, body } = await download("INV-2026-01-LEDGER");
    expect(body).not.toMatch(/organization|org_alpha|org_beta/i);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Vary")).toMatch(/Cookie/);
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="INV-2026-01-LEDGER\.csv"/);
  });

  it("an unresolved guard organization is refused with 401, never 404-with-data", async () => {
    session.mockRejectedValue(new Error("no session"));
    twoTenants();
    const { res, body } = await download("INV-2026-01-LEDGER");
    expect(res.status).toBe(401);
    expect(body).not.toContain("29000");
  });
});
