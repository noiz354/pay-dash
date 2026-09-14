// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { inviteMember } from "@/server/data/team";
import { createApiKey, updateMerchantProfile } from "@/server/data/settings";
import { submitKycDocument } from "@/server/data/kyc";
import { registerDomainTools } from "@/server/mcp/domain-tools";

/**
 * Wave 7F Q1 (MCP surface) — the identity tools are tenant-bound (F-12).
 *
 * `list_team_members`, `get_merchant_profile`, `get_settings_overview`,
 * `get_kyc_submission` and `get_onboarding_status` run tenant-free today, so any
 * holder of the single MCP bearer token can read another merchant's roster,
 * legal identity, API-key inventory, KYC document and onboarding state
 * (spec P-8). These tests pin the fail-closed fix — the tools run against the
 * request's tenant only, and refuse without one — reusing the same
 * `registerDomainTools(server, organization)` seam as 7B/7C/7D (no change to
 * `mcp/auth.ts`).
 *
 * Same harness deviation as the 7D billing MCP test, recorded honestly:
 * `@/server/mcp/pg-stores` is mocked because `@prisma/client` engine binaries
 * cannot be fetched in this sandbox, and that seam only serves
 * `dataSource=postgres`, which these tests do not exercise.
 *
 * RED on `f7cb1e2`: the five identity tools ignore the bound organization.
 */

vi.mock("@/server/mcp/pg-stores", () => ({
  getBalanceOverviewPostgres: () => Promise.resolve({ error: "pg seam mocked in the 7F harness" }),
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

const IDENTITY_TOOLS = [
  "list_team_members",
  "get_merchant_profile",
  "get_settings_overview",
  "get_kyc_submission",
  "get_onboarding_status",
] as const;

async function seed() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticTeamStore;
  delete g.__kineticSettingsStore;
  delete g.__kineticKycStore;
  delete g.__kineticTxStore;
  delete g.__kineticPayoutStore;

  await inviteMember(ctxA, { name: "Alpha Owner", email: "mcp-owner@alpha.example", role: "ADMIN" });
  await inviteMember(ctxB, { name: "Beta Owner", email: "mcp-owner@beta.example", role: "ADMIN" });
  await updateMerchantProfile(ctxA, { legalName: "Alpha PT", taxId: "11-2223334" });
  await updateMerchantProfile(ctxB, { legalName: "Beta Pte Ltd", taxId: "SG-77" });
  await createApiKey(ctxA, { name: "MCP Alpha Key", environment: "LIVE", scopes: ["read"] });
  await createApiKey(ctxB, { name: "MCP Beta Secret Key", environment: "LIVE", scopes: ["read", "write", "payouts"] });
  submitKycDocument(ctxA, {
    fileName: "mcp-alpha-incorporation.pdf",
    sizeBytes: 1234,
    docType: "incorporation",
    jurisdiction: "ID",
  });
  submitKycDocument(ctxB, {
    fileName: "mcp-beta-articles.pdf",
    sizeBytes: 4321,
    docType: "articles",
    jurisdiction: "SG",
  });
}

beforeEach(async () => {
  await seed();
  session.mockResolvedValue({ organizationId: ORG_A, roles: ["OWNER"], userId: "user_a", isDemoFallback: false });
});

describe("MCP identity tools are tenant-bound", () => {
  it("list_team_members answers with the bound tenant's roster only", async () => {
    const handle = capture();
    registerDomainTools(handle.server as never, ctxA);

    const text = await call(handle, "list_team_members", { pageSize: 100 });
    expect(text).toContain("mcp-owner@alpha.example");
    expect(text).not.toContain("mcp-owner@beta.example");
    expect(text).not.toContain("Beta Owner");
    // The prototype roster is the demo tenant's.
    expect(text).not.toContain("daniel@acmecorp.com");
  });

  it("get_merchant_profile and get_settings_overview answer for the bound tenant", async () => {
    const handle = capture();
    registerDomainTools(handle.server as never, ctxA);

    const profile = await call(handle, "get_merchant_profile");
    expect(profile).toContain("Alpha PT");
    expect(profile).not.toContain("Beta Pte Ltd");
    expect(profile).not.toContain("SG-77");

    const overview = await call(handle, "get_settings_overview");
    expect(overview).toContain("Alpha PT");
    expect(overview).not.toContain("Beta Pte Ltd");
  });

  it("the key inventory never crosses tenants — not even its metadata", async () => {
    const handle = capture();
    registerDomainTools(handle.server as never, ctxA);

    const overview = await call(handle, "get_settings_overview");
    expect(overview).not.toContain("MCP Beta Secret Key");
    // One live key in A, one in B: a process-wide count would read two.
    expect(overview).toMatch(/1 live key active/);
  });

  it("get_kyc_submission returns the bound tenant's document only", async () => {
    const asA = capture();
    registerDomainTools(asA.server as never, ctxA);
    const textA = await call(asA, "get_kyc_submission");
    expect(textA).toContain("mcp-alpha-incorporation.pdf");
    expect(textA).not.toContain("mcp-beta-articles.pdf");

    const asB = capture();
    registerDomainTools(asB.server as never, ctxB);
    const textB = await call(asB, "get_kyc_submission");
    expect(textB).toContain("mcp-beta-articles.pdf");
    expect(textB).not.toContain("mcp-alpha-incorporation.pdf");
  });

  it("get_onboarding_status is derived from the bound tenant", async () => {
    const handle = capture();
    registerDomainTools(handle.server as never, ctxA);

    const text = await call(handle, "get_onboarding_status");
    expect(text).toContain("Alpha PT");
    expect(text).not.toContain("Beta Pte Ltd");
    expect(text).not.toContain("mcp-beta-articles.pdf");
  });

  it("without a tenant every identity tool refuses instead of defaulting", async () => {
    const handle = capture();
    registerDomainTools(handle.server as never, null);

    for (const name of IDENTITY_TOOLS) {
      const text = await call(handle, name);
      // Pinned to the refusal itself, not to a word a *successful* payload could
      // also contain (the Wave 7D Q6 M4 lesson: rows now carry organizationId).
      expect(text, name).toContain("not bound to an organization");
      // And nothing identity-bearing at all, from any tenant including the demo.
      expect(text, name).not.toContain("mcp-owner@");
      expect(text, name).not.toContain("Alpha PT");
      expect(text, name).not.toContain("Beta Pte Ltd");
      expect(text, name).not.toContain("mcp-alpha-incorporation");
      expect(text, name).not.toMatch(/"maskedSecret"|"taxId"|"legalName"/);
    }
  });

  it("a malformed tenant does not degrade into 'no tenant, read everything'", async () => {
    const handle = capture();
    registerDomainTools(handle.server as never, { organizationId: "   " } as never);

    const text = await call(handle, "list_team_members");
    expect(text).toContain("not bound to an organization");
    expect(text).not.toContain("mcp-owner@alpha.example");
  });
});
