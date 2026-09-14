// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PAYMENT_METHODS } from "@/lib/invoice-status";
import { OrgContextError } from "@/server/services/org-context";
import { listInvoices } from "@/server/data/invoices";
import { payInvoiceAction, payInvoicesAction } from "./invoices";

/**
 * Audit finding S-02 — `payInvoiceAction` and `payInvoicesAction` had no
 * authorization of any kind.
 *
 * `payInvoice(id, method)` takes no org context and neither action read the
 * session, so any caller who could reach the endpoint marked any invoice paid.
 * The bulk variant was worse: it settled *every* id handed to it in one call,
 * so a single request could zero out an outstanding-balance position. Revenue
 * that was never collected then reports as collected — the one number the
 * business is run on.
 *
 * Both now demand `money_in.create`, which is what `createInvoiceAction` in the
 * same file already requires, so issuing and settling an invoice are the same
 * privilege. Strict mode, because marking an invoice paid is a revenue write
 * and every other money write in the codebase is strict.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireStrict = vi.hoisted(() => vi.fn());
const requireNonStrict = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/session-org-context", () => ({
  requireStrictOrgContext: requireStrict,
  // `createInvoiceAction` reaches this seam through a dynamic import of the same
  // module, so it has to exist on the mock or that action cannot run at all.
  requireOrgContext: requireNonStrict,
}));

function asRole(roles: string[]) {
  requireStrict.mockResolvedValue({
    organizationId: "org_alpha",
    roles,
    userId: "user_caller",
    isDemoFallback: false,
  });
}

function signedOut() {
  requireStrict.mockRejectedValue(
    new OrgContextError("FORBIDDEN", "Authentication required — please sign in."),
  );
}

function lackingPermission() {
  requireStrict.mockRejectedValue(
    new OrgContextError("FORBIDDEN", "Actor is not authorized for money_in.create in org_alpha"),
  );
}

function resetStore() {
  (globalThis as unknown as { __kineticInvoiceStore?: unknown }).__kineticInvoiceStore = undefined;
  (globalThis as unknown as { __kineticTxStore?: unknown }).__kineticTxStore = undefined;
}

async function unsettledIds(): Promise<string[]> {
  const { rows } = await listInvoices({ pageSize: 100 });
  return rows.filter((r) => r.status === "PENDING" || r.status === "OVERDUE").map((r) => r.id);
}

async function snapshot() {
  const { rows } = await listInvoices({ pageSize: 100 });
  return JSON.stringify(rows.map((r) => [r.id, r.status]));
}

function payForm(id: string) {
  const fd = new FormData();
  fd.set("id", id);
  fd.set("method", PAYMENT_METHODS[0]);
  fd.set("confirm", "on");
  return fd;
}

function payAllForm(ids: string[]) {
  const fd = new FormData();
  fd.set("ids", ids.join(","));
  fd.set("method", PAYMENT_METHODS[0]);
  return fd;
}

beforeEach(() => {
  resetStore();
  requireStrict.mockReset();
  requireNonStrict.mockReset();
  requireNonStrict.mockResolvedValue({
    organizationId: "org_alpha",
    roles: ["OWNER"],
    userId: "user_caller",
    isDemoFallback: false,
  });
  asRole(["OWNER"]);
});

describe("S-02 — settling invoices demands money_in.create", () => {
  it("payInvoiceAction authorizes money_in.create", async () => {
    const [id] = await unsettledIds();
    await payInvoiceAction(undefined, payForm(id));
    expect(requireStrict).toHaveBeenCalledWith("money_in.create");
  });

  it("payInvoicesAction authorizes money_in.create", async () => {
    const ids = await unsettledIds();
    await payInvoicesAction(undefined, payAllForm(ids));
    expect(requireStrict).toHaveBeenCalledWith("money_in.create");
  });

  it("agrees with createInvoiceAction on the same file's permission", async () => {
    // Issuing and settling an invoice must not be different privileges, or a
    // role that can create but not settle can still be handed the settle form.
    const [id] = await unsettledIds();
    await payInvoiceAction(undefined, payForm(id));
    const { createInvoiceAction } = await import("./invoices");
    const fd = new FormData();
    fd.set("number", "INV-AUTHZ-1");
    fd.set("counterparty", "PT Uji");
    fd.set("amount", "1000000");
    await createInvoiceAction(undefined, fd);
    // createInvoiceAction uses the non-strict seam; the two settle actions use
    // the strict one. The *permission* is the same either way, which is the
    // point: a role able to issue an invoice is a role able to settle one, and
    // neither can be reached without it.
    expect(requireNonStrict).toHaveBeenCalledWith("money_in.create");
  });
});

describe("S-02 — a signed-out caller cannot fabricate collected revenue", () => {
  it("refuses payInvoiceAction and leaves the invoice unsettled", async () => {
    const before = await snapshot();
    const [id] = await unsettledIds();
    signedOut();

    const state = await payInvoiceAction(undefined, payForm(id));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/Sign in to manage invoices/i);
    expect(await snapshot()).toBe(before);
  });

  it("refuses the bulk settle and leaves every invoice unsettled", async () => {
    const before = await snapshot();
    const ids = await unsettledIds();
    expect(ids.length).toBeGreaterThan(1);
    signedOut();

    const state = await payInvoicesAction(undefined, payAllForm(ids));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/Sign in to manage invoices/i);
    expect(await snapshot()).toBe(before);
    // The ids are still all unsettled — nothing was partially applied.
    expect(await unsettledIds()).toEqual(ids);
  });
});

describe("S-02 — a caller without money_in.create cannot settle invoices", () => {
  it("refuses payInvoiceAction", async () => {
    const before = await snapshot();
    const [id] = await unsettledIds();
    lackingPermission();

    const state = await payInvoiceAction(undefined, payForm(id));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/don't have permission to settle invoices/i);
    expect(await snapshot()).toBe(before);
  });

  it("refuses payInvoicesAction", async () => {
    const before = await snapshot();
    const ids = await unsettledIds();
    lackingPermission();

    const state = await payInvoicesAction(undefined, payAllForm(ids));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/don't have permission to settle invoices/i);
    expect(await snapshot()).toBe(before);
  });
});

describe("the denials above are attributable to the guard, not to bad input", () => {
  it("an authorized caller really does settle the invoice", async () => {
    const before = await snapshot();
    const ids = await unsettledIds();
    asRole(["FINANCE_ADMIN"]);

    const state = await payInvoiceAction(undefined, payForm(ids[0]));

    expect(state.status).toBe("success");
    expect(await snapshot()).not.toBe(before);
  });

  it("an authorized caller really does settle all of them", async () => {
    const ids = await unsettledIds();
    asRole(["FINANCE_ADMIN"]);

    const state = await payInvoicesAction(undefined, payAllForm(ids));

    expect(state.status).toBe("success");
    expect(state.data?.paid).toBe(ids.length);
    expect(await unsettledIds()).toEqual([]);
  });
});
