// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { OrgContextError } from "@/server/services/org-context";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { listTenantDenials, __resetTenantDenials } from "@/server/services/tenant-denial";
import { seedDemoLedgerForOrganization } from "@/server/data/transactions";
import { getInvoice, listInvoices } from "@/server/data/invoices";
import { listSubscriptions } from "@/server/data/subscriptions";
import { createInvoiceAction, payInvoiceAction, payInvoicesAction } from "./invoices";
import { createSubscriptionAction } from "./subscriptions";

/**
 * Wave 7D Q4.3 — action-level tenant boundary tests for billing.
 *
 * The DAL tests prove the repository predicates; these prove the server-action
 * seam resolves the tenant from the session *before* touching the store, that a
 * cross-tenant id answers exactly like an unknown id (no enumeration oracle on
 * the wire), and that the **bulk** pay action scopes per row rather than
 * silently dropping — or worse, silently charging — another tenant's invoice.
 *
 * `payInvoice` is a money mutation, so the refusal must also be *audible*: the
 * denial sink records it while the client sees only "no longer exists".
 *
 * The provider seam (`server/services/commerce`) is mocked to `{connected:false}`:
 * this wave's subject is the tenant boundary, and the adapter has no connection
 * to resolve in a test process. Mocking keeps the assertion offline and
 * deterministic rather than skipping the action.
 *
 * RED on `af18cc4`: `payInvoiceAction`/`payInvoicesAction` resolve no tenant at
 * all (spec P-8) and `createSubscriptionAction` resolves one but never passes it
 * to the DAL.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/services/commerce", () => ({
  createProviderInvoice: () => Promise.resolve({ connected: false }),
  createProviderRecurringPlan: () => Promise.resolve({ connected: false }),
  createProviderCustomer: () => Promise.resolve({ connected: false }),
  createProviderSavedPaymentMethod: () => Promise.resolve({ connected: false }),
}));

const requireStrict = vi.hoisted(() => vi.fn());
const resolveSession = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/session-org-context", () => ({
  resolveSessionOrgContext: resolveSession,
  requireStrictOrgContext: requireStrict,
  requireOrgContext: requireStrict,
}));

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA = parseOrganizationContext({ organizationId: ORG_A });
const ctxB = parseOrganizationContext({ organizationId: ORG_B });
const ctxDemo = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });

/** The demo tenant's payable prototype invoices (seeds are demo-owned). */
const DEMO_PAYABLE = ["INV-2023-09-5102", "INV-2023-07-3990"];

function asOrg(organizationId: string, userId: string | null = "user_a") {
  const ctx = { organizationId, roles: ["OWNER"], userId, isDemoFallback: false };
  requireStrict.mockResolvedValue(ctx);
  resolveSession.mockResolvedValue(ctx);
}

function noSession() {
  const err = new OrgContextError("FORBIDDEN", "Authentication required — please sign in.");
  requireStrict.mockRejectedValue(err);
  resolveSession.mockRejectedValue(err);
}

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

/** A: one payable (OVERDUE) January invoice. B: one payable February invoice. */
function seedTwoTenants() {
  seedDemoLedgerForOrganization(ctxA, { mode: "replace", rows: [row("txn_a_jan", "2026-01-15T10:00:00.000Z", 1_000_000, 29_000)] });
  seedDemoLedgerForOrganization(ctxB, { mode: "replace", rows: [row("txn_b_feb", "2026-02-15T10:00:00.000Z", 2_000_000, 58_000)] });
}

function payForm(id: string, method = "Bank transfer — Mandiri") {
  const fd = new FormData();
  fd.set("id", id);
  fd.set("method", method);
  fd.set("confirm", "on");
  return fd;
}

function bulkPayForm(ids: string[], method = "Bank transfer — Mandiri") {
  const fd = new FormData();
  fd.set("ids", ids.join(","));
  fd.set("method", method);
  return fd;
}

function subscriptionForm(email: string, planName = "Growth", amount = "15,000,000") {
  const fd = new FormData();
  fd.set("customerName", email.split("@")[0]!);
  fd.set("customerEmail", email);
  fd.set("planName", planName);
  fd.set("interval", "monthly");
  fd.set("amount", amount);
  return fd;
}

beforeEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticInvoiceStore;
  delete g.__kineticSubscriptionStore;
  delete g.__kineticTxStore;
  __resetTenantDenials();
  requireStrict.mockReset();
  resolveSession.mockReset();
  asOrg(ORG_A);
});

