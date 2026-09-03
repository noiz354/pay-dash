import { describe, expect, it } from "vitest";
import { assertSplitAllocation, assertSplitRouteTopology, assertSplitVersionMutable } from "./split-rule-identities";

describe("split-rule identity", () => {
  it("accepts exactly typed flat and percentage allocations", () => {
    expect(() => assertSplitAllocation({ type: "FLAT", money: { amount: "10000", currency: "IDR" } })).not.toThrow();
    expect(() => assertSplitAllocation({ type: "PERCENT", percent: "25.5" })).not.toThrow();
    expect(() => assertSplitAllocation({ type: "PERCENT", percent: "0" })).toThrow(/greater than 0/);
    expect(() => assertSplitAllocation({ type: "PERCENT", percent: "100.1" })).toThrow(/at most 100/);
  });

  it("requires routes and materialization to share provider topology", () => {
    const materialization = { organizationId: "org", connectionId: "conn" };
    expect(() => assertSplitRouteTopology(materialization, { ...materialization, destinationProviderAccountId: "account" })).not.toThrow();
    expect(() => assertSplitRouteTopology(materialization, { organizationId: "org", connectionId: "other", destinationProviderAccountId: "account" })).toThrow(/share organization/);
  });

  it.each(["APPROVED", "ACTIVE", "RETIRED"])("makes %s versions immutable", (status) => {
    expect(() => assertSplitVersionMutable(status)).toThrow(/immutable/);
  });

  it("allows draft versions to be edited", () => {
    expect(() => assertSplitVersionMutable("DRAFT")).not.toThrow();
  });
});
