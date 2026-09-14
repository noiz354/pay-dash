// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { SHARE_URL_NOTICE, shareUrlOf } from "@/lib/link-status";
import { createBatch } from "@/server/data/payouts";
import { approveBatchAction } from "./payouts";
import { inviteMemberAction } from "./team";
import { approveRefundAction, requestRefundAction } from "./transactions";

/**
 * Audit finding F-01 — success copy that asserted outcomes which did not occur.
 *
 * Four places told the operator a thing had happened in the world when only a row
 * had changed in this process:
 *
 *   "Refund approved and issued."       no provider call is made
 *   "Invite sent to …"                  nothing in the repository sends mail
 *   "{batch} sent — N recipients paid." the mock settlement marks rows PAID on an
 *                                       account-number rule; no funds move
 *   "Send this to your customer"        next to a `.test` URL that resolves to
 *                                       nothing
 *
 * Each is a support ticket waiting to happen: the operator acts on the message,
 * the customer does not receive the money or the email, and the dashboard says it
 * happened. These tests pin the corrected copy, and pin that the payout message
 * is *conditional* — a real provider release should still say "sent", because
 * there it is true.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// --- payout seam + provider probe -------------------------------------------
const requireStrict = vi.hoisted(() => vi.fn());
const resolveSession = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/session-org-context", () => ({
  resolveSessionOrgContext: resolveSession,
  requireStrictOrgContext: requireStrict,
}));

const provider = vi.hoisted(() => ({
  connected: false,
  releaseOk: true,
}));
vi.mock("@/server/payment-flows/execute-provider-write", () => ({
  resolveProviderWrite: async () => ({ connected: provider.connected }),
  tryProviderPayout: async () => ({ connected: provider.releaseOk }),
}));

// --- transaction seam --------------------------------------------------------
const requireTxContext = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/transaction-organization-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/transaction-organization-context")>();
  return { ...actual, requireTransactionOrganizationContext: requireTxContext };
});

const ORG = "org_copy";

function asUser(userId: string, roles: string[] = ["OWNER"]) {
  const ctx = { organizationId: ORG, roles, userId, isDemoFallback: false };
  requireStrict.mockResolvedValue(ctx);
  resolveSession.mockResolvedValue(ctx);
  requireTxContext.mockResolvedValue({
    context: parseOrganizationContext({ organizationId: ORG }),
    actorId: userId,
    roles,
    demoFallback: false,
    overridden: false,
  });
}

// `createBatch` takes parsed recipient drafts, not the CSV the action accepts.
function recipients(accountNumber = "1111111111") {
  return [
    { line: 1, name: "Copy Supplier", bank: "BCA", accountNumber, amount: 1_500_000, reference: "COPY-1" },
  ];
}

function batchForm(id: string) {
  const fd = new FormData();
  fd.set("id", id);
  fd.set("confirm", "on");
  return fd;
}

beforeEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.__kineticPayoutStore = undefined;
  g.__kineticTxStore = undefined;
  g.__kineticTeamStore = undefined;
  requireStrict.mockReset();
  resolveSession.mockReset();
  requireTxContext.mockReset();
  provider.connected = false;
  provider.releaseOk = true;
});

describe("F-01 — refund approval does not claim a disbursement", () => {
  it("says the refund was recorded, not issued", async () => {
    asUser("user_a");
    const { createTransaction } = await import("@/server/data/transactions");
    const tx = await createTransaction(parseOrganizationContext({ organizationId: ORG }), {
      customerName: "Copy Refund",
      customerEmail: "copy.refund@example.test",
      amount: 50_000_000,
      currency: "IDR",
      channel: "QRIS",
    });

    const fd = new FormData();
    fd.set("id", tx.id);
    fd.set("amount", "50000000");
    fd.set("reason", "Customer dispute");
    expect((await requestRefundAction(undefined, fd)).status).toBe("success");

    asUser("user_b");
    const decision = new FormData();
    decision.set("id", tx.id);
    const state = await approveRefundAction(undefined, decision);

    expect(state.status).toBe("success");
    // The ledger really did move, so "approved"/"recorded" are true…
    expect(state.message).toMatch(/approved/i);
    expect(state.message).toMatch(/recorded in the ledger/i);
    // …and the provider really did not, so "issued" on its own is not.
    expect(state.message).toMatch(/no provider refund was issued/i);
    expect(state.message).not.toBe("Refund approved and issued.");
  });
});

describe("F-01 — an invitation does not claim an email was sent", () => {
  it("records the invitation and says no mail went out", async () => {
    asUser("user_owner");
    const fd = new FormData();
    fd.set("name", "Copy Analyst");
    fd.set("email", "copy.analyst@example.test");
    fd.set("role", "ANALYST");

    const state = await inviteMemberAction(undefined, fd);
    expect(state.status).toBe("success");
    expect(state.message).toMatch(/Invitation recorded for copy\.analyst@example\.test/i);
    expect(state.message).toMatch(/no email was sent/i);
    expect(state.message).not.toMatch(/^Invite sent/i);
  });
});

describe("F-01 — payout copy reflects which path settled the batch", () => {
  it("says no funds moved when the ledger path ran", async () => {
    asUser("user_creator");
    const batch = await createBatch(
      parseOrganizationContext({ organizationId: ORG }),
      { name: "Ledger settled", recipients: recipients() },
      { createdBy: "user_creator" },
    );

    provider.connected = false;
    asUser("user_approver"); // dual control: someone other than the creator
    const state = await approveBatchAction(undefined, batchForm(batch.id));

    expect(state.status).toBe("success");
    expect(state.message).toMatch(/released in the ledger/i);
    expect(state.message).toMatch(/no funds moved/i);
    // The old string is the one that read as a completed disbursement.
    expect(state.message).not.toMatch(/sent — \d+ recipients paid/);
  });

  it("still says 'sent' when a real provider released the funds", async () => {
    asUser("user_creator");
    const batch = await createBatch(
      parseOrganizationContext({ organizationId: ORG }),
      { name: "Provider settled", recipients: recipients() },
      { createdBy: "user_creator" },
    );

    provider.connected = true;
    asUser("user_approver");
    const state = await approveBatchAction(undefined, batchForm(batch.id));

    expect(state.status).toBe("success");
    expect(state.message).toMatch(/sent — 1 recipients paid/);
    expect(state.message).not.toMatch(/no funds moved/i);
  });

  it("reports failures on the ledger path without implying a disbursement", async () => {
    asUser("user_creator");
    // Account numbers ending "0000" are rejected by the deterministic rule.
    const batch = await createBatch(
      parseOrganizationContext({ organizationId: ORG }),
      { name: "Ledger failures", recipients: recipients("111110000") },
      { createdBy: "user_creator" },
    );

    provider.connected = false;
    asUser("user_approver");
    const state = await approveBatchAction(undefined, batchForm(batch.id));

    expect(state.status).toBe("success");
    expect(state.message).toMatch(/0 paid, 1 failed/);
    expect(state.message).toMatch(/no funds moved/i);
  });
});

describe("F-01 — the share URL is labelled as a placeholder", () => {
  it("points at a host that cannot resolve", () => {
    // Documenting the reason the notice exists rather than asserting a bug: if a
    // real payer site is ever wired up, this expectation should change and the
    // notice should be removed with it.
    expect(shareUrlOf("lnk_1")).toContain(".test/");
  });

  it("warns that it will not resolve for a customer", () => {
    expect(SHARE_URL_NOTICE).toMatch(/placeholder/i);
    expect(SHARE_URL_NOTICE).toMatch(/will not resolve/i);
  });
});
