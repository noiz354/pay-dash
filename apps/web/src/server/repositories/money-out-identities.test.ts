import { describe, expect, it } from "vitest";
import { assertProviderStatusDoesNotGrantEntitlement, assertRecurringTopology } from "./recurring-plan-identities";
import { assertNextPayoutAttempt, currentPayoutAttempt } from "./payout-identities";
import { assertTransferTopology } from "./transfer-identities";

describe("recurring identity", () => {
  const topology = { organizationId: "org", connectionId: "conn", canonicalCustomerId: "customer" };

  it("requires payment method and subscription topology to match", () => {
    expect(() => assertRecurringTopology(topology, topology)).not.toThrow();
    expect(() => assertRecurringTopology(topology, { ...topology, connectionId: "other" })).toThrow(/topology/);
  });

  it("does not grant entitlement from unknown provider state", () => {
    expect(() => assertProviderStatusDoesNotGrantEntitlement("UNKNOWN", "ACTIVE")).toThrow(/cannot grant/);
  });
});

describe("payout attempts", () => {
  const first = { recipientId: "recipient", organizationId: "org", connectionId: "conn", attemptNumber: 1 };

  it("requires consecutive immutable attempt identities", () => {
    expect(() => assertNextPayoutAttempt(null, first)).not.toThrow();
    expect(() => assertNextPayoutAttempt(first, { ...first, attemptNumber: 2 })).not.toThrow();
    expect(() => assertNextPayoutAttempt(first, { ...first, attemptNumber: 3 })).toThrow(/consecutive/);
  });

  it("selects the highest attempt without overwriting history", () => {
    expect(currentPayoutAttempt([{ attemptNumber: 1 }, { attemptNumber: 3 }, { attemptNumber: 2 }])).toEqual({ attemptNumber: 3 });
  });
});

describe("platform transfer topology", () => {
  const source = { id: "source", organizationId: "org", connectionId: "conn" };

  it("requires distinct accounts in one organization and connection", () => {
    expect(() => assertTransferTopology(source, { ...source, id: "destination" })).not.toThrow();
    expect(() => assertTransferTopology(source, { ...source, id: "destination", connectionId: "stripe" })).toThrow(/provider connection/);
    expect(() => assertTransferTopology(source, source)).toThrow(/must differ/);
  });
});
