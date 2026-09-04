// @vitest-environment node
import { describe, expect, it } from "vitest";

import { deriveCapabilityState, type CapabilityManifest } from "@/domain/payments/capabilities";
import { createProviderRegistry, type PaymentProviderAdapter, type ProviderConnectionContext } from "@/server/providers/registry";
import { LocalEncryptedSecretStore } from "@/server/secrets/store";
import { InMemoryRuntimeConnectionDb, buildRuntimeConnectionResolver } from "@/server/repositories/runtime-connection-resolver";
import { buildPlatformService, verifyKycProvider } from "./platform-service";

const KEY = "platform-test-key-that-is-long-enough-for-scrypt-derivation";

function manifest(): CapabilityManifest {
  const build = (s: Parameters<typeof deriveCapabilityState>[0]) => deriveCapabilityState(s);
  const on = build({ supported: true, configured: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null });
  const off = build({ supported: true, configured: false, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null });
  return {
    balanceRead: off, transactionRead: off, hostedPaymentLinks: off, customers: off, savedPaymentMethods: off,
    recurringBilling: off, refunds: off, payouts: off, connectedAccounts: on, internalTransfers: on,
    splitRouting: on, webhookHealth: build({ supported: true, configured: false, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null }),
  };
}

function registryWithPlatform() {
  const registry = createProviderRegistry();
  registry.register({
    provider: "stripe",
    async verifyConnection() {
      return { verified: true, provider: "stripe", mode: "TEST", accountIdentity: "acct_1", accountDisplayName: "acct_1", permissionsVerified: true, capabilities: manifest(), webhookHealth: { status: "UNCONFIGURED", reason: null, lastCheckedAt: null }, requirements: [], state: "ACTIVE", reason: null, verifiedAt: new Date().toISOString() };
    },
    async getCapabilities() {
      return manifest();
    },
    async createConnectedAccount(_ctx: ProviderConnectionContext, input: { email: string; type: string }) {
      return { id: "acct_new", provider: "stripe" as const, email: input.email };
    },
    async createSplitRule(_ctx: ProviderConnectionContext, input: { name: string; currency: string; destinations: unknown[] }) {
      return { id: "split_1", provider: "stripe" as const, name: input.name, currency: input.currency, destinations: input.destinations, status: "ACTIVE" as const };
    },
    async createTransfer(_ctx: ProviderConnectionContext, input: { amount: number; currency: string; destination: string }) {
      return { id: "tr_1", provider: "stripe" as const, amount: input.amount, currency: input.currency, status: "pending", destination: input.destination };
    },
  } as unknown as PaymentProviderAdapter);
  return registry;
}

async function makeDeps() {
  const store = new LocalEncryptedSecretStore(KEY, "local");
  const db = new InMemoryRuntimeConnectionDb();
  const resolver = await buildRuntimeConnectionResolver({ db, secretStore: store });
  const registry = registryWithPlatform();
  return { store, db, resolver, registry };
}

describe("platform service (rekomendasi #6)", () => {
  it("verifyKycProvider returns SUBMITTED when no connection resolves", async () => {
    const { resolver } = await makeDeps();
    const verification = await verifyKycProvider("org-none", { resolver });
    expect(verification.state).toBe("SUBMITTED");
  });

  it("routes connected-account / split-rule / transfer through the adapter when a connection resolves", async () => {
    const { store, db, resolver, registry } = await makeDeps();
    db.seedConnection({ connectionId: "conn-1", organizationId: "org-1", provider: "stripe", mode: "TEST" });
    const envelope = await store.seal("sk_test_platform");
    db.seedSecret("conn-1", "TEST", { secretRef: JSON.stringify(envelope), credentialVersion: 1 });

    const service = await buildPlatformService({ resolver, registry });
    const ca = await service.createConnectedAccount({ organizationId: "org-1", email: "owner@example.com", type: "express" });
    expect(ca.connected).toBe(true);
    if (ca.connected) expect(ca.account.id).toBe("acct_new");

    const rule = await service.createSplitRule({ organizationId: "org-1", name: "Marketplace split", currency: "IDR", destinations: [{ accountId: "acct_1", amount: 0, percent: 70 }] });
    expect(rule.connected).toBe(true);
    if (rule.connected) expect(rule.rule.id).toBe("split_1");

    const transfer = await service.createTransfer({ organizationId: "org-1", amount: 1000, currency: "IDR", destination: "acct_1" });
    expect(transfer.connected).toBe(true);
    if (transfer.connected) expect(transfer.transfer.id).toBe("tr_1");
  });

  it("returns connected:false when no connection resolves (read-only shell in dev)", async () => {
    const { resolver, registry } = await makeDeps();
    const service = await buildPlatformService({ resolver, registry });
    const ca = await service.createConnectedAccount({ email: "owner@example.com", type: "express" });
    expect(ca.connected).toBe(false);
  });
});
