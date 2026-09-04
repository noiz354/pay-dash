import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveCapabilityState, type CapabilityManifest } from "@/domain/payments/capabilities";
import type { ConnectionVerification } from "@/domain/payments/connection";
import {
  createProviderRegistry,
  ProviderRegistryError,
  type PaymentProviderAdapter,
  type ProviderConnectionContext,
  type ProviderVerificationContext,
} from "./registry";

async function rejectsWithCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    throw new Error(`expected the promise to reject with ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(ProviderRegistryError);
    expect((err as ProviderRegistryError).code).toBe(code);
  }
}

const ctx: ProviderConnectionContext = {
  organizationId: "org-1",
  connectionId: "conn-1",
  provider: "xendit",
  mode: "TEST",
};

const mkManifest = (overrides?: {
  balanceConfigured?: boolean;
  balanceSupported?: boolean;
}): CapabilityManifest => {
  const keys = [
    "balanceRead",
    "transactionRead",
    "hostedPaymentLinks",
    "customers",
    "savedPaymentMethods",
    "recurringBilling",
    "refunds",
    "payouts",
    "connectedAccounts",
    "internalTransfers",
    "splitRouting",
    "webhookHealth",
  ] as const;
  const manifest = {} as CapabilityManifest;
  for (const key of keys) {
    manifest[key] = {
      supported: true,
      configured: true,
      available: true,
      mode: "TEST",
      reason: null,
      requirements: [],
      lastVerifiedAt: "2026-09-03T00:00:00.000Z",
    };
  }
  manifest.balanceRead = deriveCapabilityState({
    supported: overrides?.balanceSupported ?? true,
    configured: overrides?.balanceConfigured ?? true,
    mode: "TEST",
    reason: null,
    requirements: [],
    lastVerifiedAt: "2026-09-03T00:00:00.000Z",
  });
  return manifest;
};

const verification: ConnectionVerification = {
  verified: true,
  provider: "xendit",
  mode: "TEST",
  accountIdentity: "acct_123",
  accountDisplayName: "Merchant",
  permissionsVerified: true,
  capabilities: mkManifest(),
  webhookHealth: { status: "VERIFIED", reason: null, lastCheckedAt: "2026-09-03T00:00:00.000Z" },
  requirements: [],
  state: "ACTIVE",
  reason: null,
  verifiedAt: "2026-09-03T00:00:00.000Z",
};

const adapter: PaymentProviderAdapter = {
  provider: "xendit",
  async verifyConnection(_v: ProviderVerificationContext): Promise<ConnectionVerification> {
    return verification;
  },
  async getCapabilities(_c: ProviderConnectionContext): Promise<CapabilityManifest> {
    return mkManifest();
  },
  async getBalance() {
    return { available: 1000000, currency: "IDR" };
  },
};

const balanceDisabledAdapter: PaymentProviderAdapter = {
  provider: "xendit",
  async verifyConnection(_v: ProviderVerificationContext): Promise<ConnectionVerification> {
    return { ...verification, state: "ACTION_REQUIRED", verified: false };
  },
  async getCapabilities(_c: ProviderConnectionContext): Promise<CapabilityManifest> {
    return mkManifest({ balanceConfigured: false });
  },
  async getBalance() {
    throw new Error("should not be invoked when not configured");
  },
};

describe("provider registry", () => {
  it("registers and resolves an adapter by provider key", () => {
    const reg = createProviderRegistry();
    reg.register(adapter);
    expect(reg.resolve("xendit")).toBe(adapter);
  });

  it("rejects duplicate registration for the same provider key", () => {
    const reg = createProviderRegistry();
    reg.register(adapter);
    expect(() => reg.register(adapter)).toThrow(ProviderRegistryError);
    expect(() => reg.register(adapter)).toThrow(/already registered/);
  });

  it("resolves an unknown provider to a typed error", () => {
    const reg = createProviderRegistry();
    expect(() => reg.resolve("stripe")).toThrow(ProviderRegistryError);
    try {
      reg.resolve("stripe");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ProviderRegistryError).code).toBe("UNSUPPORTED_PROVIDER");
      expect((err as ProviderRegistryError).message).toMatch(/No provider adapter/);
    }
  });

  it("resolves provider from a trusted connection context", () => {
    const reg = createProviderRegistry();
    reg.register(adapter);
    const sameContext: ProviderConnectionContext = { ...ctx, provider: "xendit" };
    expect(reg.resolve(sameContext.provider)).toBe(adapter);
  });

  it("returns a validated manifest from getCapabilities", async () => {
    const reg = createProviderRegistry();
    reg.register(adapter);
    const manifest = await reg.getCapabilities("xendit", ctx);
    expect(manifest.balanceRead.available).toBe(true);
  });

  it("forwards verification through the adapter", async () => {
    const reg = createProviderRegistry();
    reg.register(adapter);
    const result = await reg.verifyConnection("xendit", { context: ctx, secretRef: "svc-key-1" });
    expect(result.verified).toBe(true);
    expect(result.state).toBe("ACTIVE");
  });

  it("invokes a supported, configured capability and returns its result", async () => {
    const reg = createProviderRegistry();
    reg.register(adapter);
    const result = await reg.invokeCapability("xendit", "balanceRead", ctx);
    expect(result).toEqual({ available: 1000000, currency: "IDR" });
  });

  it("refuses to invoke an unsupported capability (no fake fallback)", async () => {
    const noRefund: PaymentProviderAdapter = {
      provider: "xendit",
      async verifyConnection(_v: ProviderVerificationContext): Promise<ConnectionVerification> {
        return verification;
      },
      async getCapabilities(_c: ProviderConnectionContext): Promise<CapabilityManifest> {
        const m = mkManifest();
        m.refunds = deriveCapabilityState({
          supported: false,
          configured: false,
          mode: "TEST",
          reason: "Xendit does not expose refunds on this product",
          requirements: [],
          lastVerifiedAt: null,
        });
        return m;
      },
      // Implements the seam but the manifest truthfully reports unsupported.
      async createRefund() {
        throw new Error("should not be invoked when unsupported");
      },
    };
    const reg = createProviderRegistry();
    reg.register(noRefund);
    await rejectsWithCode(reg.invokeCapability("xendit", "refunds", ctx, { amount: "1.00" }), "CAPABILITY_NOT_SUPPORTED");
  });

  it("refuses to invoke a supported-but-not-configured capability", async () => {
    const reg = createProviderRegistry();
    reg.register(balanceDisabledAdapter);
    await rejectsWithCode(reg.invokeCapability("xendit", "balanceRead", ctx), "CAPABILITY_NOT_CONFIGURED");
  });

  it("treats a missing adapter method for a claimed capability as not supported", async () => {
    const noMethod: PaymentProviderAdapter = {
      provider: "xendit",
      async verifyConnection(_v: ProviderVerificationContext): Promise<ConnectionVerification> {
        return verification;
      },
      async getCapabilities(_c: ProviderConnectionContext): Promise<CapabilityManifest> {
        // Claims payouts support but forgets to implement createPayout.
        return mkManifest();
      },
    };
    const reg = createProviderRegistry();
    reg.register(noMethod);
    // getBalance is not implemented on this adapter despite manifest support.
    await expect(reg.invokeCapability("xendit", "balanceRead", ctx)).rejects.toThrow(
      /does not implement capability "balanceRead"/,
    );
  });
});

describe("registry source boundary", () => {
  it("does not import a provider SDK", () => {
    const source = readFileSync(resolve(__dirname, "registry.ts"), "utf8");
    expect(source).not.toMatch(/from\s+["']xendit-node["']/);
    expect(source).not.toMatch(/from\s+["']stripe["']/);
  });
});
