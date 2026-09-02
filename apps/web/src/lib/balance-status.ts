// Client-safe balance vocabulary.
// `server/data/balance.ts` imports "server-only", so anything a client
// component needs at runtime (type/status lists, labels, icons) lives here —
// the same split as lib/payout-status.ts.

export const MOVEMENT_TYPES = ["TOP_UP", "SETTLEMENT", "REFUND", "WITHDRAWAL"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  TOP_UP: "Top Up",
  SETTLEMENT: "Settlement",
  REFUND: "Refund",
  WITHDRAWAL: "Withdrawal",
};

export const MOVEMENT_TYPE_ICONS: Record<MovementType, string> = {
  TOP_UP: "savings",
  SETTLEMENT: "account_balance_wallet",
  REFUND: "refund",
  WITHDRAWAL: "arrow_upward",
};

/**
 * Top-up rails offered by the Top Up dialog. Must stay in sync with the
 * zod enum in server/actions/balance.ts — both import this list.
 */
export const TOPUP_METHODS = [
  "BCA Virtual Account",
  "Mandiri Virtual Account",
  "BNI Virtual Account",
  "QRIS — GoPay",
  "Card",
] as const;

export const MOVEMENT_STATUSES = ["SETTLED", "PENDING", "FAILED"] as const;
export type MovementStatus = (typeof MOVEMENT_STATUSES)[number];

export const MOVEMENT_STATUS_LABELS: Record<MovementStatus, string> = {
  SETTLED: "Settled",
  PENDING: "Pending",
  FAILED: "Failed",
};
