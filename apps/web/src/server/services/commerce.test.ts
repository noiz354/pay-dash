// @vitest-environment node
import { describe, expect, it } from "vitest";

import { deriveCapabilityState, type CapabilityManifest } from "@/domain/payments/capabilities";
import { createProviderRegistry, type PaymentProviderAdapter, type ProviderConnectionContext } from "@/server/providers/registry";
import { LocalEncryptedSecretStore } from "@/server/secrets/store";
import { InMemoryRuntimeConnectionDb, buildRuntimeConnectionResolver } from "@/server/repositories/runtime-connection-resolver";
import { createProviderCustomer, createProviderInvoice, createProviderRecurringPlan } from "./commerce";

const KEY = "commerce-test-key-that-is-long-enough-for-scrypt-derivation";

function manifest(): CapabilityManifest {
  const build = (s: Parameters<typeof deriveCapabilityState>[0]) => deriveCapabilityState(s);
  const on = build({ supported: true, configured: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null });
  const off = build({ supported: true, configured: false, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null });
  return {
    balanceRead: off, transactionRead: off, hostedPaymentLinks: on, customers: on, savedPaymentMethods: off,
    recurringBilling: on, refunds: off, payouts: off, connectedAccounts: off, internalTransfers: off,
    splitRouting: off, webhookHealth: build({ supported: true, configured: false, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null }),
  };
}

function registryWithCommerce() {
  const registry = createProviderRegistry();
  registry.register({
    provider: "stripe",
    async verifyConnection() {
      return { verified: true, provider: "stripe", mode: "TEST", accountIdentity: "acct_1", accountDisplayName: "acct_1", permissionsVerified: true, capabilities: manifest(), webhookHealth: { status: "UNCONFIGURED", reason: null, lastCheckedAt: null }, requirements: [], state: "ACTIVE", reason: null, verifiedAt: new Date().toISOString() };
    },
    async getCapabilities() {
      return manifest();
    },
    async createCustomer(_ctx: ProviderConnectionContext, input: { referenceId: string }) {
      return { id: `cus_${input.referenceId}`, provider: "stripe" as const, referenceId: input.referenceId, status: "VERIFIED" as const };
    },
    async createHostedPayment(_ctx: ProviderConnectionContext, input: { externalId: string; amount: number }) {
      return { id: `inv_${input.externalId}`, checkoutUrl: "https://checkout.test/inv", status: "open", externalId: input.externalId, provider: "stripe" as const };
    },
    async createRecurringPlan(_ctx: ProviderConnectionContext, input: { planName: string; amountMinor: number; interval: string }) {
      return { id: "sub_1", provider: "stripe" as const, planName: input.planName, currency: "IDR", interval: input.interval as "monthly" | "yearly", amountMinor: input.amountMinor, status: "ACTIVE" as const };
    },
  } as unknown as PaymentProviderAdapter);
  return registry;
}

async function makeDeps() {
  const store = new LocalEncryptedSecretStore(KEY, "local");
  const db = new InMemoryRuntimeConnectionDb();
  const resolver = await buildRuntimeConnectionResolver({ db, secretStore: store });
  const registry = registryWithCommerce();
  return { store, db, resolver, registry };
}

async function seedConnection(db: InMemoryRuntimeConnectionDb, store: LocalEncryptedSecretStore) {
  db.seedConnection({ connectionId: "conn-1", organizationId: "org-1", provider: "stripe", mode: "TEST" });
  const envelope = await store.seal("sk_test_commerce");
  db.seedSecret("conn-1", "TEST", { secretRef: JSON.stringify(envelope), credentialVersion: 1 });
}

describe("commerce service (customer / invoice / recurring)", () => {
  it("returns connected:false when no connection resolves (dev/demo fallback)", async () => {
    const { resolver, registry } = await makeDeps();
    const out = await createProviderCustomer({ referenceId: "a@b.com", name: "A", email: "a@b.com" }, { resolver, registry });
    expect(out.connected).toBe(false);
  });

  it("routes a customer create through the adapter when a connection resolves", async () => {
    const { store, db, resolver, registry } = await makeDeps();
    await seedConnection(db, store);
    const out = await createProviderCustomer({ organizationId: "org-1", referenceId: "a@b.com", name: "Alice", email: "a@b.com" }, { resolver, registry });
    expect(out.connected).toBe(true);
    if (out.connected) expect(out.customer.id).toBe("cus_a@b.com");
  });

  it("routes an invoice create through hostedPaymentLinks (Xendit/Stripe invoice)", async () => {
    const { store, db, resolver, registry } = await makeDeps();
    await seedConnection(db, store);
    const out = await createProviderInvoice({ organizationId: "org-1", externalId: "INV-1", amountMinor: "1500000", currency: "IDR", payerEmail: "payer@example.com" }, { resolver, registry });
    expect(out.connected).toBe(true);
    if (out.connected) {
      expect(out.invoice.id).toBe("inv_INV-1");
      expect(out.invoice.checkoutUrl).toBe("https://checkout.test/inv");
    }
  });

  it("routes a recurring plan through the adapter when a connection resolves", async () => {
    const { store, db, resolver, registry } = await makeDeps();
    await seedConnection(db, store);
    const out = await createProviderRecurringPlan({ organizationId: "org-1", idempotencyKey: "k1", planName: "Growth", currency: "IDR", interval: "monthly", amountMinor: 1500000, customerId: "cus_1" }, { resolver, registry });
    expect(out.connected).toBe(true);
    if (out.connected) {
      expect(out.plan.id).toBe("sub_1");
      expect(out.plan.status).toBe("ACTIVE");
    }
  });
});
