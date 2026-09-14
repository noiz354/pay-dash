// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TOPUP_METHODS } from "@/lib/balance-status";
import { OrgContextError } from "@/server/services/org-context";
import { getBalanceOverview } from "@/server/data/balance";
import { topUpBalanceAction } from "./balance";

/**
 * Audit finding S-02 — `topUpBalanceAction` fabricated balance with no
 * authorization. It is the first row of the audit's S-02 table, and it was also
 * the one action still ungated after the other six modules were fixed: the
 * coverage scanner in `authorization-coverage.test.ts` caught it on its first
 * run, which is the argument for the scanner existing at all.
 *
 * Neither the action nor `topUpBalance` reads the session, so any caller who
 * could reach the endpoint added arbitrary funds to the balance — bounded only
 * by the Rp 10,000 minimum in `TopUpSchema` — and `revalidateBalance()` then
 * displayed the invented figure. `withdrawBalanceAction` in this same file was
 * already gated through the payout seam, which left the funding side of the
 * ledger open while the spending side was closed: the more dangerous half, since
 * invented balance is what a payout is later drawn against.
 *
 * Gated behind `money_in.create` — money entering the account — matching the
 * invoices and links fixes, and strict because inventing balance is a money
 * write.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireStrict = vi.hoisted(() => vi.fn());
const requirePayout = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/session-org-context", () => ({
  requireStrictOrgContext: requireStrict,
}));
vi.mock("@/server/services/payout-organization-context", () => ({
  // Imported by `withdrawBalanceAction` in the same module; not under test here,
  // but the import has to resolve.
  requirePayoutOrganizationContext: requirePayout,
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
  (globalThis as unknown as { __kineticBalanceStore?: unknown }).__kineticBalanceStore = undefined;
  (globalThis as unknown as { __kineticTxStore?: unknown }).__kineticTxStore = undefined;
}

function topUpForm(amount = "50000000") {
  const fd = new FormData();
  fd.set("amount", amount);
  fd.set("method", TOPUP_METHODS[0]);
  return fd;
}

beforeEach(() => {
  resetStore();
  requireStrict.mockReset();
  requirePayout.mockReset();
  asRole(["OWNER"]);
});

describe("S-02 — topping up the balance demands money_in.create", () => {
  it("authorizes money_in.create", async () => {
    await topUpBalanceAction(undefined, topUpForm());
    expect(requireStrict).toHaveBeenCalledWith("money_in.create");
  });
});

describe("S-02 — a signed-out caller cannot invent balance", () => {
  it("refuses and leaves the balance untouched", async () => {
    const before = JSON.stringify(await getBalanceOverview());
    signedOut();

    const state = await topUpBalanceAction(undefined, topUpForm());

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/Sign in to top up the balance/i);
    expect(JSON.stringify(await getBalanceOverview())).toBe(before);
  });

  it("refuses even a minimum-amount top-up", async () => {
    // The schema's floor is Rp 10,000, so the smallest possible fabrication must
    // also be refused — the guard is not amount-dependent.
    const before = JSON.stringify(await getBalanceOverview());
    signedOut();

    const state = await topUpBalanceAction(undefined, topUpForm("10000"));

    expect(state.status).toBe("error");
    expect(JSON.stringify(await getBalanceOverview())).toBe(before);
  });
});

describe("S-02 — a caller without money_in.create cannot invent balance", () => {
  it("refuses and leaves the balance untouched", async () => {
    const before = JSON.stringify(await getBalanceOverview());
    lackingPermission();

    const state = await topUpBalanceAction(undefined, topUpForm());

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/don't have permission to top up the balance/i);
    expect(JSON.stringify(await getBalanceOverview())).toBe(before);
  });
});

describe("the denials above are attributable to the guard, not to a dead store", () => {
  it("an authorized caller really does receive the funds", async () => {
    const before = JSON.stringify(await getBalanceOverview());
    asRole(["FINANCE_ADMIN"]);

    const state = await topUpBalanceAction(undefined, topUpForm());

    expect(state.status).toBe("success");
    expect(state.data?.available).toBeGreaterThan(0);
    expect(JSON.stringify(await getBalanceOverview())).not.toBe(before);
  });
});
