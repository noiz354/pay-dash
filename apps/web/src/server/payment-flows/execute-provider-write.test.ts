// @vitest-environment node
import { describe, expect, it } from "vitest";

import { deriveCapabilityState, type CapabilityManifest } from "@/domain/payments/capabilities";
import type { ProviderConnectionContext, PaymentProviderAdapter } from "@/server/providers/registry";
import { createProviderRegistry } from "@/server/providers/registry";
import { LocalEncryptedSecretStore } from "@/server/secrets/store";
import { InMemoryRuntimeConnectionDb, buildRuntimeConnectionResolver } from "@/server/repositories/runtime-connection-resolver";
import { resolveProviderWrite, tryProviderRefund } from "./execute-provider-write";

const KEY = "provider-write-test-key-that-is-long-enough-for-scrypt-derivation";

function manifest(): CapabilityManifest {
  const build = (s: Parameters<typeof deriveCapabilityState>[0]) => deriveCapabilityState(s);
  const on = build({ supported: true, configured: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null });
  const off = build({ supported: true, configured: false, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null });
  return {
    balanceRead: on, transactionRead: on, hostedPaymentLinks: off, customers: off, savedPaymentMethods: off,
    recurringBilling: off, refunds: on, payouts: off, connectedAccounts: off, internalTransfers: off,
    splitRouting: off, webhookHealth: build({ supported: true, configured: false, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null }),
  };
}

function registryWithRefund() {
  const registry = createProviderRegistry();
  registry.register({
    provider: "stripe",
    async verifyConnection() {
      return { verified: true, provider: "stripe", mode: "TEST", accountIdentity: "acct_1", accountDisplayName: "acct_1", permissionsVerified: true, capabilities: manifest(), webhookHealth: { status: "UNCONFIGURED", reason: null, lastCheckedAt: null }, requirements: [], state: "ACTIVE", reason: null, verifiedAt: new Date().toISOString() };
    },
    async getCapabilities() {
      return manifest();
    },
    async createRefund(_ctx: ProviderConnectionContext, input: { paymentId: string; amount: number }) {
      return { id: `re_${input.paymentId}`, status: "succeeded", provider: "stripe" };
    },
  } as PaymentProviderAdapter);
  return registry;
}

async function makeDeps() {
  const store = new LocalEncryptedSecretStore(KEY, "local");
  const db = new InMemoryRuntimeConnectionDb();
  const resolver = await buildRuntimeConnectionResolver({ db, secretStore: store });
  const registry = registryWithRefund();
  return { store, db, resolver, registry };
}

describe("provider write helper (rekomendasi #5)", () => {
  it("resolveProviderWrite returns connected:false when no ACTIVE connection resolves", async () => {
    const { resolver } = await makeDeps();
    const res = await resolveProviderWrite("org-none", { resolver });
    expect(res.connected).toBe(false);
  });

  it("routes a refund through the payment-flow when a connection resolves (idempotent + audit)", async () => {
    const { store, db, resolver, registry } = await makeDeps();
    db.seedConnection({ connectionId: "conn-1", organizationId: "org-1", provider: "stripe", mode: "TEST" });
    const envelope = await store.seal("sk_test_refund");
    db.seedSecret("conn-1", "TEST", { secretRef: JSON.stringify(envelope), credentialVersion: 1 });

    const out = await tryProviderRefund(
      { organizationId: "org-1", originalPaymentId: "pi_1", amountMinor: "5000", currency: "IDR", originalPaymentAmountMinor: "50000" },
      { resolver, registry },
    );
    expect(out.connected).toBe(true);
    if (out.connected) {
      expect(out.result.provider).toBe("stripe");
      expect(out.result.providerResourceId).toBe("re_pi_1");
      expect(out.result.operationId).toBeTruthy();
    }
  });

  it("propagates NOT_FOUND (fail-closed) when a connection exists but no secret resolves", async () => {
    const { db, resolver, registry } = await makeDeps();
    db.seedConnection({ connectionId: "conn-1", organizationId: "org-1", provider: "stripe", mode: "TEST" });
    // No secret seeded → resolveFirstActive throws NT_FOUND, resolveProviderWrite propagates.
    await expect(resolveProviderWrite("org-1", { resolver })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
