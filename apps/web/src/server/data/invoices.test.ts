import { describe, it, expect, beforeEach } from "vitest";
import { updateMerchantProfile } from "@/server/data/settings";
import {
  getBillingSummary,
  getInvoice,
  getInvoiceLineItems,
  getInvoiceTimeline,
  getInvoiceTransactions,
  invoiceStatementCsv,
  invoicesToCsv,
  listInvoices,
  payInvoice,
  periodLabelFor,
} from "@/server/data/invoices";

beforeEach(() => {
  delete (globalThis as Record<string, unknown>).__kineticInvoiceStore;
});

describe("listInvoices", () => {
  it("returns the seeded prototype invoices plus ledger-derived months", async () => {
    const { rows, total } = await listInvoices({ pageSize: 100 });
    expect(total).toBeGreaterThanOrEqual(3);
    for (const id of ["INV-2023-08-4421", "INV-2023-09-5102", "INV-2023-07-3990"]) {
      expect(rows.some((r) => r.number === id)).toBe(true);
    }
    expect(rows.some((r) => r.source === "ledger")).toBe(true);
  });

  it("filters by status and by free text", async () => {
    const paid = await listInvoices({ status: "PAID", pageSize: 100 });
    expect(paid.rows.every((r) => r.status === "PAID")).toBe(true);
    expect(paid.isFiltered).toBe(true);

    const search = await listInvoices({ q: "4421", pageSize: 100 });
    expect(search.rows).toHaveLength(1);
    expect(search.rows[0].number).toBe("INV-2023-08-4421");
  });

  it("sorts by amount and by due date", async () => {
    const byAmount = await listInvoices({ sort: "amount", pageSize: 100 });
    const amounts = byAmount.rows.map((r) => r.amount);
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);

    const byDue = await listInvoices({ sort: "due", pageSize: 100 });
    const dues = byDue.rows.map((r) => r.dueAt);
    expect([...dues].sort()).toEqual(dues);
  });

  it("clamps out-of-range pages", async () => {
    const far = await listInvoices({ page: 999, pageSize: 5 });
    expect(far.page).toBe(far.pageCount);
  });

  it("labels each period in the prototype's format", () => {
    expect(periodLabelFor("2023-08-01T00:00:00.000Z", "2023-08-31T23:59:59.000Z")).toBe(
      "Aug 01, 2023 - Aug 31, 2023"
    );
  });
});

describe("getInvoice / line items / timeline", () => {
  it("resolves an invoice by id and by number", async () => {
    expect(await getInvoice("INV-2023-08-4421")).not.toBeNull();
    expect(await getInvoice("nope")).toBeNull();
  });

  it("line items always add up to the invoice total", async () => {
    const { rows } = await listInvoices({ pageSize: 100 });
    for (const inv of rows.slice(0, 5)) {
      const items = await getInvoiceLineItems(inv.id);
      expect(items.length).toBeGreaterThan(0);
      const sum = items.reduce((a, li) => a + li.amount, 0);
      // rounding tolerance of 1 minor unit per line item
      expect(Math.abs(sum - inv.amount)).toBeLessThanOrEqual(items.length);
    }
  });

  it("derived invoices only bill settled transactions inside their period", async () => {
    const { rows } = await listInvoices({ pageSize: 100 });
    const derived = rows.find((r) => r.source === "ledger");
    expect(derived).toBeDefined();
    const txns = await getInvoiceTransactions(derived!.id);
    expect(txns.length).toBe(derived!.transactionCount);
    for (const t of txns) {
      expect(["SUCCEEDED", "REFUNDED"]).toContain(t.status);
      const at = new Date(t.createdAt).getTime();
      expect(at).toBeGreaterThanOrEqual(new Date(derived!.periodStart).getTime());
      expect(at).toBeLessThanOrEqual(new Date(derived!.periodEnd).getTime());
    }
  });

  it("builds a chronological timeline that ends in a payment outcome", async () => {
    const events = await getInvoiceTimeline("INV-2023-08-4421");
    expect(events.length).toBeGreaterThanOrEqual(4);
    const times = events.map((e) => e.at);
    expect([...times].sort()).toEqual(times);
    expect(events.at(-1)?.kind).toBe("success");
  });
});

describe("payInvoice", () => {
  it("settles a payable invoice and returns a reference", async () => {
    const result = await payInvoice("INV-2023-09-5102", "Corporate card — Visa •••• 4242");
    expect(result).not.toBeNull();
    expect(result!.invoice.status).toBe("PAID");
    expect(result!.invoice.paidAt).toBeTruthy();
    expect(result!.reference).toMatch(/^PAY-/);
  });

  it("refuses to double-pay", async () => {
    await payInvoice("INV-2023-09-5102", "Bank transfer — Mandiri");
    await expect(payInvoice("INV-2023-09-5102", "Bank transfer — Mandiri")).rejects.toThrow(/already paid/i);
  });

  it("returns null for an unknown invoice", async () => {
    expect(await payInvoice("INV-NOPE", "Bank transfer — Mandiri")).toBeNull();
  });

  it("reduces the outstanding balance in the summary", async () => {
    const before = await getBillingSummary();
    await payInvoice("INV-2023-07-3990", "Bank transfer — Mandiri");
    const after = await getBillingSummary();
    expect(after.outstandingAmount).toBeLessThan(before.outstandingAmount);
    expect(after.overdueCount).toBeLessThan(before.overdueCount);
  });
});

describe("exports", () => {
  it("invoicesToCsv emits a header plus one row per invoice", async () => {
    const { rows } = await listInvoices({ pageSize: 5 });
    const lines = invoicesToCsv(rows).split("\n");
    expect(lines[0]).toContain("invoice_id");
    expect(lines).toHaveLength(rows.length + 1);
  });

  it("invoiceStatementCsv includes the header block and the line items", async () => {
    const csv = await invoiceStatementCsv("INV-2023-08-4421");
    expect(csv).toBeTruthy();
    expect(csv!).toContain("invoice");
    expect(csv!).toContain("line_item");
    expect(await invoiceStatementCsv("INV-NOPE")).toBeNull();
  });
});

describe("billing summary auto-debit (ADR-0018 — profile-driven, not a constant)", () => {
  it("follows the merchant profile switch", async () => {
    // Fresh settings store → seed value (autoDebit: true).
    delete (globalThis as Record<string, unknown>).__kineticSettingsStore;
    expect((await getBillingSummary()).autoDebitEnabled).toBe(true);

    await updateMerchantProfile({ autoDebit: false });
    expect((await getBillingSummary()).autoDebitEnabled).toBe(false);

    await updateMerchantProfile({ autoDebit: true });
    expect((await getBillingSummary()).autoDebitEnabled).toBe(true);
  });
});
