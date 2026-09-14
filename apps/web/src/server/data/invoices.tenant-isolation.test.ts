// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { TenantIsolationError } from "@/domain/security/tenant";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { __resetTenantDenials, listTenantDenials } from "@/server/services/tenant-denial";
import { seedDemoLedgerForOrganization } from "@/server/data/transactions";
import {
  getBillingSummary,
  getInvoice,
  getInvoiceLineItems,
  getInvoiceTimeline,
  getInvoiceTransactions,
  invoiceStatementCsv,
  listInvoices,
  payInvoice,
} from "./invoices";

/**
 * Wave 7D Q1 — Invoices tenant isolation, target-API tests (B-7..B-13, spec §5).
 *
 * Invariant: **Org A cannot list, open, export, or pay an invoice of Org B —
 * even knowing the id exactly.** Invoices are *derived* from the ledger (one
 * calendar month of fees), so the derivation itself has to be scoped: an
 * aggregate computed over everybody's rows is a leak even when the rows are
 * filtered afterwards. And an invoice id is a month key (`INV-2026-01-LEDGER`),
 * which two tenants can hold at once — the composite key `(organizationId, id)`
 * is what makes them different invoices (spec P-10).
 *
 * `payInvoice` is a money mutation, so B-13 pins *order*: the tenant check runs
 * before any write, and a refused pay leaves every store untouched (7B M8 /
 * U-13b precedent — an order claim needs a pin, not a review).
 *
 * RED on `af18cc4`: `invoices.ts` accepts no tenant (P-3..P-5) and reads the
 * ledger through the process-wide quarantine (`legacyListTransactions("invoices")`).
 */

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA: OrganizationContext = parseOrganizationContext({ organizationId: ORG_A });
const ctxB: OrganizationContext = parseOrganizationContext({ organizationId: ORG_B });
const ctxDemo: OrganizationContext = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });

/** The demo tenant's payable prototype invoice (PENDING, seeds are demo-owned). */
const DEMO_SEED_PAYABLE = "INV-2023-09-5102";

function resetStores() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticInvoiceStore;
  delete g.__kineticSubscriptionStore;
  delete g.__kineticTxStore;
  __resetTenantDenials();
}

beforeEach(() => {
  resetStores();
});

function row(id: string, createdAt: string, amount: number, fee: number) {
  return {
    id,
    createdAt,
    amount,
    fee,
    net: amount - fee,
    status: "SUCCEEDED" as const,
    currency: "IDR",
    channel: "CARD" as const,
    customerName: `${id} buyer`,
    customerEmail: `${id}@example.com`,
  };
}

/**
 * A: one settled row in 2026-01 (fee 29,000) and one in 2026-03 (fee 10,000).
 * B: two settled rows in 2026-02 (fees 50,000) and one in 2026-03 (fee 77,000).
 * 2026-03 is the deliberate id collision: both tenants hold `INV-2026-03-LEDGER`.
 */
function seedTwoTenants() {
  seedDemoLedgerForOrganization(ctxA, {
    mode: "replace",
    rows: [
      row("txn_a_jan", "2026-01-15T10:00:00.000Z", 1_000_000, 29_000),
      row("txn_a_mar", "2026-03-10T10:00:00.000Z", 300_000, 10_000),
    ],
  });
  seedDemoLedgerForOrganization(ctxB, {
    mode: "replace",
    rows: [
      row("txn_b_feb_1", "2026-02-05T10:00:00.000Z", 900_000, 30_000),
      row("txn_b_feb_2", "2026-02-20T10:00:00.000Z", 700_000, 20_000),
      row("txn_b_mar", "2026-03-11T10:00:00.000Z", 2_000_000, 77_000),
    ],
  });
}

