// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ConnectionVerification } from "@/domain/payments/connection";
import type { CapabilityManifest } from "@/domain/payments/capabilities";
import { createProviderRegistry, type PaymentProviderAdapter, type ProviderConnectionContext, type ProviderVerificationContext } from "@/server/providers/registry";
import { createMoneyInRuntime, type MoneyInConnection } from "./money-in-runtime";

const FULL_MANIFEST: CapabilityManifest = {
  balanceRead: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  transactionRead: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  hostedPaymentLinks: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  customers: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  savedPaymentMethods: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  recurringBilling: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  refunds: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  payouts: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  connectedAccounts: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  internalTransfers: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  splitRouting: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  webhookHealth: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
};

const verify = (): ConnectionVerification => ({
  verified: true,
  provider: "stripe",
  mode: "TEST",
  accountIdentity: "acct_1",
  accountDisplayName: "acct_1",
  permissionsVerified: true,
  capabilities: FULL_MANIFEST,
  webhookHealth: { status: "UNCONFIGURED", reason: null, lastCheckedAt: null },
  requirements: [],
  state: "ACTIVE",
  reason: null,
  verifiedAt: new Date().toISOString(),
});

function makeRegistry(hostedResult?: unknown): PaymentProviderAdapter {
  return {
    provider: "stripe",
    async verifyConnection(_ctx: ProviderVerificationContext): Promise<ConnectionVerification> {
      return verify();
    },
    async getCapabilities(_ctx: ProviderConnectionContext): Promise<CapabilityManifest> {
      return FULL_MANIFEST;
    },
    async createHostedPayment(_ctx: ProviderConnectionContext) {
      return hostedResult ?? { id: "cs_test_1", checkoutUrl: "https://checkout.test/cs_test_1", status: "open", provider: "stripe" };
    },
  };
}

function registryWith(adapter: PaymentProviderAdapter) {
  const registry = createProviderRegistry();
  registry.register(adapter);
  return registry;
}

const connection: MoneyInConnection = { provider: "stripe", connectionId: "conn-1", organizationId: "org-1", mode: "TEST" };

describe("money-in runtime (PaymentFlowService wiring)", () => {
  it("routes a hosted payment through the flow when a TEST connection is resolved, surfacing the checkout URL", async () => {
    const runtime = await createMoneyInRuntime({ registry: registryWith(makeRegistry()), connectionResolver: async () => connection });
    const result = await runtime.executeHostedPayment({
      externalId: "link-1",
      amountMinor: "1500000",
      currency: "IDR",
      payerEmail: "payer@example.com",
    });
    expect(result).not.toBeNull();
    expect(result?.provider).toBe("stripe");
    expect(result?.providerResourceId).toBe("cs_test_1");
    expect(result?.checkoutUrl).toBe("https://checkout.test/cs_test_1");
    expect(result?.mode).toBe("TEST");
  });

  it("returns null (dev/demo link) when no provider connection is configured", async () => {
    const runtime = await createMoneyInRuntime({ registry: registryWith(makeRegistry()), connectionResolver: async () => null });
    const result = await runtime.executeHostedPayment({ externalId: "link-2", amountMinor: "1500000", currency: "IDR" });
    expect(result).toBeNull();
  });

  it("surfaces a configured-provider failure instead of falling back to mock", async () => {
    const failing = makeRegistry();
    failing.createHostedPayment = async () => {
      throw { code: "UNAVAILABLE" };
    };
    const runtime = await createMoneyInRuntime({ registry: registryWith(failing), connectionResolver: async () => connection });
    await expect(runtime.executeHostedPayment({ externalId: "link-3", amountMinor: "1500000", currency: "IDR" })).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("records an audit event for the routed hosted payment", async () => {
    const runtime = await createMoneyInRuntime({ registry: registryWith(makeRegistry()), connectionResolver: async () => connection });
    await runtime.executeHostedPayment({ externalId: "link-4", amountMinor: "1500000", currency: "IDR" });
    const audit = runtime._stores.audit as unknown as { events: Array<{ action: string }> };
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0].action).toBe("OPERATION_SUCCEEDED");
  });

  it("threads the organizationId through to the connection resolver (org-scoped selection)", async () => {
    const seen: Array<string | undefined> = [];
    const runtime = await createMoneyInRuntime({
      registry: registryWith(makeRegistry()),
      connectionResolver: async (organizationId?: string) => {
        seen.push(organizationId);
        // Only activate for the requested org.
        return organizationId === "org-9" ? { ...connection, organizationId: "org-9" } : null;
      },
    });
    const ok = await runtime.executeHostedPayment({ externalId: "link-5", amountMinor: "1500000", currency: "IDR", organizationId: "org-9" });
    expect(ok).not.toBeNull();
    const skipped = await runtime.executeHostedPayment({ externalId: "link-6", amountMinor: "1500000", currency: "IDR", organizationId: "org-other" });
    expect(skipped).toBeNull();
    expect(seen).toEqual(["org-9", "org-other"]);
  });
});
