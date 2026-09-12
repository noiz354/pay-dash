import { beforeEach, describe, expect, it } from "vitest";
import { getAnalyticsSeries, listTransactions, seedDemoLedgerForOrganization } from "./transactions";
import { DEMO_CONTEXT } from "@/test/organization-context";

function resetStores() {
  const g = globalThis as unknown as {
    __kineticTxStore?: unknown;
    __kineticPayoutStore?: unknown;
    __kineticBalanceStore?: unknown;
  };
  g.__kineticTxStore = undefined;
  g.__kineticPayoutStore = undefined;
  g.__kineticBalanceStore = undefined;
}

beforeEach(resetStores);

describe("getAnalyticsSeries", () => {
  it.each([
    [7, "7d"],
    [30, "30d"],
    [90, "90d"],
  ])("returns one bucket per day for the %s window", async (days) => {
    const series = await getAnalyticsSeries(DEMO_CONTEXT, days);
    expect(series).toHaveLength(days);
    // One bucket per calendar day, oldest first — the chart plots them in order.
    const dates = series.map((p) => p.date);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).not.toBe(dates[i - 1]);
    }
    for (const p of series) {
      expect(p.date).toBeTruthy();
      expect(p.total).toBeGreaterThanOrEqual(0);
      expect(p.succeeded).toBeGreaterThanOrEqual(0);
      expect(p.failed).toBeGreaterThanOrEqual(0);
      // succeeded/failed are subsets of the day's volume (all amounts ≥ 0).
      expect(p.succeeded).toBeLessThanOrEqual(p.total);
      expect(p.failed).toBeLessThanOrEqual(p.total);
    }
  });

  it("conserves money: the 30-day series sums to the whole seeded ledger", async () => {
    const series = await getAnalyticsSeries(DEMO_CONTEXT, 30);
    const { rows } = await listTransactions(DEMO_CONTEXT, { pageSize: 200, page: 1 });
    // The seeded ledger window is ~6.5 days, so nothing falls outside 30d.
    expect(rows.length).toBeGreaterThan(0);
    const ledgerTotal = rows.reduce((a, t) => a + t.amount, 0);
    const seriesTotal = series.reduce((a, p) => a + p.total, 0);
    expect(seriesTotal).toBe(ledgerTotal);
  });

  it("an empty ledger yields a zero series of the right length, not an error", async () => {
    // Wipe the seeded rows — the chart's empty state must be reachable
    // without a crash (the page maps an all-zero series to it).
    // Installed through the seeding seam rather than by reaching into the store,
    // so an empty *tenant* is expressible without an empty *process*.
    seedDemoLedgerForOrganization(DEMO_CONTEXT, { rows: [], mode: "replace" });
    const series = await getAnalyticsSeries(DEMO_CONTEXT, 7);
    expect(series).toHaveLength(7);
    expect(series.every((p) => p.total === 0 && p.succeeded === 0 && p.failed === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Wave 4 §3 — SLA wiring (band derivation, filter, sort)
// ---------------------------------------------------------------------------
// The seeded ledger anchors to wall-clock "today", so band-exact assertions
// hand-build rows with fixed timestamps and inject `now` — the same single
// evaluation instant the server aggregation passes.

import { evaluateTransactionSla, normalizeRefundStateFilter, normalizeSlaFilter, slaForTransaction, type Transaction } from "./transactions";

const HOUR = 3_600_000;
/** The single evaluation instant every SLA test asserts against. */
const FIXED_NOW = new Date("2026-09-12T09:00:00.000Z");

function tx(partial: Partial<Transaction> & Pick<Transaction, "id" | "status" | "createdAt">): Transaction {
  return {
    organizationId: DEMO_CONTEXT.organizationId,
    referenceId: partial.id,
    updatedAt: partial.createdAt,
    amount: 100_000,
    currency: "IDR",
    fee: 2_900,
    net: 97_100,
    channel: "CARD",
    methodLabel: "Visa •••• 4242",
    customerName: "Test Customer",
    customerEmail: "test@example.com",
    description: "test",
    riskScore: 0,
    refundedAmount: 0,
    refundState: "NONE",
    refundRequest: null,
    events: [],
    ...partial,
  };
}

/** Install a fixed ledger and read it back through the public list API,
 *  evaluated at FIXED_NOW so band assertions never depend on the wall clock. */
async function withLedger(rows: Transaction[], filters: Parameters<typeof listTransactions>[1]) {
  // Rows are installed for the demo tenant only. `mode: "replace"` keeps this
  // suite's fixtures exact — and proves the scoped read is the thing under test,
  // because the demo partition is the only one a demo-scoped call can see.
  seedDemoLedgerForOrganization(DEMO_CONTEXT, { rows, mode: "replace" });
  return listTransactions(DEMO_CONTEXT, filters, { now: FIXED_NOW });
}

describe("SLA band derivation (Wave 4 ledger wiring)", () => {
  const now = new Date("2026-09-12T09:00:00.000Z");

  it("terminal rows carry no SLA — no invented clocks", async () => {
    expect(slaForTransaction({ status: "SUCCEEDED", createdAt: now.toISOString(), updatedAt: now.toISOString() })).toBeNull();
    expect(slaForTransaction({ status: "REFUNDED", createdAt: now.toISOString(), updatedAt: now.toISOString() })).toBeNull();
  });

  it.each([
    ["PENDING", "transaction_settlement"],
    ["PROCESSING", "transaction_settlement"],
    ["FAILED", "failed_payment"],
  ] as const)("maps %s to the %s policy", (status, entityType) => {
    expect(slaForTransaction({ status, createdAt: now.toISOString(), updatedAt: now.toISOString() })?.entityType).toBe(entityType);
  });

  it.each([
    ["NORMAL", 1],
    ["APPROACHING", 3.5],
    ["OVERDUE", 5],
    ["CRITICAL", 30],
  ] as const)("a PENDING row %s hours after creation lands in %s", (band, hours) => {
    const createdAt = new Date(now.getTime() - hours * HOUR).toISOString();
    const view = evaluateTransactionSla({ status: "PENDING", createdAt, updatedAt: createdAt }, now);
    expect(view.slaBand).toBe(band);
    expect(view.slaEntityType).toBe("transaction_settlement");
    expect(view.slaDueAt).toBeTruthy();
  });

  it("a FAILED row is triaged on the failed_payment clock from updatedAt", () => {
    const createdAt = new Date(now.getTime() - 10 * HOUR).toISOString();
    const failedAt = new Date(now.getTime() - 5 * HOUR).toISOString();
    const view = evaluateTransactionSla({ status: "FAILED", createdAt, updatedAt: failedAt }, now);
    expect(view.slaEntityType).toBe("failed_payment");
    expect(view.slaBand).toBe("OVERDUE");
    // Anchor is the failure instant, not creation: 5h elapsed of a 4h window.
    expect(view.slaAgeSeconds).toBe(5 * 3600);
  });

  it("an unparseable anchor degrades to 'no SLA', never to NORMAL", () => {
    const view = evaluateTransactionSla({ status: "PENDING", createdAt: "not-a-date", updatedAt: "not-a-date" }, now);
    expect(view.slaBand).toBeNull();
  });
});

describe("SLA ledger filter + sort (server-side)", () => {
  const now = new Date("2026-09-12T09:00:00.000Z");
  const iso = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * HOUR).toISOString();

  const ledger: Transaction[] = [
    tx({ id: "txn_settled", status: "SUCCEEDED", createdAt: iso(1) }),
    tx({ id: "txn_normal", status: "PENDING", createdAt: iso(1) }),
    tx({ id: "txn_approaching", status: "PROCESSING", createdAt: iso(3.5) }),
    tx({ id: "txn_overdue", status: "PENDING", createdAt: iso(5) }),
    tx({ id: "txn_critical", status: "PENDING", createdAt: iso(30) }),
    tx({ id: "txn_failed_overdue", status: "FAILED", createdAt: iso(10), updatedAt: iso(5) }),
  ];

  it("sla=OVERDUE returns exactly the OVERDUE rows — CRITICAL is a distinct band", async () => {
    const { rows, total, isFiltered } = await withLedger(ledger, { sla: "OVERDUE", pageSize: 50 });
    expect(total).toBe(2);
    expect(rows.map((r) => r.id).sort()).toEqual(["txn_failed_overdue", "txn_overdue"]);
    expect(isFiltered).toBe(true);
  });

  it("sla=CRITICAL isolates the escalation band", async () => {
    const { rows } = await withLedger(ledger, { sla: "CRITICAL", pageSize: 50 });
    expect(rows.map((r) => r.id)).toEqual(["txn_critical"]);
  });

  it("sla=NORMAL shows only open rows inside the window — never settled ones", async () => {
    const { rows } = await withLedger(ledger, { sla: "NORMAL", pageSize: 50 });
    expect(rows.map((r) => r.id)).toEqual(["txn_normal"]);
  });

  it("sla=APPROACHING shows the pre-due warning band", async () => {
    const { rows } = await withLedger(ledger, { sla: "APPROACHING", pageSize: 50 });
    expect(rows.map((r) => r.id)).toEqual(["txn_approaching"]);
  });

  it("sla=ALL is the unfiltered view and isFiltered stays false", async () => {
    const { total, isFiltered } = await withLedger(ledger, { sla: "ALL", pageSize: 50 });
    expect(total).toBe(6);
    expect(isFiltered).toBe(false);
  });

  it("sort=sla desc puts the most urgent band first, oldest within a band", async () => {
    const { rows } = await withLedger(ledger, { sla: "ALL", sort: "sla", direction: "desc", pageSize: 50 });
    expect(rows.map((r) => r.id)).toEqual([
      "txn_critical",
      // Both OVERDUE with a 5h age — compareSla ties and the sort is stable, so
      // ledger order decides: the pending row was seeded first.
      "txn_overdue",
      "txn_failed_overdue",
      "txn_approaching",
      "txn_normal",
      "txn_settled",
    ]);
  });

  it("sort=sla asc reverses to least-urgent first", async () => {
    const { rows } = await withLedger(ledger, { sla: "ALL", sort: "sla", direction: "asc", pageSize: 50 });
    expect(rows[rows.length - 1]?.slaBand).toBe("CRITICAL");
  });

  it("bands are evaluated against the injected instant, not the wall clock", async () => {
    const { rows } = await withLedger(ledger, { sla: "ALL", sort: "sla", direction: "desc", pageSize: 50 });
    expect(rows.some((r) => r.slaBand === "CRITICAL")).toBe(true);
    // Re-evaluate the same ledger 24h later: txn_normal (1h old, 4h window) is
    // then 25h past creation → 21h overdue, past the 20h critical threshold.
    // The clock moved, the bands followed.
    const later = new Date(now.getTime() + 24 * HOUR);
    const atLater = await listTransactions(DEMO_CONTEXT, { sla: "ALL", sort: "sla", direction: "desc", pageSize: 50 }, { now: later });
    expect(atLater.rows.find((r) => r.id === "txn_normal")?.slaBand).toBe("CRITICAL");
  });

  it("isFiltered flips on for every non-ALL band", async () => {
    for (const band of ["NORMAL", "APPROACHING", "OVERDUE", "CRITICAL"] as const) {
      const { isFiltered } = await withLedger(ledger, { sla: band, pageSize: 50 });
      expect(isFiltered, band).toBe(true);
    }
  });
});

describe("normalizeSlaFilter (?sla= contract)", () => {
  it("accepts the canonical vocabulary case-insensitively", () => {
    expect(normalizeSlaFilter("overdue")).toBe("OVERDUE");
    expect(normalizeSlaFilter(" Critical ")).toBe("CRITICAL");
    expect(normalizeSlaFilter("all")).toBe("ALL");
    expect(normalizeSlaFilter("normal")).toBe("NORMAL");
    expect(normalizeSlaFilter("approaching")).toBe("APPROACHING");
  });

  it("fails open to ALL on garbage, arrays take the first value", () => {
    expect(normalizeSlaFilter("bogus")).toBe("ALL");
    expect(normalizeSlaFilter(undefined)).toBe("ALL");
    expect(normalizeSlaFilter("")).toBe("ALL");
    expect(normalizeSlaFilter(["CRITICAL", "OVERDUE"])).toBe("CRITICAL");
    expect(normalizeSlaFilter("DROP TABLE")).toBe("ALL");
  });
});

describe("refundState ledger filter (JRN-003 queue)", () => {
  const now = new Date("2026-09-12T09:00:00.000Z");
  const iso = (h: number) => new Date(now.getTime() - h * HOUR).toISOString();

  it("refundState=AWAITING_APPROVAL isolates the dual-control queue", async () => {
    const awaiting = tx({ id: "txn_awaiting", status: "SUCCEEDED", createdAt: iso(2), refundState: "AWAITING_APPROVAL" });
    const ledger = [
      awaiting,
      tx({ id: "txn_clean", status: "SUCCEEDED", createdAt: iso(3) }),
      tx({ id: "txn_rejected", status: "SUCCEEDED", createdAt: iso(4), refundState: "REJECTED" }),
    ];
    const { rows, total } = await withLedger(ledger, { refundState: "AWAITING_APPROVAL", pageSize: 50 });
    expect(total).toBe(1);
    expect(rows[0]?.id).toBe("txn_awaiting");
    expect(rows[0]?.refundRequest).toBeNull(); // store row untouched by decoration
  });

  it("an unknown refundState value is impossible through the normalizer", () => {
    expect(normalizeRefundStateFilter("awaiting_approval")).toBe("AWAITING_APPROVAL");
    expect(normalizeRefundStateFilter("bogus")).toBe("ALL");
  });
});
