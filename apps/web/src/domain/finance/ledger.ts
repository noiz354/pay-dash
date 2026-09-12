/**
 * Wave 6 — the ledger snapshot the invariant checker runs against.
 *
 * This is deliberately a *snapshot* type, not a store interface: the checker
 * must be able to run against (a) the current in-memory dev stores, (b) a
 * Prisma read when the data layer migrates (ADR-0027), and (c) a database
 * restored from backup during a DR drill — without changing a line of the
 * checker. Anything that can produce a `LedgerSnapshot` can be verified.
 *
 * Everything here is per-organization. A snapshot never mixes tenants: the
 * invariants are organization-local statements, and summing two tenants'
 * balances together would produce a number that is true of nobody.
 */

import type { Minor } from "./money";

/** Which side of the book a posting is on. */
export type PostingSide = "DEBIT" | "CREDIT";

/**
 * One half of a double-entry posting. Postings are grouped by `groupId`; the
 * group is the atomic financial event (a capture, a refund, a payout release).
 */
export type Posting = {
  readonly id: string;
  readonly groupId: string;
  readonly account: string;
  readonly side: PostingSide;
  /** Always non-negative; direction is carried by `side`, not by the sign. */
  readonly amount: Minor;
  readonly occurredAt: string;
};

/** Canonical terminal-status vocabulary shared by payments, refunds and payouts. */
export const TERMINAL_STATUSES = ["SUCCEEDED", "FAILED", "CANCELLED"] as const;
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];
/**
 * The lifecycle vocabulary INV-L7 reasons over.
 *
 * It is the union of the durable-operation states (`domain/payments/operations`
 * — DRAFT, PENDING_APPROVAL, APPROVED, EXECUTING, UNKNOWN and the terminals)
 * and the two status words the legacy in-memory stores use for rows that never
 * went through that machine (PENDING, PROCESSING). Keeping both is deliberate:
 * the checker has to read transitions from *both* sources during the migration,
 * and a status it cannot name is a status it cannot police.
 */
export type LifecycleStatus =
  | TerminalStatus
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "EXECUTING"
  | "PENDING"
  | "PROCESSING"
  | "UNKNOWN";

export function isTerminal(status: LifecycleStatus): status is TerminalStatus {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export type PaymentRecord = {
  readonly id: string;
  readonly status: LifecycleStatus;
  /** The amount actually captured. `zero` while the payment is still pending. */
  readonly captured: Minor;
  readonly createdAt: string;
};

export type RefundRecord = {
  readonly id: string;
  readonly paymentId: string;
  readonly status: LifecycleStatus;
  readonly amount: Minor;
  readonly createdAt: string;
};

export type PayoutRecord = {
  readonly id: string;
  readonly batchId: string;
  /** `PENDING` reserves funds; `SUCCEEDED` has left the account; `FAILED` moved nothing. */
  readonly status: LifecycleStatus;
  readonly amount: Minor;
  readonly createdAt: string;
};

/** A recorded status transition, used to verify terminal monotonicity (INV-L7). */
export type StatusTransition = {
  readonly subjectId: string;
  readonly from: LifecycleStatus;
  readonly to: LifecycleStatus;
  readonly at: string;
};

export type BalanceAssertion = {
  /** The figure the application currently shows as "available". */
  readonly available: Minor;
  /** The figure the application currently shows as reserved / in-flight out. */
  readonly reserved: Minor;
  /** Everything before the snapshot window (ADR-0011 OPENING_BALANCE). */
  readonly opening: Minor;
};

export type LedgerSnapshot = {
  readonly organizationId: string;
  readonly currency: string;
  /** The instant this snapshot represents — every derived figure is as-of this. */
  readonly asOf: string;
  readonly postings: readonly Posting[];
  readonly payments: readonly PaymentRecord[];
  readonly refunds: readonly RefundRecord[];
  readonly payouts: readonly PayoutRecord[];
  readonly transitions: readonly StatusTransition[];
  /** What the app claims; the checker decides whether the claim is true. */
  readonly balance: BalanceAssertion;
  /** Inflow that has settled into the balance (net of fees), as the app derives it. */
  readonly settledInflow: Minor;
  /** Outflow that has fully settled out of the balance. */
  readonly settledOutflow: Minor;
};

/** An empty but well-formed snapshot — the identity case every checker must accept. */
export function emptySnapshot(organizationId: string, currency: string, asOf: string): LedgerSnapshot {
  const z = { units: 0, currency: currency.toUpperCase() } as const;
  return {
    organizationId,
    currency: currency.toUpperCase(),
    asOf,
    postings: [],
    payments: [],
    refunds: [],
    payouts: [],
    transitions: [],
    balance: { available: z, reserved: z, opening: z },
    settledInflow: z,
    settledOutflow: z,
  };
}