describe("B-7 Org A lists → only A's invoices", () => {
  it("the derived aggregate is computed from A's ledger rows alone", async () => {
    seedTwoTenants();

    const asA = await listInvoices(ctxA, { pageSize: 100 });
    const idsA = asA.rows.map((i) => i.id);
    expect(idsA).toContain("INV-2026-01-LEDGER");
    expect(idsA).not.toContain("INV-2026-02-LEDGER");
    expect(asA.rows.every((i) => i.organizationId === ORG_A)).toBe(true);

    const janA = asA.rows.find((i) => i.id === "INV-2026-01-LEDGER")!;
    expect(janA.amount).toBe(29_000);
    expect(janA.transactionCount).toBe(1);
    expect(janA.processedVolume).toBe(1_000_000);

    const asB = await listInvoices(ctxB, { pageSize: 100 });
    const febB = asB.rows.find((i) => i.id === "INV-2026-02-LEDGER")!;
    expect(febB.amount).toBe(50_000);
    expect(febB.organizationId).toBe(ORG_B);
    expect(asB.rows.map((i) => i.id)).not.toContain("INV-2026-01-LEDGER");
  });

  it("the prototype seeds belong to the demo tenant only", async () => {
    seedTwoTenants();
    const asA = await listInvoices(ctxA, { pageSize: 100 });
    expect(asA.rows.map((i) => i.id)).not.toContain(DEMO_SEED_PAYABLE);
    const asDemo = await listInvoices(ctxDemo, { pageSize: 100 });
    expect(asDemo.rows.map((i) => i.id)).toContain(DEMO_SEED_PAYABLE);
  });
});

describe("B-8 the same month in two tenants is two invoices (composite key)", () => {
  it("`INV-2026-03-LEDGER` resolves per owner with per-owner amounts", async () => {
    seedTwoTenants();

    const inA = await getInvoice(ctxA, "INV-2026-03-LEDGER");
    const inB = await getInvoice(ctxB, "INV-2026-03-LEDGER");
    expect(inA?.amount).toBe(10_000);
    expect(inB?.amount).toBe(77_000);
    expect(inA?.organizationId).toBe(ORG_A);
    expect(inB?.organizationId).toBe(ORG_B);
    expect(inA?.transactionCount).toBe(1);
    expect(inB?.transactionCount).toBe(1);
  });
});

describe("B-9 detail + derived readers → foreign is null/empty", () => {
  it("B's month is null for A and byte-identical to an unknown id", async () => {
    seedTwoTenants();

    expect(await getInvoice(ctxA, "INV-2026-02-LEDGER")).toBeNull();
    expect(await getInvoice(ctxA, "INV-1999-01-LEDGER")).toBeNull();
    expect((await getInvoice(ctxB, "INV-2026-02-LEDGER"))?.amount).toBe(50_000);
  });

  it("transactions, line items and timeline of a foreign invoice are empty for A", async () => {
    seedTwoTenants();

    expect(await getInvoiceTransactions(ctxA, "INV-2026-02-LEDGER")).toHaveLength(0);
    expect(await getInvoiceLineItems(ctxA, "INV-2026-02-LEDGER")).toHaveLength(0);
    expect(await getInvoiceTimeline(ctxA, "INV-2026-02-LEDGER")).toHaveLength(0);

    // The same readers over A's own month do return content (not trivially empty).
    const own = await getInvoiceTransactions(ctxA, "INV-2026-01-LEDGER");
    expect(own).toHaveLength(1);
    expect(own[0]!.id).toBe("txn_a_jan");
    expect(own.every((t) => t.organizationId === ORG_A)).toBe(true);
    expect((await getInvoiceLineItems(ctxA, "INV-2026-01-LEDGER")).length).toBeGreaterThan(0);
    expect((await getInvoiceTimeline(ctxA, "INV-2026-01-LEDGER")).length).toBeGreaterThan(0);
    expect((await getInvoiceTimeline(ctxB, "INV-2026-01-LEDGER")).length).toBe(0);
  });

  it("a foreign statement CSV is null, an own one is not", async () => {
    seedTwoTenants();
    expect(await invoiceStatementCsv(ctxA, "INV-2026-02-LEDGER")).toBeNull();
    const own = await invoiceStatementCsv(ctxA, "INV-2026-01-LEDGER");
    expect(own).toContain("INV-2026-01-LEDGER");
    expect(own).not.toMatch(/organization|org_beta/i);
  });
});

describe("B-10 filters, ranges and sorts stay inside the tenant", () => {
  it("status/range/q never widen the predicate to another tenant", async () => {
    seedTwoTenants();

    const overdueA = await listInvoices(ctxA, { status: "OVERDUE", pageSize: 100 });
    expect(overdueA.rows.every((i) => i.organizationId === ORG_A)).toBe(true);
    expect(overdueA.rows.map((i) => i.id)).not.toContain("INV-2026-02-LEDGER");

    const qB = await listInvoices(ctxA, { q: "2026-02", pageSize: 100 });
    expect(qB.total).toBe(0);

    for (const range of ["3m", "6m", "12m", "all"] as const) {
      const page = await listInvoices(ctxA, { range, pageSize: 100 });
      expect(page.rows.every((i) => i.organizationId === ORG_A)).toBe(true);
    }
    for (const sort of ["recent", "amount", "due"] as const) {
      const page = await listInvoices(ctxB, { sort, pageSize: 5 });
      expect(page.rows.every((i) => i.organizationId === ORG_B)).toBe(true);
    }
  });
});

