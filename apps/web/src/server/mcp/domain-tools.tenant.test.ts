// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { createTransaction, getTransaction } from "@/server/data/transactions";
import { registerDomainTools } from "./domain-tools";

/**
 * Wave 7A T-15 — the MCP surface.
 *
 * `/api/mcp` is protected by one global bearer token with no organization
 * identity, yet it exposes `list_transactions`, `get_transaction` and
 * `refund_transaction`. Before this wave, any holder of that token could read
 * and refund every tenant's ledger. These tests pin the fail-closed fix:
 * no tenant ⇒ no tool result.
 */

const session = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/session-org-context", () => ({
  resolveSessionOrgContext: session,
  requireStrictOrgContext: session,
}));

// The Postgres stores import the generated Prisma client, which is absent in a
// fresh checkout (the same reason `mcp/server.integration.test.ts` is red at
// baseline). This file tests *tenant binding*, so the SQL side is stubbed: it
// must never be reached by a transaction tool any more (debt D-26).
vi.mock("./pg-stores", () => ({
  getBalanceOverviewPostgres: vi.fn(async () => ({ error: "unreachable from these tests" })),
}));

type ToolHandler = (input: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;

function capture(): { tools: Map<string, ToolHandler>; server: { registerTool: (n: string, s: unknown, h: ToolHandler) => void } } {
  const tools = new Map<string, ToolHandler>();
  return {
    tools,
    server: {
      registerTool(name, _spec, handler) {
        tools.set(name, handler);
      },
    },
  };
}

function payload(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0]?.text ?? "";
}

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const MEMORY = { dataSource: "memory" as const };

async function call(handle: ReturnType<typeof capture>, name: string, input: Record<string, unknown> = {}) {
  const handler = handle.tools.get(name);
  expect(handler, `tool ${name} must be registered`).toBeTruthy();
  return payload(await handler!({ ...MEMORY, ...input }));
}

async function seedForeign(referenceId: string) {
  return createTransaction(parseOrganizationContext({ organizationId: ORG_B }), {
    amount: 2_000,
    currency: "IDR",
    channel: "CARD",
    customerName: "Beta Merchant",
    customerEmail: "b@b.test",
    description: "Beta only",
    referenceId,
  });
}

beforeEach(() => {
  (globalThis as unknown as { __kineticTxStore?: unknown }).__kineticTxStore = undefined;
  session.mockReset();
  delete process.env.AUTH_ENFORCED;
});

describe("MCP transaction tools are tenant-bound", () => {
  it("list_transactions returns only the bound tenant's rows", async () => {
    await createTransaction(parseOrganizationContext({ organizationId: ORG_A }), {
      amount: 1_000,
      currency: "IDR",
      channel: "CARD",
      customerName: "Alpha Merchant",
      customerEmail: "a@a.test",
      referenceId: "txn_mcp_alpha",
    });
    await seedForeign("txn_mcp_beta");

    const handle = capture();
    registerDomainTools(handle.server as never, parseOrganizationContext({ organizationId: ORG_A }));

    const text = await call(handle, "list_transactions", { pageSize: 100 });
    expect(text).toContain("txn_mcp_alpha");
    expect(text).not.toContain("txn_mcp_beta");
    expect(text).not.toContain("b@b.test");
  });

  it("get_transaction of a foreign id is not found, not forbidden", async () => {
    const foreign = await seedForeign("txn_mcp_foreign");
    const handle = capture();
    registerDomainTools(handle.server as never, parseOrganizationContext({ organizationId: ORG_A }));

    const text = await call(handle, "get_transaction", { id: foreign.id });
    expect(text).toMatch(/not found|transaction_not_found|null/i);
    expect(text).not.toContain("b@b.test");
    expect(text).not.toContain("Beta Merchant");
  });

  it("refund_transaction refuses a foreign id and moves no money", async () => {
    const ctxB = parseOrganizationContext({ organizationId: ORG_B });
    const foreign = await seedForeign("txn_mcp_refund_target");
    const handle = capture();
    registerDomainTools(handle.server as never, parseOrganizationContext({ organizationId: ORG_A }));

    const text = await call(handle, "refund_transaction", { id: foreign.id, amount: 2_000 });
    expect(text).toMatch(/not found|error/i);
    expect((await getTransaction(ctxB, foreign.id))?.refundedAmount).toBe(0);
    expect((await getTransaction(ctxB, foreign.id))?.status).toBe("PENDING");
  });

  it("without a tenant the transaction tools refuse instead of defaulting", async () => {
    await seedForeign("txn_mcp_orphan_target");
    const handle = capture();
    registerDomainTools(handle.server as never, null);

    for (const [name, input] of [
      ["list_transactions", {}],
      ["get_transaction", { id: "txn_mcp_orphan_target" }],
      ["refund_transaction", { id: "txn_mcp_orphan_target", amount: 1 }],
    ] as const) {
      const text = await call(handle, name, input);
      expect(text, name).toMatch(/organization|tenant/i);
      expect(text, name).not.toMatch(/customerEmail|customerName/);
      expect(text, name).not.toContain("b@b.test");
    }
  });

  it("the Postgres transaction path stays refused until the table carries an organization (D-26)", async () => {
    const handle = capture();
    registerDomainTools(handle.server as never, parseOrganizationContext({ organizationId: ORG_A }));
    for (const name of ["list_transactions", "get_transaction"] as const) {
      const text = await call(handle, name, { dataSource: "postgres", id: "any" });
      expect(text, name).toMatch(/organization/i);
      expect(text, name).toMatch(/LedgerEntry|unscoped|not available/i);
    }
  });

  it("leaves the non-transaction tools registered (this wave is one slice)", async () => {
    const handle = capture();
    registerDomainTools(handle.server as never, null);
    expect(handle.tools.has("get_balance")).toBe(true);
    expect(handle.tools.has("list_payout_batches")).toBe(true);
  });
});

describe("resolveMcpOrganization", () => {
  it("answers from the session, never from a header the caller controls", async () => {
    session.mockResolvedValue({ organizationId: ORG_A, roles: ["OWNER"], userId: "user_a", isDemoFallback: false });
    const { resolveMcpOrganization } = await import("./auth");
    const org = await resolveMcpOrganization(new Request("http://localhost/api/mcp", { headers: { "x-organization-id": ORG_B } }));
    expect(org?.organizationId).toBe(ORG_A);
  });

  it("accepts the demo tenant only while the deployment is single-tenant", async () => {
    session.mockResolvedValue({ organizationId: "org_demo", roles: ["OWNER"], userId: null, isDemoFallback: true });
    const { resolveMcpOrganization } = await import("./auth");
    expect((await resolveMcpOrganization(new Request("http://localhost/api/mcp")))?.organizationId).toBe("org_demo");

    const { seedDemoLedgerForOrganization } = await import("@/server/data/transactions");
    seedDemoLedgerForOrganization(parseOrganizationContext({ organizationId: ORG_A }), { count: 1 });
    expect(await resolveMcpOrganization(new Request("http://localhost/api/mcp"))).toBeNull();
  });

  it("returns null when the session cannot be resolved — the tools then refuse", async () => {
    session.mockRejectedValue(new Error("no session"));
    const { resolveMcpOrganization } = await import("./auth");
    expect(await resolveMcpOrganization(new Request("http://localhost/api/mcp"))).toBeNull();
  });
});
