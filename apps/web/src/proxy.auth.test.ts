// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Regression guard for audit finding S-01 — the edge gate authenticated requests
 * by cookie *name*, not by session.
 *
 * The gate was:
 *
 *     request.cookies.has("better-auth.session_token")
 *
 * so a request carrying `better-auth.session_token=GARBAGE_NOT_A_REAL_TOKEN`
 * passed, the server-side `getSession()` returned null, and the resolver handed
 * back OWNER of `org_demo`. Confirmed at runtime: HTTP 200 plus the full seeded
 * ledger on /dashboard, /transactions, /customers, /audit, /team,
 * /settings/api-keys, /balance, /payouts, /billing, /webhooks, /system,
 * /onboarding and /kyc, and Server Action bodies in `actions/team.ts` executing.
 *
 * The gate now verifies the Better Auth cookie cache — an HMAC-SHA256 signature
 * over `{...session, expiresAt}`, checked with Web Crypto and no database round
 * trip, so it can run on the edge.
 */

const getCookieCache = vi.hoisted(() => vi.fn());

vi.mock("better-auth/cookies", () => ({ getCookieCache }));

const VERIFIED_PAYLOAD = {
  session: { id: "sess_real", userId: "user_real", expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
  user: { id: "user_real", email: "owner@merchant.test" },
};

/** A request carrying a cookie that is present but not a valid session. */
function forgedRequest(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: "better-auth.session_token=GARBAGE_NOT_A_REAL_TOKEN" },
  });
}

function anonymousRequest(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

function realRequest(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: "better-auth.session_token=opaque_real; better-auth.session_data=signed_real" },
  });
}

async function loadProxy() {
  return (await import("./proxy")).default;
}

const ENV_KEYS = ["APP_ENV", "NODE_ENV", "AUTH_ENFORCED", "PAYDASH_ENABLE_DEMO_ORG", "BETTER_AUTH_SECRET"] as const;
// `process.env.NODE_ENV` is typed read-only in recent @types/node, so the
// save/restore pair goes through a plain string record.
const procEnv = process.env as Record<string, string | undefined>;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = procEnv[k];
  getCookieCache.mockReset();
  // The verifier needs a secret to check the HMAC against; without one it
  // refuses rather than falling open.
  process.env.BETTER_AUTH_SECRET = "test-secret-that-is-at-least-32-characters-long";
  process.env.AUTH_ENFORCED = "strict";
  process.env.APP_ENV = "production";
  delete process.env.PAYDASH_ENABLE_DEMO_ORG;
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete procEnv[k];
    else procEnv[k] = saved[k];
  }
});

describe("edge gate — production, AUTH_ENFORCED=strict", () => {
  it("redirects a forged session cookie away from an app route", async () => {
    getCookieCache.mockResolvedValue(null); // HMAC does not verify
    const proxy = await loadProxy();

    const res = await proxy(forgedRequest("/dashboard"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/sign-in");
  });

  it("redirects an anonymous request away from an app route", async () => {
    const proxy = await loadProxy();

    const res = await proxy(anonymousRequest("/transactions"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/sign-in");
  });

  it("401s a forged session cookie on a protected API route", async () => {
    getCookieCache.mockResolvedValue(null);
    const proxy = await loadProxy();

    const res = await proxy(forgedRequest("/api/exports/transactions"));

    expect(res.status).toBe(401);
  });

  it("lets a verified session through to the app route", async () => {
    getCookieCache.mockResolvedValue(VERIFIED_PAYLOAD);
    const proxy = await loadProxy();

    const res = await proxy(realRequest("/dashboard"));

    expect(res.headers.get("location") ?? "").not.toContain("/sign-in");
    expect(getCookieCache).toHaveBeenCalled();
  });

  it("lets a verified session through to a protected API route", async () => {
    getCookieCache.mockResolvedValue(VERIFIED_PAYLOAD);
    const proxy = await loadProxy();

    const res = await proxy(realRequest("/api/exports/transactions"));

    expect(res.status).not.toBe(401);
  });

  it("refuses rather than falls open when no signing secret is configured", async () => {
    delete process.env.BETTER_AUTH_SECRET;
    vi.resetModules();
    const proxy = await loadProxy();

    const res = await proxy(realRequest("/dashboard"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/sign-in");
    expect(getCookieCache).not.toHaveBeenCalled();
  });

  it("treats a throwing verifier as unauthenticated, not as a server error", async () => {
    getCookieCache.mockRejectedValue(new Error("malformed cookie"));
    const proxy = await loadProxy();

    const res = await proxy(forgedRequest("/dashboard"));

    expect(res.status).toBe(307);
  });

  it("never gates the liveness and readiness probes", async () => {
    getCookieCache.mockResolvedValue(null);
    const proxy = await loadProxy();

    for (const path of ["/api/health", "/api/ready"]) {
      const res = await proxy(anonymousRequest(path));
      expect(res.status).not.toBe(401);
    }
  });
});

describe("edge gate — public allowlist is prefix-matched, not substring-matched", () => {
  it("does not treat a route that merely contains a public segment as public", async () => {
    getCookieCache.mockResolvedValue(null);
    const proxy = await loadProxy();

    // Under `pathname.includes(p)` these were public: "/settings/static"
    // contains "/static", "/transactions/sign-in" contains "/sign-in".
    for (const path of ["/settings/static", "/transactions/sign-in"]) {
      const res = await proxy(forgedRequest(path));
      expect(res.headers.get("location") ?? "").toContain("/sign-in");
    }
  });

  it("still treats the real sign-in and sign-up routes as public", async () => {
    getCookieCache.mockResolvedValue(null);
    const proxy = await loadProxy();

    for (const path of ["/sign-in", "/sign-up"]) {
      const res = await proxy(anonymousRequest(path));
      expect(res.headers.get("location") ?? "").not.toContain("/sign-in?redirect");
    }
  });
});

describe("edge gate — AUTH_ENFORCED=off (local dev, Playwright)", () => {
  beforeEach(() => {
    process.env.AUTH_ENFORCED = "off";
  });

  it("does not enforce, so the demo dataset stays reachable without a session", async () => {
    const proxy = await loadProxy();

    const res = await proxy(anonymousRequest("/dashboard"));

    expect(res.headers.get("location") ?? "").not.toContain("/sign-in");
    expect(getCookieCache).not.toHaveBeenCalled();
  });
});

describe("edge gate — PAYDASH_ENABLE_DEMO_ORG=false in development", () => {
  beforeEach(() => {
    delete process.env.APP_ENV;
    process.env.PAYDASH_ENABLE_DEMO_ORG = "false";
  });

  it("enforces the production behaviour so the strict path is testable locally", async () => {
    getCookieCache.mockResolvedValue(null);
    const proxy = await loadProxy();

    const res = await proxy(forgedRequest("/dashboard"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/sign-in");
  });
});

describe("edge gate — PAYDASH_ENABLE_DEMO_ORG=true in production", () => {
  beforeEach(() => {
    process.env.PAYDASH_ENABLE_DEMO_ORG = "true";
  });

  it("is an explicit, documented opt-in to serving the demo org", async () => {
    getCookieCache.mockResolvedValue(null);
    const proxy = await loadProxy();

    const res = await proxy(forgedRequest("/dashboard"));

    expect(res.headers.get("location") ?? "").not.toContain("/sign-in");
  });
});
