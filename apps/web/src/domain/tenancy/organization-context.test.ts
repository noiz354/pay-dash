// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  OrganizationContextError,
  assertSameOrganization,
  organizationOf,
  parseOrganizationContext,
  requireOrganizationContext,
  sameOrganization,
  tenantScopeFor,
} from "./organization-context";
import { TenantIsolationError, belongsToScope, scopeRecord } from "@/domain/security/tenant";

/**
 * Wave 7A — the canonical tenant contract (spec §2, C-1..C-7).
 *
 * These are the rules every scoped module in Wave 7B inherits. They are tested
 * here once, at the primitive, so no slice has to re-litigate what "an
 * organization context" means.
 */

describe("parseOrganizationContext — C-2: no default organization", () => {
  it("accepts a non-empty trimmed id", () => {
    expect(parseOrganizationContext({ organizationId: "org-a" })).toEqual({ organizationId: "org-a" });
    expect(parseOrganizationContext({ organizationId: "  org-a  " }).organizationId).toBe("org-a");
  });

  it("rejects every shape that could silently become 'the demo tenant'", () => {
    for (const bad of [undefined, null, {}, { organizationId: "" }, { organizationId: "   " }, { organizationId: 42 }, { organizationId: null }]) {
      expect(() => parseOrganizationContext(bad), JSON.stringify(bad)).toThrow(OrganizationContextError);
    }
  });

  it("reports the distinguishing codes MISSING vs INVALID", () => {
    try {
      requireOrganizationContext(undefined);
      throw new Error("unreachable");
    } catch (e) {
      expect(e).toBeInstanceOf(OrganizationContextError);
      expect((e as OrganizationContextError).code).toBe("MISSING_ORGANIZATION_CONTEXT");
    }
    try {
      parseOrganizationContext({ organizationId: 7 });
      throw new Error("unreachable");
    } catch (e) {
      expect((e as OrganizationContextError).code).toBe("INVALID_ORGANIZATION_CONTEXT");
    }
  });

  it("strips extra claims: a browser payload cannot smuggle roles through a context", () => {
    const ctx = parseOrganizationContext({ organizationId: "org-a", roles: ["OWNER"], isDemoFallback: false });
    expect(Object.keys(ctx)).toEqual(["organizationId"]);
  });
});

describe("requireOrganizationContext — the boundary guard", () => {
  it("re-validates a context rather than trusting the reference", () => {
    // Returning the *same object* would be a convenience, and a dangerous one: a
    // caller could hold a mutable `{ organizationId }` they later rewrite, and
    // the repository would follow the mutation. Parsing again hands back an
    // independent frozen value, so the scope cannot move after it was resolved.
    const ctx = requireOrganizationContext({ organizationId: "org-a", roles: ["OWNER"] });
    expect(ctx).toEqual({ organizationId: "org-a" });
    expect(Object.isFrozen(ctx)).toBe(true);
    const again = requireOrganizationContext(ctx);
    expect(again).not.toBe(ctx);
    expect(again).toEqual(ctx);
  });

  it("refuses nullish input rather than defaulting", () => {
    expect(() => requireOrganizationContext(null)).toThrow(/requires an explicit/i);
  });
});

describe("ownership predicates", () => {
  const a = parseOrganizationContext({ organizationId: "org-a" });
  const b = parseOrganizationContext({ organizationId: "org-b" });

  it("sameOrganization is exact-string equality", () => {
    expect(sameOrganization(a, { organizationId: "org-a" })).toBe(true);
    expect(sameOrganization(a, b)).toBe(false);
  });

  it("organizationOf reads the owner column", () => {
    expect(organizationOf({ organizationId: "org-b", id: "txn_1" })).toBe("org-b");
  });

  it("assertSameOrganization throws the Wave 6 error so the policy stays single-sourced", () => {
    expect(() => assertSameOrganization(a, { organizationId: "org-b" }, "transactions.retry")).toThrow(TenantIsolationError);
    try {
      assertSameOrganization(a, { organizationId: "org-b" }, "transactions.retry");
    } catch (e) {
      const err = e as TenantIsolationError;
      expect(err.code).toBe("CROSS_TENANT_WRITE");
      expect(err.detail.surface).toBe("transactions.retry");
      expect(err.detail.actorOrg).toBe("org-a");
      expect(err.detail.requestedOrg).toBe("org-b");
    }
    expect(() => assertSameOrganization(a, { organizationId: "org-a" }, "transactions.retry")).not.toThrow();
  });
});

describe("tenantScopeFor — the C-7 bridge", () => {
  it("preserves the id and produces a Wave 6 scope the policy engine accepts", () => {
    const ctx = parseOrganizationContext({ organizationId: "org-a" });
    const scope = tenantScopeFor(ctx);
    expect(scope.organizationId).toBe("org-a");
    expect(belongsToScope(scope, { organizationId: "org-a" })).toBe(true);
    expect(belongsToScope(scope, { organizationId: "org-b" })).toBe(false);
  });

  it("an empty context can never be promoted to a scope", () => {
    expect(() => tenantScopeFor({ organizationId: "" })).toThrow(OrganizationContextError);
  });

  it("a foreign record resolves to null-equivalence through the borrowed primitive", () => {
    const scopeA = tenantScopeFor(parseOrganizationContext({ organizationId: "org-a" }));
    expect(scopeRecord(scopeA, { organizationId: "org-b", id: "txn_secret" })).toBeNull();
  });
});
