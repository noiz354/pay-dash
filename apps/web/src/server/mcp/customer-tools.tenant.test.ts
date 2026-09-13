// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { createCustomer } from "@/server/data/customers";
import { registerDomainTools } from "@/server/mcp/domain-tools";

/**
 * Wave 7C Q1 (MCP surface) — customer tools are tenant-bound.
 *
 * `list_customers` and `get_customer` run tenant-free today: any holder of the
 * single MCP bearer token reads every merchant's customer directory. These
 * tests pin the fail-closed fix: the tools run against the request's tenant
 * only, and refuse without one.
 *
 * RED on main: customer tools ignore the bound organization.
 */

const session = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/session-org-context", () => ({
  resolveSessionOrgContext: session,
  requireStrictOrgContext: session,
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
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticCustomerStore;
  delete g.__kineticTxStore;
  const a = await createCustomer(parseOrganizationContext({ organizationId: ORG_A }), {
    name: "Alpha MCP Buyer",
    email: "mcp@alpha.example",
  });
  const b = await createCustomer(parseOrganizationContext({ organizationId: ORG_B }), {
    name: "Beta MCP Buyer",
    email: "mcp@beta.example",
  });
  return { a, b };
}

beforeEach(() => {
  session.mockReset();
});

describe("MCP customer tools are tenant-bound", () => {
  it("list_customers returns only the bound tenant's customers", async () => {
    await seed();
    const handle = capture();
    registerDomainTools(handle.server as never, parseOrganizationContext({ organizationId: ORG_A }));

    const text = await call(handle, "list_customers", { pageSize: 100 });
    expect(text).toContain("mcp@alpha.example");
    expect(text).not.toContain("mcp@beta.example");
  });

  it("get_customer of a foreign id/email is not found, not forbidden", async () => {
    const { b } = await seed();
    const handle = capture();
    registerDomainTools(handle.server as never, parseOrganizationContext({ organizationId: ORG_A }));

    const byId = await call(handle, "get_customer", { idOrEmail: b.id });
    expect(byId).toMatch(/not found|null/i);
    const byEmail = await call(handle, "get_customer", { idOrEmail: "mcp@beta.example" });
    expect(byEmail).toMatch(/not found|null/i);
    expect(byEmail).not.toContain("Beta MCP Buyer");
  });

  it("without a tenant the customer tools refuse instead of defaulting", async () => {
    await seed();
    const handle = capture();
    registerDomainTools(handle.server as never, null);

    for (const [name, input] of [
      ["list_customers", {}],
      ["get_customer", { idOrEmail: "mcp@alpha.example" }],
    ] as const) {
      const text = await call(handle, name, input);
      expect(text, name).toMatch(/organization|tenant/i);
      expect(text, name).not.toContain("mcp@alpha.example");
    }
  });
});
