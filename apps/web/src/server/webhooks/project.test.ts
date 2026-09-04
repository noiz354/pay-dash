import { describe, expect, it } from "vitest";

import type { ProjectionResource } from "@/domain/payments/projection";
import type { PaymentProjectionDb } from "@/server/repositories/payment-projection-store";
import { InMemoryPaymentProjectionStore } from "@/server/repositories/payment-projection-store";
import { projectWebhookEvent } from "./project";

/** A tiny available, db-backed projection store seeded with a known resource. */
function makeStore(resource: Partial<ProjectionResource> & { resourceId: string; provider?: "xendit" | "stripe" }) {
  const byKey = new Map<string, ProjectionResource>();
  const byRef = new Map<string, string>();
  const provider = resource.provider ?? "xendit";
  const record: ProjectionResource = {
    id: resource.id ?? "pay-1",
    organizationId: resource.organizationId ?? "org-1",
    canonicalStatus: resource.canonicalStatus ?? "PENDING",
    providerStatus: resource.providerStatus ?? null,
    version: resource.version ?? 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const key = `${record.organizationId}:${record.id}`;
  byKey.set(key, record);
  byRef.set(`${provider}:${resource.resourceId}`, key);

  const db: PaymentProjectionDb = {
    available: () => true,
    findResource: async (organizationId, resourceId) => byKey.get(`${organizationId}:${resourceId}`) ?? null,
    findResourceByProviderRef: async (provider, ref) => {
      const k = byRef.get(`${provider}:${ref}`);
      return k ? byKey.get(k) ?? null : null;
    },
    updateResource: async (r) => {
      byKey.set(`${r.organizationId}:${r.id}`, r);
    },
  };
  return new InMemoryPaymentProjectionStore(db);
}

const xenditPaymentSucceededPayload = {
  id: "evt_1234",
  data: { object: { id: "xen-pay-1" } },
};

describe("projectWebhookEvent facade", () => {
  it("projects a verified xendit payment.succeeded -> PROJECTED", async () => {
    const store = makeStore({ resourceId: "xen-pay-1" });
    const result = await projectWebhookEvent({
      provider: "xendit",
      eventId: "evt_1234",
      type: "payment.succeeded",
      payload: xenditPaymentSucceededPayload,
      store,
    });
    expect(result).toBe("PROJECTED");
  });

  it("returns UNKNOWN_RESOURCE when no canonical resource matches the provider id (no invented success)", async () => {
    const store = makeStore({ resourceId: "xen-pay-1" });
    const result = await projectWebhookEvent({
      provider: "xendit",
      eventId: "evt_9999",
      type: "payment.succeeded",
      payload: { id: "evt_9999", data: { object: { id: "xen-pay-unknown" } } },
      store,
    });
    expect(result).toBe("UNKNOWN_RESOURCE");
  });

  it("returns UNKNOWN_RESOURCE when the payload carries no recognizable resource id", async () => {
    const store = makeStore({ resourceId: "xen-pay-1" });
    const result = await projectWebhookEvent({
      provider: "xendit",
      eventId: "evt_3",
      type: "payment.succeeded",
      payload: { id: "evt_3" },
      store,
    });
    expect(result).toBe("UNKNOWN_RESOURCE");
  });

  it("returns UNAVAILABLE when no durable projection backend is present (fail closed, not fake success)", async () => {
    // No store injected → buildPaymentProjectionStore() returns the in-memory,
    // non-durable store whose available() is false.
    const result = await projectWebhookEvent({
      provider: "xendit",
      eventId: "evt_7",
      type: "payment.succeeded",
      payload: xenditPaymentSucceededPayload,
    });
    expect(result).toBe("UNAVAILABLE");
  });

  it("maps a Stripe charge.succeeded to PROJECTED through the Stripe map", async () => {
    const store = makeStore({ resourceId: "stripe-pay-1", id: "pay-s-1", organizationId: "org-2", provider: "stripe" });
    const result = await projectWebhookEvent({
      provider: "stripe",
      eventId: "evt_stripe_1",
      type: "charge.succeeded",
      payload: { id: "evt_stripe_1", data: { object: { id: "stripe-pay-1" } } },
      store,
    });
    expect(result).toBe("PROJECTED");
  });

  it("does not project a resource into a different organization than the caller expects", async () => {
    const store = makeStore({ resourceId: "xen-pay-1", organizationId: "org-1" });
    const result = await projectWebhookEvent({
      provider: "xendit",
      eventId: "evt_8",
      type: "payment.succeeded",
      payload: xenditPaymentSucceededPayload,
      organizationId: "org-other",
      store,
    });
    expect(result).toBe("UNKNOWN_RESOURCE");
  });
});