describe("B-11 the billing summary aggregates one tenant", () => {
  it("outstanding totals are the caller's, not the process's", async () => {
    seedTwoTenants();

    const sumA = await getBillingSummary(ctxA);
    const sumB = await getBillingSummary(ctxB);
    const rowsA = (await listInvoices(ctxA, { pageSize: 100 })).rows;
    const payableA = rowsA.filter((i) => i.status === "PENDING" || i.status === "OVERDUE");

    expect(sumA.outstandingAmount).toBe(payableA.reduce((a, i) => a + i.amount, 0));
    expect(sumA.outstandingCount).toBe(payableA.length);
    // A holds 29,000 + 10,000 of fees; B holds 50,000 + 77,000. Neither total
    // may contain the other's rows.
    expect(sumA.outstandingAmount).toBeLessThan(sumB.outstandingAmount + sumA.outstandingAmount);
    expect(sumA.outstandingAmount).not.toBe(sumA.outstandingAmount + sumB.outstandingAmount);
  });
});

describe("B-12 payInvoice is partition-bound", () => {
  it("A can pay A's own overdue invoice", async () => {
    seedTwoTenants();

    const result = await payInvoice(ctxA, "INV-2026-01-LEDGER", "Bank transfer — Mandiri");
    expect(result?.invoice.status).toBe("PAID");
    expect(result?.reference).toMatch(/^PAY-/);
    expect((await getInvoice(ctxA, "INV-2026-01-LEDGER"))?.status).toBe("PAID");
    // B's own invoice for a different month is untouched by A's payment.
    expect((await getInvoice(ctxB, "INV-2026-02-LEDGER"))?.status).not.toBe("PAID");
  });

  it("paying twice is a status error, not a second charge", async () => {
    seedTwoTenants();
    await payInvoice(ctxA, "INV-2026-01-LEDGER", "Bank transfer — Mandiri");
    await expect(payInvoice(ctxA, "INV-2026-01-LEDGER", "Bank transfer — Mandiri")).rejects.toThrow(
      /already paid/i,
    );
  });

  it("an id that exists nowhere is null (no throw, no write)", async () => {
    seedTwoTenants();
    expect(await payInvoice(ctxA, "INV-1999-01-LEDGER", "Bank transfer — Mandiri")).toBeNull();
  });

  /**
   * The collision case (spec P-10): 2026-03 exists in *both* partitions, so the
   * invoice id alone is not a key. Settling A's March statement must not settle
   * B's — and must not even be *read* as settled through B's overlay. This is
   * what makes the payment record composite `(organizationId, invoiceId)`
   * rather than a process-wide `payments[id]`.
   */
  it("a colliding month id settles one tenant's invoice only", async () => {
    seedTwoTenants();
    const id = "INV-2026-03-LEDGER";

    // Sanity: the same id is two different bills (A's fee 10,000 / B's 77,000).
    expect((await getInvoice(ctxA, id))?.amount).toBe(10_000);
    expect((await getInvoice(ctxB, id))?.amount).toBe(77_000);

    const result = await payInvoice(ctxA, id, "Bank transfer — Mandiri");
    expect(result?.invoice.status).toBe("PAID");
    expect(result?.invoice.amount).toBe(10_000);

    // A's copy is settled; B's is untouched — status, paidAt and method alike.
    expect((await getInvoice(ctxA, id))?.status).toBe("PAID");
    const bCopy = await getInvoice(ctxB, id);
    expect(bCopy?.status).not.toBe("PAID");
    expect(bCopy?.paidAt).toBeNull();
    expect(bCopy?.paymentMethod).toBeNull();
    // And B's payable list still contains it, so B's balance is unchanged.
    expect((await listInvoices(ctxB, { status: "PAID", pageSize: 100 })).total).toBe(0);
    expect((await getBillingSummary(ctxB)).outstandingAmount).toBe(77_000 + 50_000);
  });
});

