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
 * Next automatic payout run for a schedule, or null for a manual schedule.
 * The partner's batch window opens 02:00 UTC, so every cadence lands there.
 * Deterministic and client-safe: the balance card and the settings page must
 * quote the same "next run" from the same settings.
 */
export function nextRunForCadence(
  cadence: PayoutCadence,
  weekday: Weekday,
  monthDay: number,
  now: Date = new Date()
): string | null {
  if (cadence === "manual") return null;

  const d = new Date(now);
  d.setUTCHours(2, 0, 0, 0);

  if (cadence === "daily") {
    if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  } else if (cadence === "weekly") {
    const target = WEEKDAYS.indexOf(weekday);
    const mondayIndex = (d.getUTCDay() + 6) % 7; // JS: 0 = Sunday
    let delta = (target - mondayIndex + 7) % 7;
    if (delta === 0 && d.getTime() <= now.getTime()) delta = 7;
    d.setUTCDate(d.getUTCDate() + delta);
  } else {
    const day = Math.min(28, Math.max(1, monthDay));
    d.setUTCDate(day);
    if (d.getTime() <= now.getTime()) d.setUTCMonth(d.getUTCMonth() + 1, day);
  }

  return d.toISOString();
}

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