describe("payInvoiceAction — the tenant comes from the session", () => {
  it("pays the session tenant's own invoice", async () => {
    seedTwoTenants();
    const out = await payInvoiceAction(undefined, payForm("INV-2026-01-LEDGER"));
    expect(out.status).toBe("success");
    expect(out.data?.reference).toMatch(/^PAY-/);
    expect((await getInvoice(ctxA, "INV-2026-01-LEDGER"))?.status).toBe("PAID");
    // The other tenant's payable invoice is untouched.
    expect((await getInvoice(ctxB, "INV-2026-02-LEDGER"))?.status).not.toBe("PAID");
  });

  it("a cross-tenant id answers byte-identically to an unknown id", async () => {
    seedTwoTenants();
    const foreign = await payInvoiceAction(undefined, payForm(DEMO_PAYABLE[0]!));
    const unknown = await payInvoiceAction(undefined, payForm("INV-1999-01-LEDGER"));

    expect(foreign.status).toBe("error");
    expect(unknown.status).toBe("error");
    // The wire message is the same string: no enumeration oracle (spec C-5).
    expect(foreign.message).toBe(unknown.message);
    expect(foreign.message).toBe("That invoice no longer exists.");
    expect(foreign.message).not.toMatch(/tenant|organization|cross/i);

    // The money never moved, and the refusal was recorded for operators.
    expect((await getInvoice(ctxDemo, DEMO_PAYABLE[0]!))?.status).toBe("PENDING");
    const denials = listTenantDenials().filter((d) => d.surface === "server/data/invoices.payInvoice");
    expect(denials.length).toBeGreaterThan(0);
    expect(denials[0]!.requestedOrg).toBe(DEFAULT_DEMO_ORG);
  });

  it("requires an authenticated actor: no session, no payment", async () => {
    seedTwoTenants();
    noSession();
    const out = await payInvoiceAction(undefined, payForm("INV-2026-01-LEDGER"));
    expect(out.status).toBe("error");
    expect((await getInvoice(ctxA, "INV-2026-01-LEDGER"))?.status).not.toBe("PAID");
  });

  it("rejects the form before it resolves a tenant (validation first)", async () => {
    seedTwoTenants();
    const fd = new FormData();
    fd.set("id", "INV-2026-01-LEDGER");
    fd.set("method", "x");
    // no `confirm`
    const out = await payInvoiceAction(undefined, fd);
    expect(out.status).toBe("error");
    expect(out.fieldErrors).toBeTruthy();
    expect((await getInvoice(ctxA, "INV-2026-01-LEDGER"))?.status).not.toBe("PAID");
  });
});

describe("payInvoicesAction — bulk settle scopes per row", () => {
  it("settles only the caller's rows and accounts for every other id", async () => {
    seedTwoTenants();
    const ids = ["INV-2026-01-LEDGER", ...DEMO_PAYABLE, "INV-1999-01-LEDGER"];
    const out = await payInvoicesAction(undefined, bulkPayForm(ids));

    // One own payable row; three ids that are not A's. Nothing is dropped silently.
    expect(out.data).toEqual({ paid: 1, failed: 3 });
    expect(out.status).toBe("error"); // partial failure is reported, never swallowed
    expect(out.message).toMatch(/1 settled, 3 failed/);

    expect((await getInvoice(ctxA, "INV-2026-01-LEDGER"))?.status).toBe("PAID");
    for (const id of DEMO_PAYABLE) {
      expect((await getInvoice(ctxDemo, id))?.status, `${id} must not be charged`).not.toBe("PAID");
      expect((await getInvoice(ctxDemo, id))?.paidAt).toBeNull();
    }
  });

  it("an all-foreign batch charges nothing and says so", async () => {
    seedTwoTenants();
    const out = await payInvoicesAction(undefined, bulkPayForm(DEMO_PAYABLE));
    expect(out.data).toEqual({ paid: 0, failed: 2 });
    expect(out.status).toBe("error");
    for (const id of DEMO_PAYABLE) {
      expect((await getInvoice(ctxDemo, id))?.status).not.toBe("PAID");
    }
  });

  it("an empty batch is refused before any store access", async () => {
    const out = await payInvoicesAction(undefined, bulkPayForm([]));
    expect(out.status).toBe("error");
    expect(out.message).toBe("Nothing to settle.");
  });
});

describe("createInvoiceAction — tenant-bound issuance", () => {
  it("resolves the tenant from the session and fails closed without one", async () => {
    noSession();
    const fd = new FormData();
    fd.set("number", "INV-A-100");
    fd.set("counterparty", "Alpha Co");
    fd.set("amount", "250000");
    fd.set("currency", "IDR");
    fd.set("email", "ap@alpha.example");
    const out = await createInvoiceAction(undefined, fd);
    expect(out.status).toBe("error");
    // No invoice appeared in any tenant's book.
    const asA = await listInvoices(ctxA, { pageSize: 100 });
    expect(asA.rows.map((i) => i.number)).not.toContain("INV-A-100");
  });
});

describe("createSubscriptionAction — the plan lands in the session tenant", () => {
  it("creates for the resolved org and is invisible to the other tenant", async () => {
    const out = await createSubscriptionAction(undefined, subscriptionForm("action@alpha.example"));
    expect(out.status).toBe("success");
    expect(out.data?.id).toBeTruthy();

    const asA = await listSubscriptions(ctxA, { pageSize: 100 });
    expect(asA.rows.map((s) => s.customerEmail)).toContain("action@alpha.example");
    expect(asA.rows.every((s) => s.organizationId === ORG_A)).toBe(true);

    const asB = await listSubscriptions(ctxB, { pageSize: 100 });
    expect(asB.rows.map((s) => s.customerEmail)).not.toContain("action@alpha.example");
    expect(asB.total).toBe(0);
  });

  it("fails closed without a session: no plan is written anywhere", async () => {
    noSession();
    const out = await createSubscriptionAction(undefined, subscriptionForm("ghost@alpha.example"));
    expect(out.status).toBe("error");
    const asA = await listSubscriptions(ctxA, { pageSize: 100 });
    expect(asA.rows.map((s) => s.customerEmail)).not.toContain("ghost@alpha.example");
  });
});
