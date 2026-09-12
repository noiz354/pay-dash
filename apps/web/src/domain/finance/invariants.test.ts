import { describe, expect, it } from "vitest";

import { checkLedgerInvariants, type InvariantCode } from "./invariants";
import { emptySnapshot, type LedgerSnapshot, type Posting } from "./ledger";
import { minor } from "./money";

const ORG = "org-1";
const AS_OF = "2026-09-12T00:00:00.000Z";
const IDR = (units: number) => minor(units, "IDR");

function snapshot(overrides: Partial<LedgerSnapshot> = {}): LedgerSnapshot {
  return { ...emptySnapshot(ORG, "IDR", AS_OF), ...overrides };
}

function posting(id: string, groupId: string, side: "DEBIT" | "CREDIT", units: number, currency = "IDR"): Posting {
  return { id, groupId, account: side === "DEBIT" ? "cash" : "revenue", side, amount: minor(units, currency), occurredAt: AS_OF };
}

/** A realistic, fully consistent snapshot — the control case for every test below. */
function balancedSnapshot(): LedgerSnapshot {
  return snapshot({
    postings: [
      posting("p1", "g1", "DEBIT", 1_000_000),
      posting("p2", "g1", "CREDIT", 1_000_000),
    ],
    payments: [{ id: "pay_1", status: "SUCCEEDED", captured: IDR(1_000_000), createdAt: AS_OF }],
    refunds: [{ id: "ref_1", paymentId: "pay_1", status: "SUCCEEDED", amount: IDR(250_000), createdAt: AS_OF }],
    payouts: [{ id: "po_1", batchId: "b1", status: "PENDING", amount: IDR(300_000), createdAt: AS_OF }],
    balance: {
      opening: IDR(5_000_000),
      // 5_000_000 + 1_000_000 − 250_000 − 300_000
      available: IDR(5_450_000),
      reserved: IDR(300_000),
    },
    settledInflow: IDR(1_000_000),
    settledOutflow: IDR(250_000),
  });
}

function codes(report: ReturnType<typeof checkLedgerInvariants>): InvariantCode[] {
  return report.violations.map((v) => v.code);
}

