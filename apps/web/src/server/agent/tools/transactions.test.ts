import { describe, expect, it } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { seedDemoLedgerForOrganization } from "@/server/data/transactions";
import { buildAgentContext } from "../context";
import { buildTransactionTools } from "./transactions";
import type { ToolResultContract } from "../types";

type Invokeable = { invoke(input: unknown): Promise<ToolResultContract> };

describe("transaction list tool adapter (cross-tenant safety)", () => {
  it("status filter returns only the caller tenant's rows", async () => {
    const ctxA = parseOrganizationContext({ organizationId: "agent_list_a" });
    const ctxB = parseOrganizationContext({ organizationId: "agent_list_b" });

    seedDemoLedgerForOrganization(ctxA, {
      rows: [
        { id: "txn_list_a_ok1", amount: 1_000, status: "SUCCEEDED" },
        { id: "txn_list_a_ok2", amount: 2_000, status: "SUCCEEDED" },
        { id: "txn_list_a_fail", amount: 3_000, status: "FAILED" },
      ],
      mode: "replace",
    });
    seedDemoLedgerForOrganization(ctxB, {
      rows: [{ id: "txn_list_b_fail", amount: 9_999, status: "FAILED" }],
      mode: "replace",
    });

    const [listTool] = buildTransactionTools(buildAgentContext({ organizationId: "agent_list_a" }));

    const failed = await (listTool as unknown as Invokeable).invoke({ status: "FAILED" });
    expect(failed.status).toBe("ok");
    expect(failed.data?.total).toBe(1);
    expect(failed.data?.rows).toHaveLength(1);
    expect((failed.data?.rows as unknown[])[0]).toMatchObject({ id: "txn_list_a_fail", status: "FAILED" });

    const all = await (listTool as unknown as Invokeable).invoke({});
    expect(all.data?.total).toBe(3);
  });

  it("caps output and never returns B's transaction ids to A", async () => {
    const ctxA = parseOrganizationContext({ organizationId: "agent_list_c" });
    const ctxB = parseOrganizationContext({ organizationId: "agent_list_d" });
    seedDemoLedgerForOrganization(ctxA, {
      rows: [{ id: "txn_list_c_1", amount: 500, status: "FAILED" }],
      mode: "replace",
    });
    seedDemoLedgerForOrganization(ctxB, {
      rows: [{ id: "txn_list_d_1", amount: 500, status: "FAILED" }],
      mode: "replace",
    });

    const [listTool] = buildTransactionTools(buildAgentContext({ organizationId: "agent_list_c" }));
    const failed = await (listTool as unknown as Invokeable).invoke({ status: "FAILED" });
    const ids = (failed.data?.rows as { id: string }[]).map((row) => row.id);
    expect(ids).toContain("txn_list_c_1");
    expect(ids).not.toContain("txn_list_d_1");
  });
});
