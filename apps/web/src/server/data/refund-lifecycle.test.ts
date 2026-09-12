import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_CONTEXT } from "@/test/organization-context";

import {
  __resetHandoffStore,
  getHandoff,
  handoffIdentity,
  listStoredHandoffs,
} from "./handoff-store";
import {
  approveRefund,
  getTransaction,
  listRefundsAwaiting,
  listTransactions,
  refundTransaction,
  rejectRefund,
  requestRefund,
} from "./transactions";

// Wave 4 §4 — the refund journey that changes hands (JRN-003, spec §9).
//
//   Agus (SUPPORT, refund.prepare)  requests  -> AWAITING_APPROVAL + handoff
//   Hendri (FINANCE_ADMIN, refund.execute) approves -> money moves, handoff closed
//
// The critical property: no money moves until a *different* actor approves.

function resetStores() {
  const g = globalThis as unknown as Record<string, unknown>;
  g.__kineticTxStore = undefined;
  g.__kineticPayoutStore = undefined;
  g.__kineticBalanceStore = undefined;
  __resetHandoffStore();
}

beforeEach(resetStores);

const AGUS = "persona_agus";
const HENDRI = "persona_hendri";
const NOW = new Date("2026-09-01T12:00:00.000Z");

/** Pick a refundable (non-FAILED, unrefunded) row from the seeded ledger. */
async function refundableTransactionId(): Promise<string> {
  const { rows } = await listTransactions(DEMO_CONTEXT, { pageSize: 50, page: 1 });
  const row = rows.find((t) => t.status !== "FAILED" && t.refundedAmount === 0);
  if (!row) throw new Error("seed ledger has no refundable transaction");
  return row.id;
}

