export const SUBSCRIPTION_STATUSES = [
  "ACTIVE",
  "PENDING_SETUP",
  "PAST_DUE",
  "CANCELLED",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  ACTIVE: "Active",
  PENDING_SETUP: "Pending setup",
  PAST_DUE: "Past due",
  CANCELLED: "Cancelled",
};

export const SUBSCRIPTION_STATUS_TONES: Record<SubscriptionStatus, "success" | "pending" | "failed" | "neutral"> = {
  ACTIVE: "success",
  PENDING_SETUP: "pending",
  PAST_DUE: "failed",
  CANCELLED: "neutral",
};
