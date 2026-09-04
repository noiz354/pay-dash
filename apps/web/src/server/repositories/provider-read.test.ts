// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import { deriveCapabilityState, type CapabilityManifest } from "@/domain/payments/capabilities";
import { createProviderRegistry, type PaymentProviderAdapter, type ProviderConnectionContext } from "@/server/providers/registry";
import { LocalEncryptedSecretStore } from "@/server/secrets/store";
import { InMemoryRuntimeConnectionDb, buildRuntimeConnectionResolver } from "./runtime-connection-resolver";
import { buildProviderReadService, resetProviderReadService } from "./provider-read";

const KEY = "provider-read-test-key-that-is-long-enough-for-scrypt-derivation";

function manifest(): CapabilityManifest {
  const build = (s: Parameters<typeof deriveCapabilityState>[0]) => deriveCapabilityState(s);
  const read = build({ supported: true, configured: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null });
  const off = build({ supported: true, configured: false, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null });
  return {
    balanceRead: read,
    transactionRead: read,
    hostedPaymentLinks: off,
    customers: off,
    savedPaymentMethods: off,
    recurringBilling: off,
    refunds: off,
    payouts: off,
    connectedAccounts: off,
    internalTransfers: off,
    splitRouting: off,
    webhookHealth: build({ supported: true, configured: false, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null }),
  };
}

function registryWithStubRead() {
  const registry = createProviderRegistry();
  registry.register({
    provider: "stripe",
    async verifyConnection() {
      return {
        verified: true, provider: "stripe", mode: "TEST", accountIdentity: "acct_1", accountDisplayName: "acct_1",
        permissionsVerified: true, capabilities: manifest(), webhookHealth: { status: "UNCONFIGURED", reason: null, lastCheckedAt: null },
        requirements: [], state: "ACTIVE", reason: null, verifiedAt: new Date().toISOString(),
      };
    },
    async getCapabilities() {
      return manifest();
    },
    async getBalance(_ctx: ProviderConnectionContext) {
      return { available: 42_000, currency: "IDR", source: "stripe-live" as const, asOf: "2026-01-01T00:00:00.000Z" };
    },
    async listTransactions(_ctx: ProviderConnectionContext) {
      return [
        { id: "ch_1", referenceId: "ch_1", at: "2026-01-02T00:00:00.000Z", amount: 100, currency: "IDR", status: "SUCCEEDED" as const, channel: "CARD", methodLabel: "Card", customerName: null, customerEmail: null, description: null, fee: null, net: 100, source: "stripe-live" as const },
      ];
    },
  } as PaymentProviderAdapter);
  return registry;
}

async function makeReadService() {
  const store = new LocalEncryptedSecretStore(KEY, "local");
  const db = new InMemoryRuntimeConnectionDb();
  const resolver = await buildRuntimeConnectionResolver({ db, secretStore: store });
  const registry = registryWithStubRead();
  const service = await buildProviderReadService({ resolver, registry });
  return { service, db, store };
}

describe("provider read service (rekomendasi #4)", () => {
  afterEach(() => resetProviderReadService());

  it("returns connected:false when no ACTIVE connection resolves for the org", async () => {
    const { service } = await makeReadService();
    expect((await service.readTransactions("org-none")).connected).toBe(false);
    expect((await service.readBalance("org-none")).connected).toBe(false);
  });

  it("routes transaction + balance reads through the adapter when a connection resolves", async () => {
    const { service, db, store } = await makeReadService();
    db.seedConnection({ connectionId: "conn-1", organizationId: "org-1", provider: "stripe", mode: "TEST" });
    const envelope = await store.seal("sk_test_read");
    db.seedSecret("conn-1", "TEST", { secretRef: JSON.stringify(envelope), credentialVersion: 1 });

    const txs = await service.readTransactions("org-1");
    expect(txs.connected).toBe(true);
    if (txs.connected) {
      expect(txs.data).toHaveLength(1);
      expect(txs.data[0].id).toBe("ch_1");
    }

    const bal = await service.readBalance("org-1");
    expect(bal.connected).toBe(true);
    if (bal.connected) {
      expect(bal.data.available).toBe(42_000);
    }
  });
});