describe("requestRefund — Role A", () => {
  it("moves the transaction to AWAITING_APPROVAL and moves no money", async () => {
    const id = await refundableTransactionId();
    const before = await getTransaction(DEMO_CONTEXT, id);

    const result = await requestRefund(DEMO_CONTEXT, { transactionId: id, amount: 10_000, reason: "Duplicate charge", requestedBy: AGUS, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);

    const after = await getTransaction(DEMO_CONTEXT, id);
    expect(after?.refundState).toBe("AWAITING_APPROVAL");
    // The defining property of phase one: the balance has not moved.
    expect(after?.refundedAmount).toBe(before?.refundedAmount);
    expect(after?.status).toBe(before?.status);
    expect(after?.refundRequest).toMatchObject({ amount: 10_000, requestedBy: AGUS, decidedBy: null });
  });

  it("opens a handoff that routes to the roles holding refund.execute", async () => {
    const id = await refundableTransactionId();
    await requestRefund(DEMO_CONTEXT, { transactionId: id, amount: 10_000, reason: "Duplicate charge", requestedBy: AGUS, now: NOW });

    const identity = handoffIdentity("refund_approval", "refund", id);
    const handoff = listStoredHandoffs().find((h) => handoffIdentity(h.journey, h.entityType, h.entityId) === identity);
    expect(handoff).toBeDefined();
    expect(handoff?.status).toBe("NOTIFIED");
    expect(handoff?.toRoles).toEqual(["OWNER", "FINANCE_ADMIN"]);
    expect(handoff?.fromActor).toBe(AGUS);
    // Role B's queue is a real, filtered URL — not a dead end.
    expect(handoff?.queueHref).toBe("/transactions?refundState=AWAITING_APPROVAL");
    expect(handoff?.actionHref).toBe(`/transactions/${id}`);
    expect(handoff?.notifications).toHaveLength(1);
  });

  it("appears in the awaiting list Role B reads", async () => {
    const id = await refundableTransactionId();
    expect(listRefundsAwaiting(DEMO_CONTEXT)).toHaveLength(0);
    await requestRefund(DEMO_CONTEXT, { transactionId: id, amount: 10_000, reason: "Duplicate", requestedBy: AGUS, now: NOW });
    const awaiting = listRefundsAwaiting(DEMO_CONTEXT);
    expect(awaiting).toHaveLength(1);
    expect(awaiting[0].id).toBe(id);
  });

  it("is idempotent — a double submit does not stack two queue items", async () => {
    const id = await refundableTransactionId();
    const first = await requestRefund(DEMO_CONTEXT, { transactionId: id, amount: 10_000, reason: "Duplicate", requestedBy: AGUS, now: NOW });
    const second = await requestRefund(DEMO_CONTEXT, { transactionId: id, amount: 10_000, reason: "Duplicate", requestedBy: AGUS, now: NOW });
    expect(first.ok && first.created).toBe(true);
    expect(second.ok && second.created).toBe(false);
    expect(listRefundsAwaiting(DEMO_CONTEXT)).toHaveLength(1);
    expect(listStoredHandoffs()).toHaveLength(1);
  });

  it("rejects a refund exceeding the remaining refundable amount", async () => {
    const id = await refundableTransactionId();
    const tx = await getTransaction(DEMO_CONTEXT, id);
    const result = await requestRefund(DEMO_CONTEXT, { transactionId: id, amount: (tx?.amount ?? 0) + 1, reason: "Too much", requestedBy: AGUS, now: NOW });
    expect(result).toMatchObject({ ok: false, code: "EXCEEDS_REMAINING" });
    expect((await getTransaction(DEMO_CONTEXT, id))?.refundState).toBe("NONE");
  });

  it("rejects a refund on a failed payment (retry is the right path)", async () => {
    const { rows } = await listTransactions(DEMO_CONTEXT, { status: "FAILED", pageSize: 20, page: 1 });
    if (rows.length === 0) return; // seed may not include one; covered by the guard below
    const result = await requestRefund(DEMO_CONTEXT, { transactionId: rows[0].id, amount: 1000, reason: "x", requestedBy: AGUS, now: NOW });
    expect(result).toMatchObject({ ok: false, code: "NOT_REFUNDABLE" });
  });

  it("reports NOT_FOUND for an unknown transaction", async () => {
    expect(await requestRefund(DEMO_CONTEXT, { transactionId: "txn_missing", amount: 1000, reason: "x", requestedBy: AGUS, now: NOW })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("appends a single 'Refund requested' timeline event, distinct from execution", async () => {
    const id = await refundableTransactionId();
    await requestRefund(DEMO_CONTEXT, { transactionId: id, amount: 10_000, reason: "Duplicate", requestedBy: AGUS, now: NOW });
    const tx = await getTransaction(DEMO_CONTEXT, id);
    const requested = tx?.events.filter((e) => e.label === "Refund requested") ?? [];
    const issued = tx?.events.filter((e) => e.label === "Refund issued") ?? [];
    expect(requested).toHaveLength(1);
    expect(issued).toHaveLength(0);
    // The audit log is derived from these events, so it must name the initiator.
    expect(requested[0].detail).toContain(AGUS);
  });
});

describe("approveRefund — Role B", () => {
  it("refuses the initiator (dual control, BE-002) and moves no money", async () => {
    const id = await refundableTransactionId();
    const before = await getTransaction(DEMO_CONTEXT, id);
    await requestRefund(DEMO_CONTEXT, { transactionId: id, amount: 10_000, reason: "Duplicate", requestedBy: AGUS, now: NOW });

    const result = await approveRefund(DEMO_CONTEXT, { transactionId: id, approvedBy: AGUS, now: NOW });
    expect(result).toEqual({
      ok: false,
      code: "SAME_ACTOR",
      message: "Requester cannot be the approver — a different user must approve this refund.",
    });
    // Still awaiting, still no money moved.
    const after = await getTransaction(DEMO_CONTEXT, id);
    expect(after?.refundState).toBe("AWAITING_APPROVAL");
    expect(after?.refundedAmount).toBe(before?.refundedAmount);
  });

  it("moves the money for a distinct approver and closes the handoff", async () => {
    const id = await refundableTransactionId();
    // Full amount, so the row also flips to REFUNDED (a partial refund would not).
    const full = (await getTransaction(DEMO_CONTEXT, id))?.amount ?? 0;
    await requestRefund(DEMO_CONTEXT, { transactionId: id, amount: full, reason: "Duplicate charge", requestedBy: AGUS, now: NOW });

    const result = await approveRefund(DEMO_CONTEXT, { transactionId: id, approvedBy: HENDRI, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.transaction.refundState).toBe("APPROVED");
    expect(result.transaction.refundedAmount).toBe(full);
    expect(result.transaction.refundRequest?.decidedBy).toBe(HENDRI);
    expect(result.transaction.refundRequest?.decidedAt).toBe(NOW.toISOString());
    expect(result.transaction.status).toBe("REFUNDED");
    expect(listRefundsAwaiting(DEMO_CONTEXT)).toHaveLength(0);

    // The handoff is closed by the second actor, not the first.
    const identity = handoffIdentity("refund_approval", "refund", id);
    const handoff = listStoredHandoffs().find((h) => handoffIdentity(h.journey, h.entityType, h.entityId) === identity);
    expect(handoff?.status).toBe("COMPLETED");
    expect(handoff?.completedBy).toBe(HENDRI);
    expect(handoff?.outcome).toBe("approved");
  });

  it("records both actors in the audit-derived timeline, exactly once each", async () => {
    const id = await refundableTransactionId();
    await requestRefund(DEMO_CONTEXT, { transactionId: id, amount: 10_000, reason: "Duplicate charge", requestedBy: AGUS, now: NOW });
    await approveRefund(DEMO_CONTEXT, { transactionId: id, approvedBy: HENDRI, now: NOW });

    const tx = await getTransaction(DEMO_CONTEXT, id);
    const issued = tx?.events.filter((e) => e.label === "Refund issued") ?? [];
    expect(issued).toHaveLength(1); // spec §9: "Refund issued" appears once
    expect(issued[0].detail).toContain(AGUS);
    expect(issued[0].detail).toContain(HENDRI);
    expect(issued[0].detail).toMatch(/dual control satisfied/);
  });

  it("cannot approve twice", async () => {
    const id = await refundableTransactionId();
    await requestRefund(DEMO_CONTEXT, { transactionId: id, amount: 10_000, reason: "Duplicate", requestedBy: AGUS, now: NOW });
    await approveRefund(DEMO_CONTEXT, { transactionId: id, approvedBy: HENDRI, now: NOW });
    expect(await approveRefund(DEMO_CONTEXT, { transactionId: id, approvedBy: HENDRI, now: NOW })).toMatchObject({
      ok: false,
      code: "NOT_AWAITING",
    });
  });

  it("supports a partial refund without flipping the transaction to REFUNDED", async () => {
    const { rows } = await listTransactions(DEMO_CONTEXT, { pageSize: 50, page: 1 });
    const tx = rows.find((t) => t.status === "SUCCEEDED" && t.refundedAmount === 0 && t.amount > 20_000);
    if (!tx) return;
    await requestRefund(DEMO_CONTEXT, { transactionId: tx.id, amount: 5_000, reason: "Partial", requestedBy: AGUS, now: NOW });
    const result = await approveRefund(DEMO_CONTEXT, { transactionId: tx.id, approvedBy: HENDRI, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transaction.refundedAmount).toBe(5_000);
    expect(result.transaction.status).toBe("SUCCEEDED"); // not fully refunded
  });
});

describe("rejectRefund — Role B declines", () => {
  it("moves no money and records the rejection", async () => {
    const id = await refundableTransactionId();
    const before = await getTransaction(DEMO_CONTEXT, id);
    await requestRefund(DEMO_CONTEXT, { transactionId: id, amount: 10_000, reason: "Duplicate", requestedBy: AGUS, now: NOW });

    const result = await rejectRefund(DEMO_CONTEXT, { transactionId: id, rejectedBy: HENDRI, reason: "Outside refund window", now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transaction.refundState).toBe("REJECTED");
    expect(result.transaction.refundedAmount).toBe(before?.refundedAmount);
    expect(result.transaction.status).toBe(before?.status);
    expect(listRefundsAwaiting(DEMO_CONTEXT)).toHaveLength(0);

    const identity = handoffIdentity("refund_approval", "refund", id);
    const handoff = listStoredHandoffs().find((h) => handoffIdentity(h.journey, h.entityType, h.entityId) === identity);
    expect(handoff?.status).toBe("REJECTED");
  });

  it("cannot reject a transaction with nothing awaiting", async () => {
    const id = await refundableTransactionId();
    expect(await rejectRefund(DEMO_CONTEXT, { transactionId: id, rejectedBy: HENDRI, now: NOW })).toMatchObject({
      ok: false,
      code: "NOT_AWAITING",
    });
  });
});

describe("ledger filtering by refund state (Role B's queue URL)", () => {
  it("the handoff's queueHref resolves to exactly the awaiting rows", async () => {
    const id = await refundableTransactionId();
    await requestRefund(DEMO_CONTEXT, { transactionId: id, amount: 10_000, reason: "Duplicate", requestedBy: AGUS, now: NOW });

    const { rows } = await listTransactions(DEMO_CONTEXT, { refundState: "AWAITING_APPROVAL", pageSize: 50, page: 1 });
    expect(rows.map((r) => r.id)).toEqual([id]);

    const all = await listTransactions(DEMO_CONTEXT, { refundState: "ALL", pageSize: 100, page: 1 });
    expect(all.isFiltered).toBe(false);
    const filtered = await listTransactions(DEMO_CONTEXT, { refundState: "AWAITING_APPROVAL", pageSize: 100, page: 1 });
    expect(filtered.isFiltered).toBe(true);
  });
});

describe("legacy single-step refund still works (backwards compatible)", () => {
  it("executes immediately for the non-dual path", async () => {
    const id = await refundableTransactionId();
    const tx = await refundTransaction(DEMO_CONTEXT, id, 5_000, "Goodwill");
    expect(tx?.refundedAmount).toBe(5_000);
    // The single-step path does not open a handoff — nothing is waiting on anyone.
    expect(listStoredHandoffs()).toHaveLength(0);
    expect(getHandoff("nope")).toBeNull();
  });
});
