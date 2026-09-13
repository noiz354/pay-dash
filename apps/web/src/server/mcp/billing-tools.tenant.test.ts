// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { seedDemoLedgerForOrganization } from "@/server/data/transactions";
import { createSubscription } from "@/server/data/subscriptions";
import { registerDomainTools } from "@/server/mcp/domain-tools";

/**
 * Wave 7D Q1 (MCP surface) — the billing tools are tenant-bound.
 *
 * `list_invoices`, `get_invoice` and `list_subscriptions` run tenant-free today:
 * any holder of the single MCP bearer token reads every merchant's billing book
 * (spec P-7). These tests pin the fail-closed fix — the tools run against the
 * request's tenant only, and refuse without one — mirroring the 7C customer-tool
 * harness exactly (same `registerDomainTools(server, organization)` seam, no
 * change to `mcp/auth.ts`).
 *
 * One harness deviation, recorded honestly: `@/server/mcp/pg-stores` is mocked.
 * That module imports `@prisma/client`, whose engine binaries cannot be fetched
 * in this sandbox (`binaries.prisma.sh` is TLS-blocked), so the 7C equivalent
 * (`customer-tools.tenant.test.ts`) does not even collect here. Mocking the
 * Postgres seam — which only serves `dataSource=postgres`, a path these tests do
 * not exercise — lets the memory-path assertions below run for real instead of
 * being reported as BLOCKED_BY_ENVIRONMENT.
 *
 * RED on `af18cc4`: the billing tools ignore the bound organization.
 */

vi.mock("@/server/mcp/pg-stores", () => ({
  getBalanceOverviewPostgres: () => Promise.resolve({ error: "pg seam mocked in the 7D harness" }),
}));

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
const ctxA = parseOrganizationContext({ organizationId: ORG_A });
const ctxB = parseOrganizationContext({ organizationId: ORG_B });
const MEMORY = { dataSource: "memory" as const };

async function call(handle: ReturnType<typeof capture>, name: string, input: Record<string, unknown> = {}) {
  const handler = handle.tools.get(name);
  expect(handler, `tool ${name} must be registered`).toBeTruthy();
  return payload(await handler!({ ...MEMORY, ...input }));
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

async function seed() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticInvoiceStore;
  delete g.__kineticSubscriptionStore;
  delete g.__kineticTxStore;

  seedDemoLedgerForOrganization(ctxA, { mode: "replace", rows: [row("txn_a_jan", "2026-01-15T10:00:00.000Z", 1_000_000, 29_000)] });
  seedDemoLedgerForOrganization(ctxB, { mode: "replace", rows: [row("txn_b_feb", "2026-02-15T10:00:00.000Z", 2_000_000, 58_000)] });

  const subA = await createSubscription(ctxA, {
    customerName: "Alpha MCP Subscriber",
    customerEmail: "mcp-sub@alpha.example",
    planName: "Growth",
    interval: "monthly",
    amount: 15_000_000,
  });
  await createSubscription(ctxB, {
    customerName: "Beta MCP Subscriber",
    customerEmail: "mcp-sub@beta.example",
    planName: "Growth",
    interval: "monthly",
    amount: 15_000_999,
  });
  return { subA };
}

beforeEach(() => {
  session.mockReset();
});

describe("MCP billing tools are tenant-bound", () => {
  it("list_invoices returns only the bound tenant's periods", async () => {
    await seed();
    const handle = capture();
    registerDomainTools(handle.server as never, ctxA);

    const text = await call(handle, "list_invoices", { pageSize: 100 });
    expect(text).toContain("INV-2026-01-LEDGER");
    expect(text).not.toContain("INV-2026-02-LEDGER");
    expect(text).not.toContain("58000");
  });

  it("get_invoice of a foreign period is not found, not forbidden", async () => {
    await seed();
    const handle = capture();
    registerDomainTools(handle.server as never, ctxA);

    const foreign = await call(handle, "get_invoice", { id: "INV-2026-02-LEDGER" });
    expect(foreign).toMatch(/not found|null/i);
    expect(foreign).not.toContain("58000");

    const own = await call(handle, "get_invoice", { id: "INV-2026-01-LEDGER" });
    expect(own).toContain("INV-2026-01-LEDGER");
    expect(own).toContain("29000");
  });

  it("list_subscriptions returns only the bound tenant's plans", async () => {
    await seed();
    const handle = capture();
    registerDomainTools(handle.server as never, ctxA);

    const text = await call(handle, "list_subscriptions", { pageSize: 100 });
    expect(text).toContain("mcp-sub@alpha.example");
    expect(text).not.toContain("mcp-sub@beta.example");
    // The demo tenant's prototype plans are not A's either.
    expect(text).not.toContain("finance@initech.eu");
  });

  it("without a tenant the billing tools refuse instead of defaulting", async () => {
    await seed();
    const handle = capture();
    registerDomainTools(handle.server as never, null);

    for (const [name, input] of [
      ["list_invoices", {}],
      ["get_invoice", { id: "INV-2026-01-LEDGER" }],
      ["list_subscriptions", {}],
    ] as const) {
      const text = await call(handle, name, input);
      // Pinned to the refusal itself, not to a word that a *successful* payload
      // could also contain: billing rows now carry an `organizationId` column,
      // so a loose /organization|tenant/i passes even when the tool answered
      // with the demo tenant's data (Q6 mutation M4 survived exactly that).
      expect(text, name).toContain("not bound to an organization");
      // And nothing billable at all — no id, no amount, no plan, no counterparty,
      // from any tenant including the demo one.
      expect(text, name).not.toContain("INV-");
      expect(text, name).not.toContain("sub_");
      expect(text, name).not.toMatch(/"amount"|"processedVolume"|"customerEmail"/);
      expect(text, name).not.toContain("mcp-sub@alpha.example");
    }
  });

  it("a malformed tenant does not degrade into 'no tenant, read everything'", async () => {
    await seed();
    const handle = capture();
    registerDomainTools(handle.server as never, { organizationId: "   " } as never);

    const text = await call(handle, "list_invoices", {});
    expect(text).toContain("not bound to an organization");
    expect(text).not.toContain("INV-");
    expect(text).not.toMatch(/"amount"|"processedVolume"/);
  });
});
