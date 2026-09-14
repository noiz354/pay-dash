// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { UNAUTHENTICATED_ORG } from "@/lib/demo-org-policy";
import {
  InMemoryOrgContextDb,
  OrgContextError,
  PrismaOrgContextDb,
  authorizeOrgContext,
  buildOrgContext,
  canOrgContext,
  demoOrgContext,
  deniedOrgContext,
} from "./org-context";

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

  it("falls back to the demo org/OWNER when no membership resolves (development)", () => {
    // NODE_ENV is "test" here, so the demo fallback is permitted and local
    // development keeps working without a database.
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

/**
 * Audit findings S-01 and §3.5. A signed-in user with no `OrganizationMember`
 * row — which is exactly what the sign-up flow produces, because nothing in it
 * creates one — used to be handed OWNER of `org_demo`. In production that is now
 * a denied context.
 */
describe("org-context in production (demo fallback refused)", () => {
  const ENV_KEYS = ["APP_ENV", "NODE_ENV", "AUTH_ENFORCED", "PAYDASH_ENABLE_DEMO_ORG"] as const;
  // `process.env.NODE_ENV` is typed read-only in recent @types/node, so the
  // save/restore pair goes through a plain string record.
  const procEnv = process.env as Record<string, string | undefined>;
  let saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) saved[k] = procEnv[k];
    process.env.APP_ENV = "production";
    process.env.AUTH_ENFORCED = "strict";
    delete process.env.PAYDASH_ENABLE_DEMO_ORG;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete procEnv[k];
      else procEnv[k] = saved[k];
    }
  });

  it("does not make a memberless user an OWNER of the demo org", () => {
    const ctx = buildOrgContext([], "user_real");

    expect(ctx.roles).toEqual([]);
    expect(ctx.organizationId).toBe(UNAUTHENTICATED_ORG);
    expect(ctx.organizationId).not.toBe(DEFAULT_DEMO_ORG);
    expect(ctx.isDemoFallback).toBe(true);
    expect(ctx.userId).toBe("user_real");
  });

  it("denies every permission in the resulting context", () => {
    const ctx = buildOrgContext([], "user_real");

    expect(() => authorizeOrgContext(ctx, "customer.read")).toThrow(OrgContextError);
    expect(() => authorizeOrgContext(ctx, "payout.release")).toThrow(OrgContextError);
    expect(canOrgContext(ctx, "transaction.read")).toBe(false);
  });

  it("still resolves a real membership normally", () => {
    const ctx = buildOrgContext([{ userId: "u1", organizationId: "org-1", roles: ["FINANCE_ADMIN"] }], "u1");

    expect(ctx.isDemoFallback).toBe(false);
    expect(ctx.organizationId).toBe("org-1");
    expect(ctx.roles).toEqual(["FINANCE_ADMIN"]);
    expect(() => authorizeOrgContext(ctx, "customer.read")).not.toThrow();
  });

  it("deniedOrgContext scopes reads to an org that has no rows", () => {
    const ctx = deniedOrgContext();

    // An empty role list alone would not be enough: the seeded ledger is tagged
    // org_demo, so a context carrying that id would still satisfy the tenant
    // predicate and return the whole demo dataset.
    expect(ctx.organizationId).toBe(UNAUTHENTICATED_ORG);
    expect(ctx.roles).toEqual([]);
    expect(ctx.userId).toBeNull();
    expect(ctx.isDemoFallback).toBe(true);
  });
});

describe("PrismaOrgContextDb role mapping fails closed", () => {
  function dbReturning(row: Record<string, unknown>) {
    return new PrismaOrgContextDb({
      organizationMember: {
        findMany: async () => [row],
        findFirst: async () => row,
      },
    });
  }

  it("maps a recognized role", async () => {
    const db = dbReturning({ userId: "u1", organizationId: "org-1", role: "RISK_ANALYST" });
    const [m] = await db.resolveMemberships("u1");
    expect(m.roles).toEqual(["RISK_ANALYST"]);
  });

  it("maps a comma-separated role list", async () => {
    const db = dbReturning({ userId: "u1", organizationId: "org-1", role: "OWNER, ANALYST" });
    const [m] = await db.resolveMemberships("u1");
    expect(m.roles).toEqual(["OWNER", "ANALYST"]);
  });

  it("does not escalate an unrecognized role to OWNER", async () => {
    // A corrupt or partially-migrated role column used to be read as OWNER,
    // silently granting the highest role in the catalogue.
    const db = dbReturning({ userId: "u1", organizationId: "org-1", role: "SUPERUSER" });
    const [m] = await db.resolveMemberships("u1");
    expect(m.roles).toEqual([]);
  });

  it("does not escalate an empty role to OWNER", async () => {
    const db = dbReturning({ userId: "u1", organizationId: "org-1", role: "" });
    const [m] = await db.resolveMemberships("u1");
    expect(m.roles).toEqual([]);
  });
});