describe("B-13 order pin — the tenant check runs before any ledger/payment write", () => {
  it("a cross-tenant pay throws `cross-tenant` and leaves every store untouched", async () => {
    seedTwoTenants();
    const before = await getInvoice(ctxDemo, DEMO_SEED_PAYABLE);
    expect(before?.status).toBe("PENDING");

    // Same actor, another tenant's invoice, id known exactly.
    await expect(payInvoice(ctxB, DEMO_SEED_PAYABLE, "Bank transfer — Mandiri")).rejects.toThrow(
      /cross-tenant/i,
    );
    await expect(payInvoice(ctxB, DEMO_SEED_PAYABLE, "Bank transfer — Mandiri")).rejects.toBeInstanceOf(
      TenantIsolationError,
    );

    // The money never moved: the owner's invoice is still payable/unpaid.
    expect((await getInvoice(ctxDemo, DEMO_SEED_PAYABLE))?.status).toBe("PENDING");
    expect((await getInvoice(ctxDemo, DEMO_SEED_PAYABLE))?.paidAt).toBeNull();
    // And the refusal is visible to operators (denial sink), not silent.
    const denials = listTenantDenials().filter((d) => d.surface === "server/data/invoices.payInvoice");
    expect(denials.length).toBeGreaterThan(0);
    expect(denials[0]!.actorOrg).toBe(ORG_B);
    expect(denials[0]!.requestedOrg).toBe(DEFAULT_DEMO_ORG);
    // The denial record carries ids only — never an amount, method or period
    // label (the sink's own contract: surface, org ids, resource id, actor).
    expect(denials[0]!.resourceId).toBe(DEMO_SEED_PAYABLE);
    expect(JSON.stringify(denials[0])).not.toMatch(/Mandiri|13050000|13_050_000|periodLabel|processedVolume/i);

    // The order pin, made observable in *both* directions: nothing was recorded
    // in the owner's partition (the money never moved — asserted above) and
    // nothing in the actor's either. A write-before-check leaves exactly that
    // stray record, and with a colliding month id (`INV-2026-03-LEDGER` exists
    // in two partitions) a stray key can later surface as a settled invoice the
    // tenant never paid. Test files are the one reader allowed to see the slot.
    const slot = (
      globalThis as unknown as {
        __kineticInvoiceStore?: { tenants?: Map<string, { payments: Record<string, unknown> }> };
      }
    ).__kineticInvoiceStore;
    for (const [, partition] of slot?.tenants ?? new Map<string, { payments: Record<string, unknown> }>()) {
      expect(Object.keys(partition.payments), "a refused pay must record nothing anywhere").not.toContain(
        DEMO_SEED_PAYABLE,
      );
    }
  });

  it("an unattributable foreign month resolves to not-found and still writes nothing", async () => {
    seedTwoTenants();
    // `INV-2026-02-LEDGER` exists only in B. A cannot be told it exists.
    expect(await payInvoice(ctxA, "INV-2026-02-LEDGER", "Bank transfer — Mandiri")).toBeNull();
    expect((await getInvoice(ctxB, "INV-2026-02-LEDGER"))?.status).not.toBe("PAID");
    expect((await getInvoice(ctxB, "INV-2026-02-LEDGER"))?.paidAt).toBeNull();
    // A's own partitions gained nothing either.
    const asA = await listInvoices(ctxA, { status: "PAID", pageSize: 100 });
    expect(asA.total).toBe(0);
  });
});

describe("B-13b no context, no tenant", () => {
  it("every invoice entry point refuses a missing ctx", async () => {
    seedTwoTenants();
    // @ts-expect-error — a missing ctx must not be callable where it counts
    await expect(listInvoices({ pageSize: 10 })).rejects.toThrow();
    // @ts-expect-error — same for the money mutation
    await expect(payInvoice("INV-2026-01-LEDGER", "Bank transfer — Mandiri")).rejects.toThrow();
    expect(() => parseOrganizationContext({ organizationId: "   " })).toThrow();
  });

  it("the payment store slot is partitioned, not a process-wide record", async () => {
    seedTwoTenants();
    await payInvoice(ctxA, "INV-2026-01-LEDGER", "Bank transfer — Mandiri");
    const slot = (globalThis as unknown as { __kineticInvoiceStore?: { payments?: unknown } })
      .__kineticInvoiceStore;
    expect(slot?.payments).toBeUndefined();
  });
});
