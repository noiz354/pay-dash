import { describe, expect, it } from "vitest";

import {
  TenantIsolationError,
  assertTenantMatch,
  belongsToScope,
  resolveRequestedScope,
  scopeRecord,
  scopeRecords,
  tenantDenialEvent,
  tenantScope,
} from "./tenant";

const A = tenantScope("org-a");
const rowA = { organizationId: "org-a", id: "1" };
const rowB = { organizationId: "org-b", id: "2" };

describe("tenant scope primitive", () => {
  it("requires a non-empty organization id", () => {
    expect(() => tenantScope("")).toThrowError(TenantIsolationError);
    expect(() => tenantScope("   ")).toThrowError(/non-empty organization id/i);
  });

  it("trims the id so whitespace cannot fork a tenant", () => {
    expect(tenantScope(" org-a ").organizationId).toBe("org-a");
  });

  it("recognises membership", () => {
    expect(belongsToScope(A, rowA)).toBe(true);
    expect(belongsToScope(A, rowB)).toBe(false);
  });

  describe("reads return ∅, never an error (no enumeration oracle)", () => {
    it("filters a list down to the scope", () => {
      expect(scopeRecords(A, [rowA, rowB])).toEqual([rowA]);
    });

    it("returns null for a foreign record", () => {
      expect(scopeRecord(A, rowB)).toBeNull();
    });

    it("returns null for a missing record — indistinguishable from a foreign one", () => {
      expect(scopeRecord(A, null)).toBeNull();
      expect(scopeRecord(A, undefined)).toBeNull();
      // This is the actual security property: the two cases are identical.
      expect(scopeRecord(A, rowB)).toBe(scopeRecord(A, null));
    });

    it("returns the record when it is in scope", () => {
      expect(scopeRecord(A, rowA)).toBe(rowA);
    });

    it("an empty list stays empty rather than falling back to everything", () => {
      expect(scopeRecords(A, [])).toEqual([]);
      expect(scopeRecords(A, [rowB])).toEqual([]);
    });
  });

  describe("writes throw and carry the audit detail", () => {
    it("allows an in-scope write", () => {
      expect(() => assertTenantMatch(A, rowA, "payouts.release")).not.toThrow();
    });

    it("refuses a cross-tenant write", () => {
      expect(() => assertTenantMatch(A, rowB, "payouts.release")).toThrowError(TenantIsolationError);
    });

    it("names the surface, the actor org and the requested org", () => {
      try {
        assertTenantMatch(A, rowB, "payouts.release");
        throw new Error("should have thrown");
      } catch (e) {
        const err = e as TenantIsolationError;
        expect(err.code).toBe("CROSS_TENANT_WRITE");
        expect(err.detail).toEqual({
          surface: "payouts.release",
          actorOrg: "org-a",
          requestedOrg: "org-b",
        });
      }
    });
  });

  describe("browser-supplied organization ids (INV-T2)", () => {
    it("ignores an absent request scope", () => {
      const { scope, overridden } = resolveRequestedScope(A, null);
      expect(scope).toBe(A);
      expect(overridden).toBe(false);
    });

    it("accepts a matching request scope without flagging it", () => {
      expect(resolveRequestedScope(A, "org-a").overridden).toBe(false);
    });

    it("the session always wins over a foreign requested org", () => {
      const { scope, overridden } = resolveRequestedScope(A, "org-b");
      expect(scope.organizationId).toBe("org-a");
      expect(overridden).toBe(true);
    });
  });

  it("builds a denial event suitable for the audit log", () => {
    const at = new Date("2026-09-12T10:00:00.000Z");
    expect(tenantDenialEvent("exports.transactions", A, "org-b", at)).toEqual({
      action: "TENANT_ISOLATION_DENIED",
      surface: "exports.transactions",
      actorOrg: "org-a",
      requestedOrg: "org-b",
      at: "2026-09-12T10:00:00.000Z",
    });
  });
});
