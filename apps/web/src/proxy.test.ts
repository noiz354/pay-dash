// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { authMode, shouldEnforceAuth } from "./proxy";
import { NextRequest } from "next/server";

// BE-001: proxy fail-closed — test authMode parsing and shouldEnforce
describe("proxy auth fail-closed (BE-001)", () => {
  const original = process.env.AUTH_ENFORCED;
  afterEach(() => {
    if (original === undefined) delete (process.env as any).AUTH_ENFORCED;
    else process.env.AUTH_ENFORCED = original;
  });

  it("defaults to strict when env not set", () => {
    delete (process.env as any).AUTH_ENFORCED;
    expect(authMode()).toBe("strict");
  });

  it("treats legacy '1' as strict", () => {
    process.env.AUTH_ENFORCED = "1";
    expect(authMode()).toBe("strict");
  });

  it("treats 'off'/'0'/'false' as off", () => {
    for (const v of ["off", "0", "false"] as const) {
      process.env.AUTH_ENFORCED = v;
      expect(authMode()).toBe("off");
    }
  });

  it("treats 'preview' as preview", () => {
    process.env.AUTH_ENFORCED = "preview";
    expect(authMode()).toBe("preview");
  });

  it("enforces in strict without bypass", () => {
    process.env.AUTH_ENFORCED = "strict";
    const req = new NextRequest("http://localhost/en/dashboard");
    expect(shouldEnforceAuth(req)).toBe(true);
  });

  it("does not enforce when off", () => {
    process.env.AUTH_ENFORCED = "off";
    const req = new NextRequest("http://localhost/en/dashboard");
    expect(shouldEnforceAuth(req)).toBe(false);
  });

  it("does not enforce in preview with x-preview-bypass header", () => {
    process.env.AUTH_ENFORCED = "preview";
    const req = new NextRequest("http://localhost/en/dashboard", {
      headers: { "x-preview-bypass": "1" },
    });
    expect(shouldEnforceAuth(req)).toBe(false);
  });

  it("enforces in preview without bypass", () => {
    process.env.AUTH_ENFORCED = "preview";
    const req = new NextRequest("http://localhost/en/dashboard");
    expect(shouldEnforceAuth(req)).toBe(true);
  });
});
