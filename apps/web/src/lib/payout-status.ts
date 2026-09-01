// Client-safe payout vocabulary.
// `server/data/payouts.ts` imports "server-only", so anything a client
// component needs at runtime (status lists, labels, icons, guards) lives here.

export const PAYOUT_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "PROCESSING",
  "PAID",
  "PARTIAL",
  "FAILED",
  "RETURNED",
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  PROCESSING: "Processing",
  PAID: "Paid",
  PARTIAL: "Partially paid",
  FAILED: "Failed",
  RETURNED: "Returned",
};

export const PAYOUT_STATUS_ICONS: Record<PayoutStatus, string> = {
  DRAFT: "edit_note",
  SCHEDULED: "event_upcoming",
  PROCESSING: "pending_actions",
  PAID: "task_alt",
  PARTIAL: "rule",
  FAILED: "error",
  RETURNED: "undo",
};

/** Recipients only ever hold this subset. */
export const RECIPIENT_STATUSES = ["PENDING", "PAID", "FAILED", "RETURNED"] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

/** A batch can only be sent while it is still editable. */
export function isApprovable(status: PayoutStatus) {
  return status === "DRAFT" || status === "SCHEDULED";
}

/** Failed and returned rows can be re-attempted. */
export function isRetryable(status: PayoutStatus) {
  return status === "FAILED" || status === "PARTIAL" || status === "RETURNED";
}

export function isCancellable(status: PayoutStatus) {
  return status === "DRAFT" || status === "SCHEDULED";
}

export const PAYOUT_CADENCES = ["daily", "weekly", "monthly", "manual"] as const;
export type PayoutCadence = (typeof PAYOUT_CADENCES)[number];

export const PAYOUT_CADENCE_LABELS: Record<PayoutCadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  manual: "Manual only",
};

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/**
 * Accepts "50,000", "Rp 50.000", "50000" → 50000. Returns null when the string
 * holds no digits, so the form can distinguish "empty" from "zero".
 */
export function parseAmount(input: string): number | null {
  const digits = input.replace(/[^\d]/g, "");
  if (!digits) return null;
  return Number(digits);
}

/** Indonesian bank account numbers: 8–20 digits, spaces and dashes tolerated. */
export function isValidAccountNumber(value: string) {
  const digits = value.replace(/[\s-]/g, "");
  return /^\d{8,20}$/.test(digits);
}
