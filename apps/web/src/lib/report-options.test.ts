import { describe, expect, it } from "vitest";
import { getLedgerRows } from "@/server/data/transactions";
import { getPayoutBatches } from "@/server/data/payouts";
import { listCustomers } from "@/server/data/customers";
import {
  buildReportCsv,
  columnsFor,
  csvCell,
  CUSTOMER_COLUMNS,
  customersToReportRows,
  defaultSelection,
  parseAmountFilter,
  payoutsToReportRows,
  PAYOUT_COLUMNS,
  runQuery,
  transactionsToReportRows,
  TX_COLUMNS,
} from "@/lib/report-options";

const EMPTY_QUERY = { from: "", to: "", status: "", amountMin: null, amountMax: null };

describe("report row mappers (ADR-0020)", () => {
  it("maps every ledger row with real detail links and IDR display", () => {
    const txs = getLedgerRows();
    const rows = transactionsToReportRows(txs);
    expect(rows).toHaveLength(txs.length);
    expect(txs.length).toBeGreaterThan(0);
    const first = rows[0];
    expect(first.href).toBe(`/transactions/${txs[0].id}`);
    expect(first.values.amount.display).toContain("Rp");
    expect(first.values.amount.raw).toBe(txs[0].amount);
    expect(first.values.status.display).not.toBe(txs[0].status); // human label
    expect(first.values.status.raw).toBe(txs[0].status);
  });

  it("maps payout batches with the recipient total as the amount", () => {
    const batches = getPayoutBatches();
    const rows = payoutsToReportRows(batches);
    expect(rows).toHaveLength(batches.length);
    for (const [i, row] of rows.entries()) {
      const expectedTotal = batches[i].recipients.reduce((s, r) => s + r.amount, 0);
      expect(row.amount).toBe(expectedTotal);
      expect(row.values.total.raw).toBe(expectedTotal);
      expect(row.href).toBe(`/payouts/${batches[i].id}`);
    }
  });

  it("maps customers with lifetime value as the amount", async () => {
    const { rows: customers } = await listCustomers({ pageSize: 500 });
    const rows = customersToReportRows(customers);
    expect(rows).toHaveLength(customers.length);
    for (const [i, row] of rows.entries()) {
      expect(row.amount).toBe(customers[i].lifetimeValue);
      expect(row.href).toBe(`/customers/${customers[i].id}`);
      expect(row.values.success_rate.display).toMatch(/%$/);
    }
  });
});

describe("runQuery", () => {
  const dataset = () => ({
    source: "transactions" as const,
    columns: TX_COLUMNS,
    statusOptions: [],
    amountLabel: "Amount",
    rows: transactionsToReportRows(getLedgerRows()),
  });

  it("returns everything for an empty query", () => {
    const rows = runQuery(dataset(), EMPTY_QUERY);
    expect(rows).toHaveLength(getLedgerRows().length);
  });

  it("filters by status, amount bounds and date range", () => {
    const all = dataset().rows;
    const refunded = runQuery(dataset(), { ...EMPTY_QUERY, status: "REFUNDED" });
    expect(refunded.length).toBe(all.filter((r) => r.status === "REFUNDED").length);
    expect(refunded.length).toBeGreaterThan(0);
    expect(refunded.every((r) => r.status === "REFUNDED")).toBe(true);

    const big = runQuery(dataset(), { ...EMPTY_QUERY, amountMin: 10_000_000 });
    expect(big.every((r) => r.amount >= 10_000_000)).toBe(true);
    expect(big.length).toBeLessThan(all.length);

    const dates = all.map((r) => r.date).sort();
    const narrow = runQuery(dataset(), {
      ...EMPTY_QUERY,
      from: dates[0].slice(0, 10),
      to: dates[0].slice(0, 10),
    });
    expect(narrow.length).toBeGreaterThan(0);
    expect(narrow.length).toBeLessThan(all.length);
  });

  it("yields an empty set — not an error — when nothing matches", () => {
    const rows = runQuery(dataset(), { ...EMPTY_QUERY, amountMin: Number.MAX_SAFE_INTEGER });
    expect(rows).toEqual([]);
  });
});

describe("columns + csv", () => {
  it("default selection keeps the core columns, not all of them", () => {
    const selected = defaultSelection(TX_COLUMNS);
    const cols = columnsFor({ columns: TX_COLUMNS }, selected);
    const keys = cols.map((c) => c.key);
    expect(keys).toContain("reference_id");
    expect(keys).toContain("status");
    expect(keys).not.toContain("fee");
    expect(keys).not.toContain("channel");
    expect(columnsFor({ columns: PAYOUT_COLUMNS }, defaultSelection(PAYOUT_COLUMNS))).toHaveLength(
      PAYOUT_COLUMNS.filter((c) => c.defaultSelected).length
    );
    expect(columnsFor({ columns: CUSTOMER_COLUMNS }, defaultSelection(CUSTOMER_COLUMNS))).toHaveLength(
      CUSTOMER_COLUMNS.filter((c) => c.defaultSelected).length
    );
  });

  it("builds a csv with exactly the selected columns and raw values", () => {
    const rows = transactionsToReportRows(getLedgerRows()).slice(0, 3);
    const selected = { reference_id: true, status: true, fee: false, amount: false };
    const csv = buildReportCsv(
      { columns: TX_COLUMNS },
      rows,
      Object.fromEntries(TX_COLUMNS.map((c) => [c.key, c.key === "reference_id" || c.key === "status" ? true : false]))
    );
    void selected;
    const [header, ...body] = csv.split("\n");
    expect(header).toBe("reference_id,status");
    expect(body).toHaveLength(3);
    expect(body[0].split(",").length).toBe(2);
    expect(body[0].startsWith(rows[0].id)).toBe(true);
  });

  it("quotes csv cells containing commas, quotes or newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(1234)).toBe("1234");
    expect(csvCell("has, comma")).toBe('"has, comma"');
    expect(csvCell('has "quote"')).toBe('"has ""quote"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("parseAmountFilter treats empty and junk as no bound", () => {
    expect(parseAmountFilter("")).toBeNull();
    expect(parseAmountFilter("   ")).toBeNull();
    expect(parseAmountFilter("2500000")).toBe(2_500_000);
    expect(parseAmountFilter("abc")).toBeNull();
  });
});
