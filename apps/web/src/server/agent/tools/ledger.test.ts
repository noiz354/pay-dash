import { describe, expect, it } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { getLedgerMetrics, getTransaction, seedDemoLedgerForOrganization } from "@/server/data/transactions";
import { buildAgentContext } from "../context";
import { buildLedgerTools } from "./ledger";
import type { ToolResultContract } from "../types";

type Invokeable = { invoke(input: unknown): Promise<ToolResultContract> };

describe("ledger tool adapters (cross-tenant safety)", () => {
  it("tenant A cannot read tenant B's transaction through the agent tools", async () => {
    const ctxA = parseOrganizationContext({ organizationId: "agent_org_a" });
    const ctxB = parseOrganizationContext({ organizationId: "agent_org_b" });

    seedDemoLedgerForOrganization(ctxA, {
      rows: [{ id: "txn_a_1", amount: 1_000, status: "SUCCEEDED" }],
      mode: "replace",
    });
    seedDemoLedgerForOrganization(ctxB, {
      rows: [{ id: "txn_b_1", amount: 9_999, status: "SUCCEEDED" }],
      mode: "replace",
    });

    const [metricsTool, transactionTool] = buildLedgerTools(
      buildAgentContext({ organizationId: "agent_org_a", userId: "u_a" }),
    );

    // Scoped read: B's transaction is invisible to A's tool.
    const notFound = await (transactionTool as unknown as Invokeable).invoke({ transactionId: "txn_b_1" });
    expect(notFound.status).toBe("error");
    expect(notFound.error).toBe("NOT_FOUND");

    // Scoped aggregate: metrics only include A's rows (1000, not 9999).
    const metrics = await (metricsTool as unknown as Invokeable).invoke({});
    expect(metrics.status).toBe("ok");
    expect(metrics.data?.totalVolume).toBe(1_000);

    // Same isolation at the domain layer (control).
    expect(await getTransaction(ctxA, "txn_b_1")).toBeNull();
    expect((await getLedgerMetrics(ctxA)).totalVolume).toBe(1_000);
  });

  it("returns evidence-backed summaries for transactions that exist", async () => {
    const ctxA = parseOrganizationContext({ organizationId: "agent_org_c" });
    seedDemoLedgerForOrganization(ctxA, {
      rows: [{ id: "txn_c_1", amount: 2_500, status: "SUCCEEDED", channel: "EWALLET" }],
      mode: "replace",
    });
    const [, transactionTool] = buildLedgerTools(
      buildAgentContext({ organizationId: "agent_org_c", userId: "u_c" }),
    );
    const found = await (transactionTool as unknown as Invokeable).invoke({ transactionId: "txn_c_1" });
    expect(found.status).toBe("ok");
    expect(found.evidenceIds).toEqual(["txn_c_1"]);
    expect(found.summary).toContain("SUCCEEDED");
    expect(found.data).toMatchObject({ id: "txn_c_1", amount: 2_500 });
  });
});
