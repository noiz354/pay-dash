// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import proxy from "./proxy";

// `proxy` is async: the auth decision now verifies the Better Auth session cookie
// cache, which is an async HMAC check. Next.js supports an async middleware
// default export.

describe("proxy alias redirects (FE-001)", () => {
  it("308 redirects /payouts/bulk → /payouts (bare)", async () => {
    const req = new NextRequest("http://localhost/payouts/bulk");
    const res = (await proxy(req)) as any;
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toContain("/payouts");
  });

  it("308 redirects /en/payouts/bulk → /en/payouts with locale", async () => {
    const req = new NextRequest("http://localhost/en/payouts/bulk");
    const res = (await proxy(req)) as any;
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toContain("/en/payouts");
    // Should not contain /bulk
    expect(res.headers.get("location")).not.toContain("/bulk");
  });

  it("308 redirects /payments/platform → /settings/developer", async () => {
    const req = new NextRequest("http://localhost/payments/platform");
    const res = (await proxy(req)) as any;
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toContain("/settings/developer");
  });

  it("preserves query on alias redirect", async () => {
    const req = new NextRequest("http://localhost/payouts/bulk?foo=1");
    const res = (await proxy(req)) as any;
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toContain("foo=1");
  });

  it("does not redirect canonical /payouts", async () => {
    const req = new NextRequest("http://localhost/payouts");
    const res = (await proxy(req)) as any;
    // Should not be 308 alias redirect — could be rewrite or next, but not 308
    if (res.status === 308) {
      expect(res.headers.get("location")).not.toContain("/payouts");
    }
    expect([200, 307, 308].includes(res.status) || res.status === undefined).toBeTruthy();
    // Specifically not a 308 to /payouts self
    if (res.status === 308) expect(res.headers.get("location")).not.toBe("http://localhost/payouts");
  });

  it("handles prefix alias /payouts/bulk/123 → /payouts/123", async () => {
    const req = new NextRequest("http://localhost/payouts/bulk/123");
    const res = (await proxy(req)) as any;
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toContain("/payouts/123");
  });
});
