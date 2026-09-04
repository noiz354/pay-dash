// Client-safe webhook vocabulary. The receiving route (INTEGRATION.md §7)
// persists into `server/data/webhooks.ts`, which imports "server-only";
// anything a client component needs lives here — the same split as
// lib/balance-status.ts and lib/link-status.ts.

export const WEBHOOK_STATUSES = ["RECEIVED", "DUPLICATED", "REJECTED"] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];

export const WEBHOOK_STATUS_LABELS: Record<WebhookStatus, string> = {
  RECEIVED: "Received",
  DUPLICATED: "Duplicated",
  REJECTED: "Rejected",
};

export const WEBHOOK_SOURCE_LABELS = {
  xendit: "Xendit",
  stripe: "Stripe",
  simulate: "Simulated",
  replay: "Replay",
} as const;
export type WebhookSource = keyof typeof WEBHOOK_SOURCE_LABELS;

// Event types the handler in /api/webhooks/xendit switches on
// (INTEGRATION.md §7) plus the canonical Stripe events the Stripe ingress
// accepts (ADR-0028: charge/transfer/payout/capability events). Anything else
// is stored and flagged `unhandled`.
export const KNOWN_WEBHOOK_EVENTS = [
  "payment.succeeded",
  "payment.completed",
  "invoice.paid",
  "invoice.completed",
  "refund.succeeded",
  // Stripe canonical events (ADR-0028, webhook scope).
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.succeeded",
  "charge.refunded",
  "charge.refund.updated",
  "payout.paid",
  "payout.failed",
  "transfer.created",
  "transfer.updated",
  "account.updated",
  "account.external_account.created",
] as const;

// Type-filter options: the known types plus the "everything else" bucket.
export const WEBHOOK_TYPE_FILTERS = [...KNOWN_WEBHOOK_EVENTS, "unknown"] as const;
export type WebhookTypeFilter = (typeof WEBHOOK_TYPE_FILTERS)[number];

// What the TEST MODE simulator can send. "invoice.issued" is deliberately
// outside KNOWN_WEBHOOK_EVENTS — it demonstrates the unhandled path.
export const SIMULATABLE_WEBHOOK_EVENTS = [
  "payment.succeeded",
  "invoice.paid",
  "refund.succeeded",
  "invoice.issued",
] as const;
export type SimulatableWebhookEvent = (typeof SIMULATABLE_WEBHOOK_EVENTS)[number];
