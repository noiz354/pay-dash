// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { createBatch } from "@/server/data/payouts";
import { registerDomainTools } from "./domain-tools";

/**
 * Wave 7B Q1 (U-16, MCP surface) — payout tools are tenant-bound.
 *
 * `list_payout_batches`, `get_payout_batch` and `get_payouts_overview` run
 * tenant-free today: any holder of the single MCP bearer token reads every
 * merchant's money-out book. These tests pin the fail-closed fix: the tools
 * run against the request's tenant only, and refuse without one.
 *
 * RED on main: payout tools ignore the bound organization.
 */

const session = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/session-org-context", () => ({
  resolveSessionOrgContext: session,
  requireStrictOrgContext: session,
}));

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

async function seed() {
  const a = await createBatch(
    parseOrganizationContext({ organizationId: ORG_A }),
    {
      name: "Alpha MCP batch",
      recipients: [
        { line: 1, name: "Alpha Supplier", bank: "BCA", accountNumber: "1111111111", amount: 1_000_000, reference: "MCP-A-1" },
      ],
    },
    { createdBy: "user_a" },
  );
  const b = await createBatch(
    parseOrganizationContext({ organizationId: ORG_B }),
    {
      name: "Beta MCP batch",
      recipients: [
        { line: 1, name: "Beta Supplier", bank: "Mandiri", accountNumber: "2222222222", amount: 2_000_000, reference: "MCP-B-1" },
      ],
    },
    { createdBy: "user_b" },
  );
  return { a, b };
}

beforeEach(() => {
  (globalThis as unknown as { __kineticPayoutStore?: unknown }).__kineticPayoutStore = undefined;
  session.mockReset();
  delete process.env.AUTH_ENFORCED;
});

describe("MCP payout tools are tenant-bound", () => {
  it("list_payout_batches returns only the bound tenant's batches", async () => {
    await seed();
    const handle = capture();
    registerDomainTools(handle.server as never, parseOrganizationContext({ organizationId: ORG_A }));

    const text = await call(handle, "list_payout_batches", { pageSize: 100 });
    expect(text).toContain("Alpha MCP batch");
    expect(text).not.toContain("Beta MCP batch");
    expect(text).not.toContain("Beta Supplier");
  });

  it("get_payout_batch of a foreign id is not found, not forbidden", async () => {
    const { b } = await seed();
    const handle = capture();
    registerDomainTools(handle.server as never, parseOrganizationContext({ organizationId: ORG_A }));

    const text = await call(handle, "get_payout_batch", { id: b.id });
    expect(text).toMatch(/not found|payout_not_found|null/i);
    expect(text).not.toContain("Beta Supplier");
  });

  it("get_payouts_overview reflects only the bound tenant's book", async () => {
    await seed();
    const handle = capture();
    registerDomainTools(handle.server as never, parseOrganizationContext({ organizationId: ORG_A }));

    const text = await call(handle, "get_payouts_overview", {});
    expect(text).not.toContain("Beta MCP batch");
    // A's book holds 1M pending, never B's 2M.
    expect(text).toMatch(/1_?000_?000|1000000/);
  });

  it("without a tenant the payout tools refuse instead of defaulting", async () => {
    await seed();
    const handle = capture();
    registerDomainTools(handle.server as never, null);

    for (const [name, input] of [
      ["list_payout_batches", {}],
      ["get_payout_batch", { id: "BATCH-2026-08-014" }],
      ["get_payouts_overview", {}],
    ] as const) {
      const text = await call(handle, name, input);
      expect(text, name).toMatch(/organization|tenant/i);
      expect(text, name).not.toContain("Beta Supplier");
    }
  });
});
