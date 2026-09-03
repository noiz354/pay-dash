import { describe, expect, it } from "vitest";
import { assertOriginalProvider, CanonicalPaymentSchema } from "./contracts";

const origin = { connectionId: "conn-x", provider: "xendit", mode: "TEST" as const, resourceType: "payment", resourceId: "p-1" };

describe("canonical payment contract", () => {
  it("accepts a provider-neutral payment", () => {
    expect(CanonicalPaymentSchema.parse({
      id: "payment-1",
      organizationId: "org-1",
      source: "PROVIDER",
      status: "PENDING",
      version: 1,
      merchantReference: "order-1",
      money: { amount: "10000", currency: "IDR" },
      provider: { origin, providerStatus: "PENDING", providerUpdatedAt: null, lastSyncedAt: "2026-09-03T00:00:00.000Z" },
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
    }).merchantReference).toBe("order-1");
  });

  it("rejects routing to a different provider connection", () => {
    expect(() => assertOriginalProvider(origin, { ...origin, connectionId: "conn-stripe", provider: "stripe" })).toThrow(/originating provider/);
  });
});
