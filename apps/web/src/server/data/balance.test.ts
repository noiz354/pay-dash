import { beforeEach, describe, expect, it } from "vitest";
import {
  getBalanceOverview,
  getBalanceTrend,
  listMovements,
  movementsToCsv,
  OPENING_BALANCE,
  topUpBalance,
  withdrawBalance,
} from "./balance";
import { listBatches } from "./payouts";

function resetAllStores() {
  const g = globalThis as unknown as {
    __kineticTxStore?: unknown;
    __kineticPayoutStore?: unknown;
    __kineticBalanceStore?: unknown;
  };
  g.__kineticTxStore = undefined;
  g.__kineticPayoutStore = undefined;
  g.__kineticBalanceStore = undefined;
}

beforeEach(resetAllStores);

// Seeded figures — the ledger seed is deterministic (mulberry32(20260901)):
// 33 succeeded (net 760,489,170), 2 refunded (52,315,000), 7 in flight
// (net 162,079,885), 4 failed; the payout store pays out 85,600,000 and
// reserves 59,790,890 (5 pending recipients); two top-ups add 650,000,000.
const SEED_NET_SETTLED = 760_489_170;
const SEED_REFUNDED = 52_315_000;
const SEED_PENDING_NET = 162_079_885;
const SEED_PAID_WITHDRAWALS = 85_600_000;
const SEED_RESERVED = 59_790_890;
const SEED_TOPUPS = 650_000_000;

describe("getBalanceOverview", () => {
  it("derives available from ledger + payouts + top-ups", async () => {
    const o = await getBalanceOverview();
    expect(o.available).toBe(
      OPENING_BALANCE + SEED_NET_SETTLED - SEED_REFUNDED + SEED_TOPUPS - SEED_PAID_WITHDRAWALS - SEED_RESERVED
    );
    expect(o.pendingSettlements).toBe(SEED_PENDING_NET);
    expect(o.reserved).toBe(SEED_RESERVED);
    expect(o.currency).toBe("IDR");
    expect(o.lastPayoutAt).toBe("2026-08-26T02:04:00.000Z");
  });

  it("reconciles with the movement ledger", async () => {
    const { rows } = await listMovements({ pageSize: 1000 });
    let total = OPENING_BALANCE;
    for (const m of rows) {
      if (m.status === "SETTLED") total += m.amount;
      else if (m.status === "PENDING" && m.type === "WITHDRAWAL") total += m.amount;
    }
    expect(total).toBe((await getBalanceOverview()).available);
  });

  it("excludes failed withdrawals from the balance", async () => {
    const failed = (await listMovements({ status: "FAILED", pageSize: 100 })).rows;
    // Batch BATCH-2026-08-012 has one failed and one returned recipient.
    expect(failed.length).toBe(2);
    expect(failed.every((m) => m.type === "WITHDRAWAL")).toBe(true);
    const o = await getBalanceOverview();
    expect(o.available).toBeGreaterThanOrEqual(OPENING_BALANCE);
  });
});

describe("listMovements", () => {
  it("derives 59 movements from the seed", async () => {
    const { total, rows } = await listMovements({ pageSize: 100 });
    expect(total).toBe(59);
    // 40 settlements (33 settled + 7 pending), 2 refunds, 15 withdrawals, 2 top-ups
    expect(rows.filter((m) => m.type === "SETTLEMENT").length).toBe(40);
    expect(rows.filter((m) => m.type === "REFUND").length).toBe(2);
    expect(rows.filter((m) => m.type === "WITHDRAWAL").length).toBe(15);
    expect(rows.filter((m) => m.type === "TOP_UP").length).toBe(2);
  });

  it("sorts newest first by default and by absolute amount on request", async () => {
    const { rows } = await listMovements({ pageSize: 100 });
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].at >= rows[i].at).toBe(true);
    const byAmount = await listMovements({ sort: "amount", pageSize: 100 });
    for (let i = 1; i < byAmount.rows.length; i++) {
      expect(Math.abs(byAmount.rows[i - 1].amount)).toBeGreaterThanOrEqual(Math.abs(byAmount.rows[i].amount));
    }
  });

  it("filters by type, status, range and free text", async () => {
    expect((await listMovements({ type: "WITHDRAWAL" })).total).toBe(15);
    const topups = await listMovements({ type: "TOP_UP" });
    expect(topups.rows.every((m) => m.status === "SETTLED" && m.amount > 0)).toBe(true);
    expect(topups.rows.every((m) => m.link === null)).toBe(true);

    const pending = await listMovements({ status: "PENDING" });
    // 7 pending settlements + 5 reserved withdrawals
    expect(pending.total).toBe(12);

    const recent = await listMovements({ range: "7d" });
    expect(recent.total).toBeLessThan(59);
    expect(recent.isFiltered).toBe(true);

    expect((await listMovements({ q: "bca virtual account" })).total).toBeGreaterThan(0);
    expect((await listMovements({ q: "no-such-thing" })).total).toBe(0);
    expect((await listMovements({ q: "no-such-thing" })).isFiltered).toBe(true);
  });

  it("links ledger rows to transactions and payout rows to batches", async () => {
    const { rows } = await listMovements({ pageSize: 100 });
    const settlement = rows.find((m) => m.type === "SETTLEMENT")!;
    expect(settlement.link).toBe(`/transactions/${settlement.reference}`);
    const withdrawal = rows.find((m) => m.type === "WITHDRAWAL")!;
    expect(withdrawal.link).toBe(`/payouts/${withdrawal.reference}`);
  });

  it("clamps an out-of-range page", async () => {
    const result = await listMovements({ page: 99, pageSize: 10 });
    expect(result.page).toBe(result.pageCount);
    expect(result.rows.length).toBeGreaterThan(0);
  });
});

