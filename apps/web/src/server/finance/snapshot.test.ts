import { describe, expect, it } from "vitest";

import { checkLedgerInvariants } from "@/domain/finance/invariants";
import { buildLedgerSnapshot, snapshotFromParts } from "./snapshot";

/**
 * These tests run the invariant checker against the **real seeded stores** —
 * not a fixture. That is the point: it is the only way to learn whether the
 * ledger this product actually ships is internally consistent.
 *
 * If this suite ever fails, it has found a genuine financial inconsistency in
 * the application's own data and the failure must be triaged, never skipped.
 */
describe("ledger snapshot over the real stores", () => {
  it("builds a snapshot whose amounts are all integer minor units", async () => {
    const { snapshot } = await buildLedgerSnapshot();
    const amounts = [
      ...snapshot.payments.map((p) => p.captured),
      ...snapshot.refunds.map((r) => r.amount),
      ...snapshot.payouts.map((p) => p.amount),
      snapshot.balance.available,
      snapshot.balance.reserved,
      snapshot.balance.opening,
      snapshot.settledInflow,
      snapshot.settledOutflow,
    ];
    for (const a of amounts) {
      expect(Number.isInteger(a.units)).toBe(true);
      expect(a.currency).toBe("IDR");
    }
  });

  it("reports honestly that no double-entry postings exist yet", async () => {
    const { snapshot, doubleEntryAvailable, source } = await buildLedgerSnapshot();
    expect(doubleEntryAvailable).toBe(false);
    expect(snapshot.postings).toEqual([]);
    expect(source).toBe("in-memory-store");
  });

  it("carries real payments, refunds and payouts from the seed", async () => {
    const { snapshot } = await buildLedgerSnapshot();
    expect(snapshot.payments.length).toBeGreaterThan(0);
    expect(snapshot.payouts.length).toBeGreaterThan(0);
    // Every refund must point at a payment that is present.
    const ids = new Set(snapshot.payments.map((p) => p.id));
    for (const r of snapshot.refunds) {
      expect(ids.has(r.paymentId)).toBe(true);
    }
  });

  it("THE GATE — the seeded ledger satisfies every financial invariant", async () => {
    const { snapshot } = await buildLedgerSnapshot();
    const report = checkLedgerInvariants(snapshot);
    // Print the violations so a failure is actionable rather than a bare `false`.
    if (!report.ok) {
       
      console.error("INVARIANT VIOLATIONS", JSON.stringify(report.violations, null, 2));
    }
    expect(report.fatalCount).toBe(0);
    expect(report.ok).toBe(true);
  });

  /**
   * A checker that cannot fail is decoration. This test corrupts the store the
   * way a real bug would (a payout that pays out more than the ledger ever
   * received) and proves the gate above would actually catch it.
   */
  it("PROOF OF SENSITIVITY — a corrupted store is caught by the gate", async () => {
    const { legacyPayoutBatches } = await import("@/server/data/payouts-unscoped");
    const batches = legacyPayoutBatches("finance-snapshot");
    const { snapshot: clean } = await buildLedgerSnapshot();
    expect(checkLedgerInvariants(clean).ok).toBe(true);

    // Inject an impossible payout: bigger than opening + every inflow combined.
    const corrupted = {
      ...clean,
      payouts: [
        ...clean.payouts,
        {
          id: "po_corrupt",
          batchId: batches[0]?.id ?? "b_corrupt",
          status: "PENDING" as const,
          amount: { units: 999_999_999_999_999, currency: "IDR" },
          createdAt: clean.asOf,
        },
      ],
    };
    const report = checkLedgerInvariants(corrupted);
    expect(report.ok).toBe(false);
    expect(report.byCode["INV-L3"]).toBe(1);
  });

  it("PROOF OF SENSITIVITY — an over-refund on real data is caught", async () => {
    const { snapshot } = await buildLedgerSnapshot();
    const victim = snapshot.payments.find((p) => p.captured.units > 0);
    expect(victim).toBeDefined();
    const report = checkLedgerInvariants({
      ...snapshot,
      refunds: [
        ...snapshot.refunds.filter((r) => r.paymentId !== victim!.id),
        {
          id: "ref_over",
          paymentId: victim!.id,
          status: "SUCCEEDED" as const,
          amount: { units: victim!.captured.units + 1, currency: "IDR" },
          createdAt: snapshot.asOf,
        },
      ],
    });
    expect(report.byCode["INV-L2"]).toBe(1);
  });

  it("records the requested organization scope on the snapshot", async () => {
    const { snapshot } = await buildLedgerSnapshot("org-under-test");
    expect(snapshot.organizationId).toBe("org-under-test");
  });

  it("is stable across two consecutive builds (no clock-induced drift in the money)", async () => {
    const a = await buildLedgerSnapshot();
    const b = await buildLedgerSnapshot();
    expect(b.snapshot.balance.available).toEqual(a.snapshot.balance.available);
    expect(b.snapshot.settledInflow).toEqual(a.snapshot.settledInflow);
    expect(b.snapshot.settledOutflow).toEqual(a.snapshot.settledOutflow);
  });
});

describe("snapshotFromParts", () => {
  it("produces a checkable snapshot from explicit minor-unit parts", () => {
    const snapshot = snapshotFromParts({
      organizationId: "org-1",
      openingMinor: 1_000,
      availableMinor: 1_400,
      reservedMinor: 100,
      settledInflowMinor: 600,
      settledOutflowMinor: 100,
    });
    expect(checkLedgerInvariants(snapshot).ok).toBe(true);
  });

  it("surfaces a deliberately wrong available figure", () => {
    const snapshot = snapshotFromParts({
      organizationId: "org-1",
      openingMinor: 1_000,
      availableMinor: 9_999,
      settledInflowMinor: 600,
    });
    const report = checkLedgerInvariants(snapshot);
    expect(report.ok).toBe(false);
    expect(report.byCode["INV-L4"]).toBe(1);
  });
});
