import { describe, expect, it } from "vitest";
import { normalizeXenditError, XenditAdapter, type XenditClientLike } from "./xendit";
import type { ProviderConnectionContext, ProviderVerificationContext } from "./registry";

const ctx: ProviderConnectionContext = { organizationId: "org-1", connectionId: "conn-1", provider: "xendit", mode: "TEST" };

const verifyCtx: ProviderVerificationContext = { context: ctx, secretRef: "secret-ref-1" };

const makeAdapter = (opts?: {
  balance?: { balance: number; currency: string };
  failWith?: unknown;
  secretForConnection?: string | null;
}): XenditAdapter => {
  const client: XenditClientLike = {
    Balance: {
      async getBalance() {
        if (opts?.failWith) {
          throw opts.failWith;
        }
        return opts?.balance ?? { balance: 1234567, currency: "IDR" };
      },
    },
  };
  return new XenditAdapter({
    createClient: () => client,
    resolveSecret: async () => "sk_test_dummy",
    resolveSecretForConnection: async () =>
      opts && "secretForConnection" in opts ? (opts.secretForConnection ?? null) : "sk_test_dummy",
  });
};

describe("xendit adapter capabilities", () => {
  it("marks SDK-supported read capabilities configured and manual-HTTP ones unsupported", async () => {
    const manifest = await makeAdapter().getCapabilities(ctx);
    expect(manifest.balanceRead.supported).toBe(true);
    expect(manifest.balanceRead.configured).toBe(true);
    expect(manifest.balanceRead.available).toBe(true);
    expect(manifest.hostedPaymentLinks.supported).toBe(true);
    expect(manifest.hostedPaymentLinks.available).toBe(false);
    expect(manifest.recurringBilling.supported).toBe(false);
    expect(manifest.connectedAccounts.supported).toBe(false);
    expect(manifest.internalTransfers.supported).toBe(false);
    expect(manifest.splitRouting.supported).toBe(false);
    expect(manifest.webhookHealth.configured).toBe(false);
  });
});

describe("xendit adapter verifyConnection", () => {
  it("verifies a connection with a valid read probe", async () => {
    const v = await makeAdapter().verifyConnection(verifyCtx);
    expect(v.verified).toBe(true);
    expect(v.state).toBe("ACTIVE");
    expect(v.permissionsVerified).toBe(true);
    expect(v.mode).toBe("TEST");
  });

  it("fails closed on an upstream/auth error", async () => {
    const v = await makeAdapter({ failWith: { status: 401, message: "Invalid API key" } }).verifyConnection(verifyCtx);
    expect(v.verified).toBe(false);
    expect(v.state).toBe("FAILED");
    expect(v.requirements).toEqual([]);
  });

  it("flags ACTION_REQUIRED on an invalid response", async () => {
    const v = await makeAdapter({ balance: { balance: Number.NaN, currency: "IDR" } }).verifyConnection(verifyCtx);
    expect(v.verified).toBe(false);
    expect(v.state).toBe("ACTION_REQUIRED");
  });
});

describe("xendit adapter getBalance", () => {
  it("returns a normalized current balance", async () => {
    const result = await makeAdapter().getBalance(ctx);
    expect(result).toEqual({ available: 1234567, currency: "IDR", source: "xendit-live", asOf: expect.any(String) });
  });

  it("throws a safe error when no secret is configured for the connection", async () => {
    const adapter = makeAdapter({ secretForConnection: null });
    await expect(adapter.getBalance(ctx)).rejects.toThrow(/No secret configured/);
  });
});

describe("xendit error normalization", () => {
  it("maps auth errors as non-retryable", () => {
    const err = normalizeXenditError({ status: 401 }, "xendit.read");
    expect(err).toMatchObject({ provider: "xendit", code: "UNAUTHORIZED", retryable: false, category: "auth", status: 401 });
  });

  it("maps rate limit and 5xx as retryable", () => {
    expect(normalizeXenditError({ status: 429 }, "x").retryable).toBe(true);
    expect(normalizeXenditError({ status: 503 }, "x")).toMatchObject({ code: "UNAVAILABLE", retryable: true });
  });

  it("maps 404 and unknown safely", () => {
    expect(normalizeXenditError({ status: 404 }, "x").code).toBe("NOT_FOUND");
    expect(normalizeXenditError({}, "x")).toMatchObject({ code: "UNKNOWN", retryable: false });
  });

  it("never leaks the secret in the message", () => {
    const err = normalizeXenditError({ message: "401 sk_test_dummy_secret" }, "xendit.read");
    expect(err.message).not.toContain("sk_test_dummy_secret");
  });
});
