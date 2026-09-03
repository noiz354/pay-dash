import { describe, expect, it } from "vitest";
import { assertCustomerOrganization } from "./customer-identities";
import { assertPaymentCustomerOrganization } from "./payment-identities";
import { assertRefundOrigin } from "./refund-identities";
import { assertPaymentMethodTopology, parseMaskedPaymentMethodDetails } from "./payment-method-identities";

describe("money-in identity topology", () => {
  it("rejects customer/payment organization mismatch", () => {
    expect(() => assertCustomerOrganization("org-a", { id: "customer", organizationId: "org-b" })).toThrow(/same organization/);
    expect(() => assertPaymentCustomerOrganization("org-a", "org-b")).toThrow(/same organization/);
  });

  it("binds refunds to the original provider payment", () => {
    const origin = { organizationId: "org-a", connectionId: "conn-x", providerPaymentId: "provider-payment" };
    expect(() => assertRefundOrigin(origin, origin)).not.toThrow();
    expect(() => assertRefundOrigin(origin, { ...origin, connectionId: "conn-stripe" })).toThrow(/originating provider/);
    expect(() => assertRefundOrigin(origin, { ...origin, providerPaymentId: "other-payment" })).toThrow(/originating provider/);
  });

  it("binds payment methods to the provider customer topology", () => {
    const topology = { organizationId: "org-a", connectionId: "conn-x", canonicalCustomerId: "customer-a" };
    expect(() => assertPaymentMethodTopology(topology, topology)).not.toThrow();
    expect(() => assertPaymentMethodTopology(topology, { ...topology, canonicalCustomerId: "customer-b" })).toThrow(/topology/);
  });

  it("allows only strict masked details", () => {
    expect(parseMaskedPaymentMethodDetails({ kind: "CARD", brand: "visa", last4: "4242" })).toMatchObject({ last4: "4242" });
    expect(() => parseMaskedPaymentMethodDetails({ kind: "CARD", brand: "visa", last4: "4242", token: "forbidden" })).toThrow();
  });
});