describe("ledger invariant checker", () => {
  it("accepts an empty snapshot — the identity case", () => {
    const report = checkLedgerInvariants(emptySnapshot(ORG, "IDR", AS_OF));
    expect(report.ok).toBe(true);
    expect(report.fatalCount).toBe(0);
    expect(report.violations).toEqual([]);
  });

  it("accepts a fully consistent snapshot", () => {
    const report = checkLedgerInvariants(balancedSnapshot());
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("reports every violation rather than throwing on the first", () => {
    const broken = snapshot({
      postings: [posting("p1", "g1", "DEBIT", 100)], // unbalanced group
      balance: { opening: IDR(0), available: IDR(-5), reserved: IDR(0) }, // negative + wrong derivation
    });
    const report = checkLedgerInvariants(broken);
    expect(report.fatalCount).toBeGreaterThanOrEqual(3);
    expect(new Set(codes(report))).toEqual(new Set(["INV-L1", "INV-L4", "INV-L5"]));
  });

  describe("INV-L1 double entry", () => {
    it("flags a group whose debits and credits differ", () => {
      const report = checkLedgerInvariants(
        snapshot({
          postings: [posting("p1", "g1", "DEBIT", 1000), posting("p2", "g1", "CREDIT", 999)],
          balance: { opening: IDR(0), available: IDR(0), reserved: IDR(0) },
        }),
      );
      const v = report.violations.find((x) => x.code === "INV-L1");
      expect(v?.severity).toBe("FATAL");
      expect(v?.subject).toBe("group:g1");
      expect(v?.expected).toBe("1000 IDR");
      expect(v?.actual).toBe("999 IDR");
    });

    it("accepts a group with several postings per side", () => {
      const report = checkLedgerInvariants(
        snapshot({
          postings: [
            posting("p1", "g1", "DEBIT", 700),
            posting("p2", "g1", "DEBIT", 300),
            posting("p3", "g1", "CREDIT", 1000),
          ],
          balance: { opening: IDR(0), available: IDR(0), reserved: IDR(0) },
        }),
      );
      expect(report.violations.filter((v) => v.code === "INV-L1")).toEqual([]);
    });

    it("flags a negative posting amount — direction belongs to `side`", () => {
      const report = checkLedgerInvariants(
        snapshot({
          postings: [posting("p1", "g1", "DEBIT", -1000), posting("p2", "g1", "CREDIT", -1000)],
          balance: { opening: IDR(0), available: IDR(0), reserved: IDR(0) },
        }),
      );
      // The group balances arithmetically, but both amounts are negative.
      const negatives = report.violations.filter((v) => v.message.includes("negative"));
      expect(negatives).toHaveLength(2);
      expect(negatives[0].severity).toBe("FATAL");
    });

    it("balances each group independently", () => {
      const report = checkLedgerInvariants(
        snapshot({
          postings: [
            posting("p1", "g1", "DEBIT", 500),
            posting("p2", "g1", "CREDIT", 500),
            posting("p3", "g2", "DEBIT", 400),
            posting("p4", "g2", "CREDIT", 100),
          ],
          balance: { opening: IDR(0), available: IDR(0), reserved: IDR(0) },
        }),
      );
      const l1 = report.violations.filter((v) => v.code === "INV-L1");
      expect(l1).toHaveLength(1);
      expect(l1[0].subject).toBe("group:g2");
    });
  });

  describe("INV-L2 refunds never exceed capture", () => {
    it("flags an over-refund by a single minor unit", () => {
      const base = balancedSnapshot();
      const report = checkLedgerInvariants({
        ...base,
        refunds: [{ id: "ref_1", paymentId: "pay_1", status: "SUCCEEDED", amount: IDR(1_000_001), createdAt: AS_OF }],
      });
      const v = report.violations.find((x) => x.code === "INV-L2");
      expect(v?.severity).toBe("FATAL");
      expect(v?.message).toContain("exceed the captured amount by 1 IDR");
    });

    it("accepts a refund exactly equal to the capture", () => {
      const base = balancedSnapshot();
      const report = checkLedgerInvariants({
        ...base,
        refunds: [{ id: "ref_1", paymentId: "pay_1", status: "SUCCEEDED", amount: IDR(1_000_000), createdAt: AS_OF }],
      });
      expect(report.violations.filter((v) => v.code === "INV-L2")).toEqual([]);
    });

    it("sums multiple partial refunds against one payment", () => {
      const base = balancedSnapshot();
      const report = checkLedgerInvariants({
        ...base,
        refunds: [
          { id: "ref_1", paymentId: "pay_1", status: "SUCCEEDED", amount: IDR(600_000), createdAt: AS_OF },
          { id: "ref_2", paymentId: "pay_1", status: "SUCCEEDED", amount: IDR(600_000), createdAt: AS_OF },
        ],
      });
      expect(report.violations.find((v) => v.code === "INV-L2")?.actual).toBe("1200000 IDR");
    });

    it("ignores failed refunds — a retried refund is not an over-refund", () => {
      const base = balancedSnapshot();
      const report = checkLedgerInvariants({
        ...base,
        refunds: [
          { id: "ref_1", paymentId: "pay_1", status: "FAILED", amount: IDR(1_000_000), createdAt: AS_OF },
          { id: "ref_2", paymentId: "pay_1", status: "SUCCEEDED", amount: IDR(250_000), createdAt: AS_OF },
        ],
      });
      expect(report.violations.filter((v) => v.code === "INV-L2")).toEqual([]);
    });

    it("flags a refund pointing at a payment that is not in the snapshot", () => {
      const base = balancedSnapshot();
      const report = checkLedgerInvariants({
        ...base,
        refunds: [{ id: "ref_x", paymentId: "pay_missing", status: "SUCCEEDED", amount: IDR(1), createdAt: AS_OF }],
      });
      expect(report.violations.find((v) => v.code === "INV-L2")?.subject).toBe("payment:pay_missing");
    });
  });

  describe("INV-L3 payouts never exceed available funds", () => {
    it("flags committed payouts larger than opening + inflow", () => {
      const report = checkLedgerInvariants(
        snapshot({
          payouts: [{ id: "po_1", batchId: "b1", status: "PENDING", amount: IDR(10_000), createdAt: AS_OF }],
          balance: { opening: IDR(1_000), available: IDR(-4_000), reserved: IDR(10_000) },
          settledInflow: IDR(5_000),
        }),
      );
      const v = report.violations.find((x) => x.code === "INV-L3");
      expect(v?.severity).toBe("FATAL");
      expect(v?.actual).toBe("10000 IDR");
      expect(v?.expected).toBe("<= 6000 IDR");
    });

    it("ignores failed payouts — a rejected disbursement moved no money", () => {
      const report = checkLedgerInvariants(
        snapshot({
          payouts: [{ id: "po_1", batchId: "b1", status: "FAILED", amount: IDR(10_000), createdAt: AS_OF }],
          balance: { opening: IDR(1_000), available: IDR(1_000), reserved: IDR(0) },
        }),
      );
      expect(report.violations.filter((v) => v.code === "INV-L3")).toEqual([]);
    });
  });

  describe("INV-L4 balance derivation", () => {
    it("flags a reported available balance that the movements do not derive", () => {
      const base = balancedSnapshot();
      const report = checkLedgerInvariants({
        ...base,
        balance: { ...base.balance, available: IDR(9_999_999) },
      });
      const v = report.violations.find((x) => x.code === "INV-L4");
      expect(v?.severity).toBe("FATAL");
      expect(v?.expected).toBe("5450000 IDR");
      expect(v?.actual).toBe("9999999 IDR");
    });

    it("catches an off-by-one-minor-unit drift", () => {
      const base = balancedSnapshot();
      const report = checkLedgerInvariants({
        ...base,
        balance: { ...base.balance, available: IDR(5_450_001) },
      });
      expect(report.violations.some((v) => v.code === "INV-L4")).toBe(true);
    });
  });

  describe("INV-L5 non-negative balances", () => {
    it("flags a negative available balance", () => {
      const report = checkLedgerInvariants(
        snapshot({
          balance: { opening: IDR(0), available: IDR(-1), reserved: IDR(0) },
          settledOutflow: IDR(1),
        }),
      );
      expect(report.violations.find((v) => v.code === "INV-L5")?.severity).toBe("FATAL");
    });

    it("flags a negative reservation", () => {
      const report = checkLedgerInvariants(
        snapshot({
          balance: { opening: IDR(0), available: IDR(100), reserved: IDR(-100) },
        }),
      );
      expect(report.violations.some((v) => v.code === "INV-L5")).toBe(true);
    });
  });

  describe("INV-L6 no cross-currency aggregation", () => {
    it("flags an amount in a currency the snapshot does not hold", () => {
      const report = checkLedgerInvariants(
        snapshot({
          payments: [{ id: "pay_usd", status: "SUCCEEDED", captured: minor(1000, "USD"), createdAt: AS_OF }],
        }),
      );
      const v = report.violations.find((x) => x.code === "INV-L6");
      expect(v?.severity).toBe("FATAL");
      expect(v?.expected).toBe("IDR");
      expect(v?.actual).toBe("USD");
    });

    it("suppresses arithmetic checks when the shape is broken — no confusing downstream noise", () => {
      const report = checkLedgerInvariants(
        snapshot({
          payments: [{ id: "pay_usd", status: "SUCCEEDED", captured: minor(1000, "USD"), createdAt: AS_OF }],
          balance: { opening: IDR(0), available: IDR(123), reserved: IDR(0) }, // would also break INV-L4
        }),
      );
      expect(codes(report)).toEqual(["INV-L6"]);
    });
  });

  describe("INV-L7 terminal monotonicity", () => {
    it("flags a transition after a terminal state", () => {
      const report = checkLedgerInvariants(
        snapshot({
          transitions: [
            { subjectId: "op_1", from: "EXECUTING", to: "SUCCEEDED", at: "2026-09-10T00:00:00.000Z" },
            { subjectId: "op_1", from: "SUCCEEDED", to: "FAILED", at: "2026-09-11T00:00:00.000Z" },
          ],
        }),
      );
      const v = report.violations.find((x) => x.code === "INV-L7");
      expect(v?.severity).toBe("FATAL");
      expect(v?.subject).toBe("op_1");
      expect(v?.message).toContain("after reaching terminal SUCCEEDED");
    });

    it("evaluates by timestamp order, not array order", () => {
      const report = checkLedgerInvariants(
        snapshot({
          transitions: [
            { subjectId: "op_1", from: "SUCCEEDED", to: "FAILED", at: "2026-09-11T00:00:00.000Z" },
            { subjectId: "op_1", from: "EXECUTING", to: "SUCCEEDED", at: "2026-09-10T00:00:00.000Z" },
          ],
        }),
      );
      expect(report.violations.filter((v) => v.code === "INV-L7")).toHaveLength(1);
    });

    it("allows non-terminal progress and independent subjects", () => {
      const report = checkLedgerInvariants(
        snapshot({
          transitions: [
            { subjectId: "op_1", from: "DRAFT", to: "EXECUTING", at: "2026-09-10T00:00:00.000Z" },
            { subjectId: "op_1", from: "EXECUTING", to: "UNKNOWN", at: "2026-09-10T01:00:00.000Z" },
            { subjectId: "op_1", from: "UNKNOWN", to: "SUCCEEDED", at: "2026-09-10T02:00:00.000Z" },
            { subjectId: "op_2", from: "EXECUTING", to: "FAILED", at: "2026-09-10T03:00:00.000Z" },
          ],
        }),
      );
      expect(report.violations.filter((v) => v.code === "INV-L7")).toEqual([]);
    });
  });

  describe("INV-L8 integer minor units", () => {
    it("flags a fractional amount", () => {
      const report = checkLedgerInvariants(
        snapshot({
          // Bypass the `minor()` constructor the way a bad upstream mapper would.
          payments: [{ id: "pay_f", status: "SUCCEEDED", captured: { units: 0.1 + 0.2, currency: "IDR" }, createdAt: AS_OF }],
        }),
      );
      const v = report.violations.find((x) => x.code === "INV-L8");
      expect(v?.severity).toBe("FATAL");
      expect(v?.expected).toBe("integer minor units");
    });

    it("flags NaN", () => {
      const report = checkLedgerInvariants(
        snapshot({ balance: { opening: IDR(0), available: { units: Number.NaN, currency: "IDR" }, reserved: IDR(0) } }),
      );
      expect(report.violations.some((v) => v.code === "INV-L8")).toBe(true);
    });
  });

  describe("report shape", () => {
    it("counts violations per code for the SLI and the report table", () => {
      const report = checkLedgerInvariants(
        snapshot({
          postings: [posting("p1", "g1", "DEBIT", 1)],
          balance: { opening: IDR(0), available: IDR(-1), reserved: IDR(0) },
        }),
      );
      expect(report.byCode["INV-L1"]).toBe(1);
      expect(report.byCode["INV-L5"]).toBe(1);
      expect(report.byCode["INV-L2"]).toBe(0);
      expect(report.fatalCount).toBe(report.violations.length);
      expect(report.organizationId).toBe(ORG);
      expect(report.asOf).toBe(AS_OF);
    });

    it("is deterministic — the same snapshot yields the same report", () => {
      const s = balancedSnapshot();
      expect(JSON.stringify(checkLedgerInvariants(s))).toBe(JSON.stringify(checkLedgerInvariants(s)));
    });
  });
});
