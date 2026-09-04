// @vitest-environment node
import { describe, expect, it } from "vitest";

import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { InMemoryOrgContextDb, OrgContextError, authorizeOrgContext, buildOrgContext, canOrgContext, demoOrgContext } from "./org-context";

describe("org-context plumbing (multi-tenant authz)", () => {
  it("authorizes an OWNER role for a financial permission", () => {
    const ctx = buildOrgContext([{ userId: "u1", organizationId: "org-1", roles: ["OWNER"] }], "u1", "org-1");
    expect(() => authorizeOrgContext(ctx, "payout.release")).not.toThrow();
    expect(canOrgContext(ctx, "customer.read")).toBe(true);
  });

  it("denies a DEVELOPER role for a live money permission", () => {
    const ctx = buildOrgContext([{ userId: "u1", organizationId: "org-1", roles: ["DEVELOPER"] }], "u1", "org-1");
    expect(() => authorizeOrgContext(ctx, "provider.connect.live")).toThrow(OrgContextError);
  });

  it("picks the requested org from a user with multiple memberships", () => {
    const ctx = buildOrgContext(
      [
        { userId: "u1", organizationId: "org-1", roles: ["ANALYST"] },
        { userId: "u1", organizationId: "org-2", roles: ["FINANCE_ADMIN"] },
      ],
      "u1",
      "org-2",
    );
    expect(ctx.organizationId).toBe("org-2");
    expect(ctx.roles).toEqual(["FINANCE_ADMIN"]);
  });

  it("denies cross-org access when the user is not a member of the requested org", () => {
    const ctxFn = () =>
      buildOrgContext([{ userId: "u1", organizationId: "org-1", roles: ["OWNER"] }], "u1", "org-2");
    expect(ctxFn).toThrow(OrgContextError);
  });

  it("falls back to the demo org/OWNER when no membership resolves", () => {
    const ctx = buildOrgContext([], "u1");
    expect(ctx.isDemoFallback).toBe(true);
    expect(ctx.organizationId).toBe(DEFAULT_DEMO_ORG);
    expect(ctx.roles).toEqual(["OWNER"]);
  });

  it("resolves membership from the in-memory store", async () => {
    const db = new InMemoryOrgContextDb();
    db.seed({ userId: "u1", organizationId: "org-1", roles: ["RISK_ANALYST"] });
    const membership = await db.resolveMembership("org-1", "u1");
    expect(membership?.roles).toEqual(["RISK_ANALYST"]);
    const memberships = await db.resolveMemberships("u1");
    expect(memberships).toHaveLength(1);
  });

  it("demoOrgContext is never used for a real multi-tenant grant", () => {
    const ctx = demoOrgContext();
    expect(ctx.isDemoFallback).toBe(true);
    expect(ctx.userId).toBeNull();
  });
});
