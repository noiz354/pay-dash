// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrganizationContextError, parseOrganizationContext } from "@/domain/tenancy/organization-context";
import {
  requireTransactionOrganizationContext,
  resolveTransactionOrganizationContext,
  transactionAccessDeniedState,
} from "./transaction-organization-context";
import { seedDemoLedgerForOrganization } from "@/server/data/transactions";
import { TenantIsolationError } from "@/domain/security/tenant";

/**
 * Wave 7A — the session → context seam (spec §2 C-3/C-4, §4).
 *
 * This is the only place a transaction surface is allowed to learn which tenant
 * it is talking about, so it is where "a browser cannot choose its own tenant"
 * and "no demo fallback in production" are proven.
 */

type FakeSession = { organizationId: string; roles: string[]; userId: string | null; isDemoFallback: boolean };

const session = vi.hoisted(() => vi.fn<() => Promise<FakeSession>>());
const strict = vi.hoisted(() => vi.fn<() => Promise<FakeSession>>());

vi.mock("@/server/services/session-org-context", () => ({
  resolveSessionOrgContext: session,
  requireStrictOrgContext: strict,
}));

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const DEMO = "org_demo";

const baseSession: FakeSession = { organizationId: ORG_A, roles: ["OWNER"], userId: "user_a", isDemoFallback: false };

function asSession(over: Partial<FakeSession> = {}) {
  const value = { ...baseSession, ...over };
  session.mockResolvedValue(value);
  strict.mockResolvedValue(value);
}

beforeEach(() => {
  (globalThis as unknown as { __kineticTxStore?: unknown }).__kineticTxStore = undefined;
  session.mockReset();
  strict.mockReset();
  asSession();
  delete process.env.AUTH_ENFORCED;
});

describe("resolveTransactionOrganizationContext (reads)", () => {
  it("returns the session's tenant, never the one named by the request", async () => {
    const resolved = await resolveTransactionOrganizationContext({ organizationId: ORG_B });
    expect(resolved.context).toEqual({ organizationId: ORG_A });
    // The attempt is reported so it can be audited — it is not silently honoured.
    expect(resolved.overridden).toBe(true);
    expect(resolved.actorId).toBe("user_a");
  });

  it("an absent or matching request org is not an override", async () => {
    expect((await resolveTransactionOrganizationContext()).overridden).toBe(false);
    expect((await resolveTransactionOrganizationContext({ organizationId: ORG_A })).overridden).toBe(false);
    expect((await resolveTransactionOrganizationContext({ organizationId: "   " })).overridden).toBe(false);
  });

  it("allows the demo tenant while the deployment is genuinely single-tenant", async () => {
    asSession({ organizationId: DEMO, isDemoFallback: true, userId: null });
    const resolved = await resolveTransactionOrganizationContext();
    expect(resolved.context.organizationId).toBe(DEMO);
    expect(resolved.demoFallback).toBe(true);
  });

  it("refuses the demo tenant as soon as the store holds more than one", async () => {
    asSession({ organizationId: DEMO, isDemoFallback: true, userId: null });
    seedDemoLedgerForOrganization(parseOrganizationContext({ organizationId: ORG_A }), { count: 1 });

    await expect(resolveTransactionOrganizationContext()).rejects.toThrow(/multi-tenant|more than one tenant/i);
    expect(session).toHaveBeenCalled();
  });

  it("fails closed when the session cannot be resolved at all", async () => {
    session.mockRejectedValue(new Error("no db"));
    await expect(resolveTransactionOrganizationContext()).rejects.toThrow(/organization/i);
  });
});

describe("requireTransactionOrganizationContext (writes, exports)", () => {
  it("returns the strict session's tenant and keeps the permission check", async () => {
    const access = await requireTransactionOrganizationContext("refund.prepare");
    expect(access.context).toEqual({ organizationId: ORG_A });
    // The permission is asserted by the strict resolver, in the same call that
    // produced the tenant — there is no "authorize later" path left to forget.
    expect(strict).toHaveBeenCalledWith("refund.prepare", { organizationId: undefined });
  });

  it("propagates the auth denial untouched so the caller can map it", async () => {
    const { OrgContextError } = await import("./org-context");
    strict.mockRejectedValue(new OrgContextError("FORBIDDEN", "Authentication required for refund.prepare"));
    await expect(requireTransactionOrganizationContext("refund.prepare")).rejects.toThrow(OrgContextError);
  });

  it("a blank resolved id is a hard failure, not a fallback", async () => {
    strict.mockResolvedValue({ organizationId: "", roles: ["OWNER"], userId: "u", isDemoFallback: false });
    await expect(requireTransactionOrganizationContext("transaction.read")).rejects.toThrow(OrganizationContextError);
  });
});

describe("transactionAccessDeniedState — the anti-enumeration mapping", () => {
  it("maps a cross-tenant write to the same answer as a missing resource", () => {
    const crossTenant = transactionAccessDeniedState(
      new TenantIsolationError("CROSS_TENANT_WRITE", { surface: "transactions.refund.request", actorOrg: ORG_A, requestedOrg: ORG_B }, "Refusing a cross-tenant write"),
    );
    const missing = transactionAccessDeniedState(new Error("Transaction not found."));
    expect(crossTenant).toEqual(missing);
    expect(crossTenant).toEqual({ status: "error", message: "Transaction not found." });
  });

  it("does not swallow permission failures behind a not-found", () => {
    const forbidden = transactionAccessDeniedState(new Error("You don't have permission to request refunds."));
    expect(forbidden.message).toContain("permission");
  });

  it("a missing context is reported as a context problem, loudly", () => {
    const e = transactionAccessDeniedState(new OrganizationContextError("MISSING_ORGANIZATION_CONTEXT", "nope"));
    expect(e.message).toMatch(/organization context/i);
  });
});
