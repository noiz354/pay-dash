import { describe, expect, it } from "vitest";
import {
  authorizeRoles,
  hasPermission,
  ORGANIZATION_ROLES,
  parseRoles,
  ROLE_PERMISSIONS,
} from "./roles";

describe("organization roles", () => {
  it("exposes the full organization-scoped role catalog", () => {
    expect(ORGANIZATION_ROLES).toHaveLength(8);
    expect(ORGANIZATION_ROLES).toContain("OWNER");
    expect(ORGANIZATION_ROLES).toContain("FINANCE_ADMIN");
    expect(ORGANIZATION_ROLES).toContain("RISK_ANALYST");
  });

  it("grants only least-privilege permissions", () => {
    expect(hasPermission("ANALYST", "transaction.read")).toBe(true);
    expect(hasPermission("ANALYST", "payout.release")).toBe(false);
    expect(hasPermission("SUPPORT", "refund.prepare")).toBe(true);
    expect(hasPermission("SUPPORT", "refund.execute")).toBe(false);
    expect(hasPermission("DEVELOPER", "provider.connect.test")).toBe(true);
    expect(hasPermission("DEVELOPER", "provider.connect.live")).toBe(false);
  });

  it("grants money-in link creation to operators but not to support/analysts", () => {
    expect(hasPermission("OWNER", "money_in.create")).toBe(true);
    expect(hasPermission("FINANCE_ADMIN", "money_in.create")).toBe(true);
    expect(hasPermission("FINANCE_OPERATOR", "money_in.create")).toBe(true);
    expect(hasPermission("DEVELOPER", "money_in.create")).toBe(true);
    expect(hasPermission("SUPPORT", "money_in.create")).toBe(false);
    expect(hasPermission("ANALYST", "money_in.create")).toBe(false);
    expect(hasPermission("RISK_ANALYST", "money_in.create")).toBe(false);
  });

  it("OWNER can perform every financial operation", () => {
    const owner = ROLE_PERMISSIONS.OWNER;
    expect(owner).toContain("provider.connect.live");
    expect(owner).toContain("payout.release");
    expect(owner).toContain("transfer.execute");
    expect(owner).toContain("split.activate");
  });

  it("authorizes when any held role grants a permission", () => {
    expect(authorizeRoles(["FINANCE_OPERATOR", "ANALYST"], "report.export")).toBe(true);
    expect(authorizeRoles(["FINANCE_OPERATOR"], "payout.release")).toBe(false);
  });

  it("rejects unknown roles and keeps valid roles when parsing", () => {
    expect(parseRoles(["OWNER", "not-a-role", 3])).toEqual(["OWNER"]);
    expect(parseRoles("OWNER")).toEqual([]);
  });

  it("does not let a single assignee render as two approvers", () => {
    // SUPPORT prepares a refund but cannot execute it; approval requires a
    // different actor with refund.execute.
    expect(authorizeRoles(["SUPPORT"], "refund.execute")).toBe(false);
  });
});
