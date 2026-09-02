import { beforeEach, describe, expect, it } from "vitest";
import { getAnalyticsSeries, listTransactions } from "./transactions";

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
    const series = await getAnalyticsSeries(days);
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
    const series = await getAnalyticsSeries(30);
    const { rows } = await listTransactions({ pageSize: 200, page: 1 });
    // The seeded ledger window is ~6.5 days, so nothing falls outside 30d.
    expect(rows.length).toBeGreaterThan(0);
    const ledgerTotal = rows.reduce((a, t) => a + t.amount, 0);
    const seriesTotal = series.reduce((a, p) => a + p.total, 0);
    expect(seriesTotal).toBe(ledgerTotal);
  });

  it("an empty ledger yields a zero series of the right length, not an error", async () => {
    // Wipe the seeded rows — the chart's empty state must be reachable
    // without a crash (the page maps an all-zero series to it).
    // Touch the store so the lazy seed runs, then wipe the rows.
    await listTransactions({ pageSize: 1, page: 1 });
    const g = globalThis as unknown as { __kineticTxStore: { rows: unknown[] } };
    g.__kineticTxStore.rows = [];
    const series = await getAnalyticsSeries(7);
    expect(series).toHaveLength(7);
    expect(series.every((p) => p.total === 0 && p.succeeded === 0 && p.failed === 0)).toBe(true);
  });
});
