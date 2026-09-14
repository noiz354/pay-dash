// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { OrgContextError } from "@/server/services/org-context";
import { createTransaction, getTransaction } from "@/server/data/transactions";
import * as transactionsActions from "./transactions";

/**
 * Audit finding S-03 — the refund path that let one person move money alone.
 *
 * `refundTransactionAction` read the approver's identity off the request body
 * (`formData.get("approverId")`) and then called `isApproverDistinct(requesterId,
 * approverId)`, which is nothing more than `requesterId !== approverId`. Any
 * string other than your own user id satisfied refund dual control: no existence
 * check, no `refund.execute` check, no membership, no consent, and no approval
 * record created by that person. The action was dead in the UI — its only
 * importer had no importers of its own — but it stayed a routable `"use server"`
 * endpoint, so the bypass was reachable by any authenticated caller.
 *
 * Both the action and its dialog are deleted. These tests lock the deletion and
 * prove the surviving journey takes its actor from the session, which is what
 * makes `SAME_ACTOR` in `data/transactions.ts` unreachable by a caller.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireTxContext = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/transaction-organization-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/transaction-organization-context")>();
  return { ...actual, requireTransactionOrganizationContext: requireTxContext };
});

const ORG = "org_refund";

function actor(userId: string, roles: string[]) {
  // Shape must match `ResolvedTransactionAccess` — the action reads `.context`
  // and `.actorId`, and `.actorId` is the session user, never a form value.
  requireTxContext.mockResolvedValue({
    context: parseOrganizationContext({ organizationId: ORG }),
    actorId: userId,
    roles,
    demoFallback: false,
    overridden: false,
  });
}

function noSession() {
  requireTxContext.mockRejectedValue(
    new OrgContextError("FORBIDDEN", "Authentication required — please sign in."),
  );
}

async function seedTransaction(label: string, amount = 50_000_000) {
  return createTransaction(parseOrganizationContext({ organizationId: ORG }), {
    customerName: label,
    customerEmail: `${label.replace(/\s+/g, ".").toLowerCase()}@example.test`,
    amount,
    currency: "IDR",
    channel: "QRIS",
  });
}

function requestForm(id: string, amount = "50000000") {
  const fd = new FormData();
  fd.set("id", id);
  fd.set("amount", amount);
  fd.set("reason", "Customer dispute escalated by support");
  return fd;
}

function decisionForm(id: string) {
  const fd = new FormData();
  fd.set("id", id);
  fd.set("reason", "Verified against the provider record");
  return fd;
}

beforeEach(() => {
  (globalThis as unknown as { __kineticTxStore?: unknown }).__kineticTxStore = undefined;
  requireTxContext.mockReset();
});

describe("S-03 — the self-approvable refund endpoint is gone", () => {
  it("does not export refundTransactionAction", () => {
    // Reintroducing it restores an unauthenticated-approver money-out endpoint.
    // If a single-step refund is ever genuinely needed it must take its actor
    // from the session and reuse the SAME_ACTOR guard, not a form field.
    expect(Object.keys(transactionsActions)).not.toContain("refundTransactionAction");
    expect((transactionsActions as Record<string, unknown>).refundTransactionAction).toBeUndefined();
  });

  it("still exports the three-action journey", () => {
    expect(Object.keys(transactionsActions)).toEqual(
      expect.arrayContaining(["requestRefundAction", "approveRefundAction", "rejectRefundAction"]),
    );
  });

  it("offers no form field through which a caller can name an approver", async () => {
    const tx = await seedTransaction("Approver Field Probe");
    actor("user_requester", ["OWNER"]);
    const requested = await transactionsActions.requestRefundAction(undefined, requestForm(tx.id));
    expect(requested.status).toBe("success");

    // The removed action trusted `approverId`. The surviving one must not: an
    // approver id supplied by the caller has to be ignored, not believed.
    const fd = decisionForm(tx.id);
    fd.set("approverId", "user_someone_else");
    fd.set("approvedBy", "user_someone_else");
    const state = await transactionsActions.approveRefundAction(undefined, fd);

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/different user must approve/i);
  });
});

describe("the surviving refund journey enforces separation of duties", () => {
  it("rejects the requester approving their own request", async () => {
    const tx = await seedTransaction("Self Approval");
    actor("user_a", ["OWNER"]);

    const requested = await transactionsActions.requestRefundAction(undefined, requestForm(tx.id));
    expect(requested.status).toBe("success");

    // Same session actor decides: SAME_ACTOR from the store, not from a form.
    const decided = await transactionsActions.approveRefundAction(undefined, decisionForm(tx.id));
    expect(decided.status).toBe("error");
    expect(decided.message).toMatch(/different user must approve/i);

    const after = await getTransaction(parseOrganizationContext({ organizationId: ORG }), tx.id);
    expect(after?.refundedAmount).toBe(0);
    expect(after?.refundState).toBe("AWAITING_APPROVAL");
  });

  it("lets a different actor with refund.execute approve it", async () => {
    const tx = await seedTransaction("Handoff Approval");
    actor("user_a", ["FINANCE_ADMIN"]);
    expect((await transactionsActions.requestRefundAction(undefined, requestForm(tx.id))).status).toBe("success");

    actor("user_b", ["FINANCE_ADMIN"]);
    const decided = await transactionsActions.approveRefundAction(undefined, decisionForm(tx.id));
    expect(decided.status).toBe("success");

    const after = await getTransaction(parseOrganizationContext({ organizationId: ORG }), tx.id);
    expect(after?.refundedAmount).toBe(50_000_000);
    expect(after?.status).toBe("REFUNDED");
  });

  it("refuses an actor who only holds refund.prepare", async () => {
    const tx = await seedTransaction("Prepare Only");
    // SUPPORT holds refund.prepare but not refund.execute.
    actor("user_a", ["SUPPORT"]);
    expect((await transactionsActions.requestRefundAction(undefined, requestForm(tx.id))).status).toBe("success");

    // SUPPORT has refund.prepare but not refund.execute: it may ask, never decide.
    requireTxContext.mockRejectedValue(
      new OrgContextError("FORBIDDEN", "Actor is not authorized for refund.execute in " + ORG),
    );
    const decided = await transactionsActions.approveRefundAction(undefined, decisionForm(tx.id));
    expect(decided.status).toBe("error");
    expect(decided.message).toMatch(/permission to approve refunds/i);

    const after = await getTransaction(parseOrganizationContext({ organizationId: ORG }), tx.id);
    expect(after?.refundedAmount).toBe(0);
  });

  it("refuses an unauthenticated caller before any money moves", async () => {
    const tx = await seedTransaction("Anonymous Refund");
    noSession();

    const requested = await transactionsActions.requestRefundAction(undefined, requestForm(tx.id));
    expect(requested.status).toBe("error");
    expect(requested.message).toMatch(/Authentication required/i);

    const decided = await transactionsActions.approveRefundAction(undefined, decisionForm(tx.id));
    expect(decided.status).toBe("error");
    expect(decided.message).toMatch(/Authentication required/i);

    const after = await getTransaction(parseOrganizationContext({ organizationId: ORG }), tx.id);
    expect(after?.refundedAmount).toBe(0);
    expect(after?.refundState).toBe("NONE");
  });

  it("cannot approve a refund that was never requested", async () => {
    const tx = await seedTransaction("No Request");
    actor("user_b", ["FINANCE_ADMIN"]);

    const decided = await transactionsActions.approveRefundAction(undefined, decisionForm(tx.id));
    expect(decided.status).toBe("error");
    expect(decided.message).toMatch(/no refund awaiting approval/i);
  });
});
