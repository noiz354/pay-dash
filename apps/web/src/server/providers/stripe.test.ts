import { describe, expect, it } from "vitest";
import { normalizeStripeError, StripeAdapter, type StripeAccountLike, type StripeClientLike } from "./stripe";
import type { ProviderConnectionContext, ProviderVerificationContext } from "./registry";

const ctx: ProviderConnectionContext = { organizationId: "org-1", connectionId: "conn-1", provider: "stripe", mode: "TEST" };
const verifyCtx: ProviderVerificationContext = { context: ctx, secretRef: "secret-ref-1" };

const fullAccount: StripeAccountLike = {
  id: "acct_1",
  charges_enabled: true,
  payouts_enabled: true,
  capabilities: { transfers: "active", card_payments: "active" },
  requirements: { currently_due: [], eventually_due: [], disabled_reason: null },
};

const makeAdapter = (opts?: {
  account?: StripeAccountLike;
  balanceAvailable?: Array<{ amount: number; currency: string }>;
  secretForConnection?: string | null;
  noCheckout?: boolean;
  noRefunds?: boolean;
  noAccountsCreate?: boolean;
  noPaymentMethods?: boolean;
}): StripeAdapter => {
  const client: StripeClientLike = {
    accounts: {
      async retrieve() { return opts?.account ?? fullAccount; },
      ...(opts?.noAccountsCreate ? {} : { async create(params: Record<string, unknown>) { return { id: `acct_${String(params.email).slice(0, 6)}`, object: "account" }; } }),
    },
    balance: {
      async retrieve() {
        return {
          available: opts?.balanceAvailable ?? [{ amount: 250000000, currency: "IDR" }],
          pending: [],
        };
      },
    },
    ...(opts?.noCheckout
      ? {}
      : {
          checkout: {
            sessions: {
              async create() {
                return { id: "cs_test_1", url: "https://checkout.stripe.test/cs_test_1", status: "open", payment_status: "unpaid", amount_total: 1000, currency: "usd", customer: null };
              },
            },
          },
        }),
    ...(opts?.noRefunds
      ? {}
      : {
          refunds: {
            async create() { return { id: "re_test_1", status: "pending" }; },
          },
        }),
    ...(opts?.noPaymentMethods
      ? {}
      : {
          paymentMethods: {
            async create(params: Record<string, unknown>) {
              const metadata = params.metadata as Record<string, unknown> | undefined;
              return { id: `pm_${String(metadata?.referenceId ?? "").slice(0, 6) || "1"}`, type: "card", customer: "cus_1", card: { brand: "Visa", last4: "4242" } };
            },
            async attach(params: Record<string, unknown>) {
              return { id: String(params.payment_method), type: "card", customer: String(params.customer), card: { brand: "Visa", last4: "4242" } };
            },
          },
        }),
  };
  return new StripeAdapter({
    createClient: () => client,
    resolveSecret: async () => "sk_test_dummy",
    resolveSecretForConnection: async () => (opts && "secretForConnection" in opts ? (opts.secretForConnection ?? null) : "sk_test_dummy"),
  });
};

describe("stripe adapter capabilities", () => {
  it("marks Stripe Connect/Routing/Billing capabilities supported but not yet available", async () => {
    const manifest = await makeAdapter().getCapabilities(ctx);
    expect(manifest.balanceRead.supported).toBe(true);
    expect(manifest.balanceRead.available).toBe(true);
    expect(manifest.connectedAccounts.supported).toBe(true);
    expect(manifest.connectedAccounts.available).toBe(false);
    expect(manifest.internalTransfers.supported).toBe(true);
    expect(manifest.internalTransfers.available).toBe(false);
    expect(manifest.recurringBilling.supported).toBe(true);
    expect(manifest.splitRouting.supported).toBe(true);
    expect(manifest.webhookHealth.configured).toBe(false);
  });
});

describe("stripe adapter verifyConnection", () => {
  it("verifies a fully-enabled Connect account", async () => {
    const v = await makeAdapter().verifyConnection(verifyCtx);
    expect(v.verified).toBe(true);
    expect(v.state).toBe("ACTIVE");
    expect(v.accountIdentity).toBe("acct_1");
    expect(v.permissionsVerified).toBe(true);
  });

  it("returns ACTION_REQUIRED when there are outstanding requirements", async () => {
    const v = await makeAdapter({ account: { ...fullAccount, charges_enabled: false, requirements: { currently_due: ["individual.legal_name"], eventually_due: [], disabled_reason: null } } }).verifyConnection(verifyCtx);
    expect(v.verified).toBe(false);
    expect(v.state).toBe("ACTION_REQUIRED");
    expect(v.requirements).toEqual(["individual.legal_name"]);
  });

  it("returns FAILED when the account is restricted", async () => {
    const v = await makeAdapter({
      account: { ...fullAccount, charges_enabled: false, payouts_enabled: false, requirements: { currently_due: [], eventually_due: [], disabled_reason: "requirements.past_due" } },
    }).verifyConnection(verifyCtx);
    expect(v.verified).toBe(false);
    expect(v.state).toBe("FAILED");
    expect(v.reason).toBe("requirements.past_due");
  });
});

