// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { addBlocklist } from "@/server/data/blocklist";
import { createLink } from "@/server/data/links";
import { patchDraft } from "@/server/data/risk";
import { recordInbound } from "@/server/data/webhooks";
import { registerDomainTools } from "@/server/mcp/domain-tools";

/**
 * Wave 7G Q1 (MCP surface) — the ingest tools are tenant-bound (G-9, spec P-8).
 *
 * Five tools run tenant-free at `6c104ab`: `list_links`, `get_risk_overview`,
 * `list_webhooks`, `get_webhook_event` and `list_blocklist` — none carries the
 * `if (!scoped) return textResult(NO_TENANT)` guard that 7D and 7F added to
 * theirs. Any holder of the single shared MCP bearer token can therefore read
 * another merchant's provider callbacks (with raw payloads), payment links,
 * fraud blocklist and risk policy.
 *
 * These tests pin the fail-closed fix, reusing the same
 * `registerDomainTools(server, organization)` seam as 7B/7C/7D/7F — no change to
 * `mcp/auth.ts`.
 *
 * Same harness deviation as the 7D/7F MCP tests, recorded honestly:
 * `@/server/mcp/pg-stores` is mocked because `@prisma/client` engine binaries
 * cannot be fetched in this sandbox, and that seam only serves
 * `dataSource=postgres`, which these tests do not exercise.
 *
 * RED on `6c104ab`: the five ingest tools ignore the bound organization.
 */

vi.mock("@/server/mcp/pg-stores", () => ({
  getBalanceOverviewPostgres: () => Promise.resolve({ error: "pg seam mocked in the 7G harness" }),
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

const INGEST_TOOLS = ["list_links", "get_risk_overview", "list_webhooks", "get_webhook_event", "list_blocklist"];

async function call(handle: ReturnType<typeof capture>, name: string, input: Record<string, unknown> = {}) {
  const handler = handle.tools.get(name);
  expect(handler, `tool ${name} must be registered`).toBeTruthy();
  return payload(await handler!({ ...MEMORY, ...input }));
}

async function twoTenants() {
  recordInbound(ctxA, { eventId: "evt_mcp_alpha", type: "payment.succeeded", source: "xendit", payload: { merchant: "alpha" } });
  recordInbound(ctxB, { eventId: "evt_mcp_beta", type: "payment.succeeded", source: "stripe", payload: { merchant: "beta" } });
  createLink(ctxA, { kind: "single", items: [{ label: "Alpha invoice", amount: 250_000 }], payerEmail: "ap@alpha.test", expiresAt: null });
  createLink(ctxB, { kind: "single", items: [{ label: "Beta invoice", amount: 900_000 }], payerEmail: "ap@beta.test", expiresAt: null });
  await addBlocklist(ctxA, { type: "IP", value: "198.51.100.7", reason: "KNOWN_MALICIOUS" });
  await addBlocklist(ctxB, { type: "IP", value: "203.0.113.99", reason: "CHARGEBACK_ABUSE" });
  patchDraft(ctxA, { dailyVolumeLimit: 1_111 });
  patchDraft(ctxB, { dailyVolumeLimit: 2_222 });
}

beforeEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticWebhooksStore;
  delete g.__kineticLinksStore;
  delete g.__kineticBlocklistStore;
  delete g.__kineticRiskStore;
  delete g.__kineticTxStore;
  session.mockResolvedValue({ organizationId: ORG_A, roles: ["OWNER"], userId: "user_a", isDemoFallback: false });
});

describe("MCP ingest tools are tenant-bound", () => {
  it("list_webhooks answers with the bound tenant's callbacks only", async () => {
    await twoTenants();
    const handle = capture();
    registerDomainTools(handle.server as never, ctxA);

    const text = await call(handle, "list_webhooks", { pageSize: 50 });
    expect(text).toContain("evt_mcp_alpha");
    expect(text).not.toContain("evt_mcp_beta");
    // A provider payload is the sensitive part: no foreign payload content.
    expect(text).not.toContain('"merchant":"beta"');
    expect(text).not.toContain("beta");
  });

  it("get_webhook_event resolves the bound tenant's event and refuses a foreign id", async () => {
    await twoTenants();
    const asA = capture();
    registerDomainTools(asA.server as never, ctxA);
    const listA = await call(asA, "list_webhooks", { pageSize: 50 });
    const idA = /"id"\s*:\s*"(whk_[^"]+)"/.exec(listA)?.[1];
    expect(idA, "A must have an event id to ask for").toBeTruthy();

    expect(await call(asA, "get_webhook_event", { id: idA })).toContain("evt_mcp_alpha");

    const asB = capture();
    registerDomainTools(asB.server as never, ctxB);
    const foreign = await call(asB, "get_webhook_event", { id: idA });
    // Uniform not-found: no event content, no "belongs to another organization".
    expect(foreign).not.toContain("evt_mcp_alpha");
    expect(foreign).not.toContain("alpha");
  });

  it("list_links answers with the bound tenant's links only", async () => {
    await twoTenants();
    const handle = capture();
    registerDomainTools(handle.server as never, ctxA);

    const text = await call(handle, "list_links", { pageSize: 50 });
    expect(text).toContain("ap@alpha.test");
    expect(text).not.toContain("ap@beta.test");
    expect(text).not.toContain("Beta invoice");
  });

  it("list_blocklist answers with the bound tenant's fraud entries only", async () => {
    await twoTenants();
    const handle = capture();
    registerDomainTools(handle.server as never, ctxA);

    const text = await call(handle, "list_blocklist", { pageSize: 50 });
    expect(text).toContain("198.51.100.7");
    expect(text).not.toContain("203.0.113.99");
  });

  it("get_risk_overview is derived from the bound tenant's own policy and ledger", async () => {
    await twoTenants();
    const handle = capture();
    registerDomainTools(handle.server as never, ctxA);

    const text = await call(handle, "get_risk_overview");
    expect(text).toContain("1111");
    expect(text).not.toContain("2222");
  });

  it("without a tenant every ingest tool refuses instead of defaulting", async () => {
    await twoTenants();
    const handle = capture();
    registerDomainTools(handle.server as never, null);

    for (const name of INGEST_TOOLS) {
      const text = await call(handle, name, { id: "whk_anything", pageSize: 50 });
      expect(text, name).toContain("not bound to an organization");
      // Zero payload: the 7D M4 lesson — a loose refusal regex is also satisfied
      // by a successful answer, so the content is asserted absent explicitly.
      expect(text, `${name} must carry no ingest payload`).not.toContain("evt_mcp_alpha");
      expect(text, `${name} must carry no ingest payload`).not.toContain("198.51.100.7");
      expect(text, `${name} must carry no ingest payload`).not.toContain("ap@alpha.test");
      expect(text, `${name} must carry no ingest payload`).not.toContain("1111");
    }
  });

  it("a malformed tenant does not degrade into 'no tenant, read everything'", async () => {
    await twoTenants();
    const handle = capture();
    registerDomainTools(handle.server as never, { organizationId: "   " } as never);

    const text = await call(handle, "list_webhooks", { pageSize: 50 });
    expect(text).toContain("not bound to an organization");
    expect(text).not.toContain("evt_mcp_alpha");
    expect(text).not.toContain("evt_mcp_beta");
  });
});
