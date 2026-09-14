import { describe, expect, it } from "vitest";

import { assertSafeAgentContext, buildAgentContext } from "./context";

describe("agent context (tenant safety)", () => {
  it("fails closed when no trusted organization id is provided", () => {
    expect(() => buildAgentContext({ organizationId: "" })).toThrow(/organization id/i);
    expect(() => buildAgentContext({ organizationId: undefined })).toThrow(/organization id/i);
  });

  it("builds a context from a trusted organization id (never a default)", () => {
    const ctx = buildAgentContext({ organizationId: "org_a", userId: "u1", roles: ["OWNER"] });
    expect(ctx.organizationId).toBe("org_a");
    expect(ctx.userId).toBe("u1");
    expect(ctx.isDemoFallback).toBe(false);
  });

  it("flags the demo fallback but never substitutes an organization", () => {
    const ctx = buildAgentContext({ organizationId: "demo", isDemoFallback: true });
    expect(ctx.isDemoFallback).toBe(true);
    expect(ctx.organizationId).toBe("demo");
  });

  it("refuses the demo fallback once the store is multi-tenant", () => {
    const ctx = buildAgentContext({ organizationId: "demo", isDemoFallback: true });
    expect(() => assertSafeAgentContext(ctx, 2)).toThrow(/multi-tenant/i);
    expect(() => assertSafeAgentContext(ctx, 1)).not.toThrow();
  });

  it("accepts non-demo contexts regardless of tenant count", () => {
    const ctx = buildAgentContext({ organizationId: "org_a", isDemoFallback: false });
    expect(() => assertSafeAgentContext(ctx, 42)).not.toThrow();
  });
});