describe("topUpBalance", () => {
  it("adds exactly the entered amount and records a settled movement", async () => {
    const before = await getBalanceOverview();
    const result = await topUpBalance({ amount: 25_000_000, method: "BCA Virtual Account" });
    const after = await getBalanceOverview();

    expect(result.available).toBe(before.available + 25_000_000);
    expect(after.available).toBe(before.available + 25_000_000);
    expect(result.movement.status).toBe("SETTLED");
    expect(result.movement.type).toBe("TOP_UP");
    expect(result.movement.amount).toBe(25_000_000);

    const { rows } = await listMovements({ type: "TOP_UP", pageSize: 100 });
    expect(rows[0].label).toBe("Top up — BCA Virtual Account");
  });

  it("shows up in the 30-day trend on the current day", async () => {
    const before = await getBalanceTrend(30);
    const amount = 12_345_000;
    await topUpBalance({ amount, method: "Card" });
    const after = await getBalanceTrend(30);
    expect(after.length).toBe(30);
    expect(after[after.length - 1].ending).toBe(before[before.length - 1].ending + amount);
    expect(after[after.length - 1].inflow).toBeGreaterThanOrEqual(amount);
  });
});

describe("withdrawBalance", () => {
  it("routes through the batch flow: one single-recipient batch, paid immediately", async () => {
    const before = await getBalanceOverview();
    const result = await withdrawBalance({ amount: 1_000_000, accountId: "acct_bca_1234" });

    expect(result.paid).toBe(true);
    expect(result.batchId).toMatch(/^BATCH-/);
    expect(result.available).toBe(before.available - 1_000_000);
    expect((await getBalanceOverview()).available).toBe(before.available - 1_000_000);

    // The batch is real payout history.
    const batches = await listBatches({ q: result.batchId });
    expect(batches.total).toBe(1);
    expect(batches.rows[0].name).toBe("Withdrawal to Bank Central Asia **** 1234");

    // And the movement points back at it.
    const { rows } = await listMovements({ q: result.batchId, pageSize: 100 });
    expect(rows.length).toBe(1);
    expect(rows[0].type).toBe("WITHDRAWAL");
    expect(rows[0].status).toBe("SETTLED");
    expect(rows[0].amount).toBe(-1_000_000);
    expect(rows[0].link).toBe(`/payouts/${result.batchId}`);
  });

  it("validates destination before funds: unknown, unverified, then over-balance", async () => {
    const overview = await getBalanceOverview();
    await expect(withdrawBalance({ amount: 1_000_000, accountId: "acct_nope" })).rejects.toThrow(
      /does not exist/
    );
    await expect(
      withdrawBalance({ amount: 1_000_000, accountId: "acct_bni_4420" })
    ).rejects.toThrow(/not verified yet/);
    await expect(
      withdrawBalance({ amount: overview.available + 1, accountId: "acct_bca_1234" })
    ).rejects.toThrow(/exceeds/);
    // Nothing moved.
    expect((await getBalanceOverview()).available).toBe(overview.available);
    expect((await listBatches()).total).toBe(5);
  });
});

// Same rules as getBalanceOverview: settled movements count, reserved
// withdrawals count at creation, pending settlements wait, failed rows
// move nothing.
function effect(m: { status: string; type: string; amount: number }): number {
  if (m.status === "SETTLED") return m.amount;
  if (m.status === "PENDING" && m.type === "WITHDRAWAL") return m.amount;
  return 0;
}

describe("getBalanceTrend", () => {
  it("returns 30 daily points ending at the current available balance", async () => {
    const trend = await getBalanceTrend(30);
    const overview = await getBalanceOverview();
    expect(trend.length).toBe(30);
    expect(trend[trend.length - 1].ending).toBe(overview.available);
  });

  it("starts from the balance held when the window opened", async () => {
    const { rows } = await listMovements({ pageSize: 1000 });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const windowStart = today.getTime() - 29 * 24 * 60 * 60 * 1000;
    let running = OPENING_BALANCE;
    for (const m of rows) {
      if (new Date(m.at).getTime() < windowStart) running += effect(m);
    }
    const trend = await getBalanceTrend(30);
    expect(trend[0].ending).toBe(running);
    // Days before the first movement in the window are flat.
    const firstActive = trend.findIndex((p) => p.inflow > 0 || p.outflow > 0);
    for (let i = 1; i < firstActive; i++) expect(trend[i].ending).toBe(trend[0].ending);
  });

  it("books inflow and outflow so the window nets to the ending delta", async () => {
    const trend = await getBalanceTrend(30);
    const inflow = trend.reduce((s, p) => s + p.inflow, 0);
    const outflow = trend.reduce((s, p) => s + p.outflow, 0);
    expect(trend[trend.length - 1].ending - trend[0].ending).toBe(inflow - outflow);
  });
});

describe("movementsToCsv", () => {
  it("emits a header plus one row per movement, escaping commas", async () => {
    const { rows } = await listMovements({ pageSize: 100 });
    const csv = movementsToCsv(rows);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,at,type,status,label,reference,link,amount,currency,note");
    expect(lines.length).toBe(rows.length + 1);
    // Top-up labels use an em-dash; notes with commas must be quoted.
    expect(lines.every((l) => l.includes(","))).toBe(true);
  });
});