describe("stripe adapter getBalance", () => {
  it("returns a normalized available balance", async () => {
    const result = await makeAdapter().getBalance(ctx);
    expect(result).toEqual({ available: 250000000, currency: "IDR", source: "stripe-live", asOf: expect.any(String) });
  });

  it("throws a safe error when no secret is configured", async () => {
    await expect(makeAdapter({ secretForConnection: null }).getBalance(ctx)).rejects.toThrow(/No secret configured/);
  });
});

describe("stripe adapter write capabilities", () => {
  it("creates a hosted payment Checkout Session and normalizes the result", async () => {
    const result = await makeAdapter().createHostedPayment(ctx, {
      externalId: "inv-ext-1",
      amount: 2500000,
      currency: "IDR",
      mode: "TEST",
    });
    expect(result).toEqual({
      id: "cs_test_1",
      checkoutUrl: "https://checkout.stripe.test/cs_test_1",
      status: "unpaid",
      externalId: "inv-ext-1",
      provider: "stripe",
    });
  });

  it("throws a safe error when Checkout Sessions is not available", async () => {
    await expect(makeAdapter({ noCheckout: true }).createHostedPayment(ctx, { externalId: "x", amount: 1, currency: "IDR", mode: "TEST" })).rejects.toThrow(/Checkout Sessions/);
  });

  it("creates a refund", async () => {
    const result = await makeAdapter().createRefund(ctx, {
      idempotencyKey: "op-abcdef",
      paymentId: "pi_123",
      amount: 2500000,
      currency: "IDR",
    });
    expect(result).toEqual({ id: "re_test_1", status: "pending", provider: "stripe" });
  });

  it("creates a connected account and never accepts a client-supplied account id", async () => {
    const result = await makeAdapter().createConnectedAccount(ctx, { email: "merchant@example.com", type: "express" });
    expect(result.provider).toBe("stripe");
    expect(result.id).toMatch(/^acct_/);
    expect(result.id).not.toContain("Stripe-Account");
  });

  it("creates a saved payment method and attaches it to the customer", async () => {
    const result = await makeAdapter().createPaymentMethod(ctx, { customerId: "cus_1", token: "tok_visa", kind: "card", referenceId: "billing-card" });
    expect(result).toEqual({ id: expect.stringMatching(/^pm_/), provider: "stripe", customerId: "cus_1", kind: "CARD", brand: "Visa", last4: "4242", status: "ATTACHED" });
  });

  it("throws a safe error when PaymentMethods is not available", async () => {
    await expect(makeAdapter({ noPaymentMethods: true }).createPaymentMethod(ctx, { customerId: "cus_1", token: "tok_visa" })).rejects.toThrow(/PaymentMethods/);
  });
});

describe("stripe error normalization", () => {
  it("maps auth/rate-limit/upstream errors", () => {
    expect(normalizeStripeError({ type: "StripeAuthenticationError" }, "s").code).toBe("UNAUTHORIZED");
    expect(normalizeStripeError({ type: "StripeRateLimitError" }, "s")).toMatchObject({ code: "RATE_LIMITED", retryable: true });
    expect(normalizeStripeError({ statusCode: 503 }, "s")).toMatchObject({ code: "UNAVAILABLE", retryable: true });
  });

  it("maps idempotency conflict", () => {
    expect(normalizeStripeError({ code: "idempotency_error" }, "s").code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("maps account requires action for config category", () => {
    expect(normalizeStripeError({ code: "account_invalid" }, "s")).toMatchObject({ code: "ACCOUNT_REQUIRES_ACTION", category: "config" });
  });

  it("redacts secrets in the message", () => {
    expect(normalizeStripeError({ message: "401 sk_test_dummy secret" }, "s").message).not.toContain("sk_test_dummy");
  });
});

describe("stripe adapter source boundary (via registry)", () => {
  it("does not import the stripe SDK in the adapter file", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(__dirname, "stripe.ts"), "utf8");
    expect(source).not.toMatch(/from\s+["']stripe["']/);
  });
});
