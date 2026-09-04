import type { CanonicalStatusMap } from "./projection";

/**
 * Canonical status maps per provider, used by the webhook projection (config in
 * docs/adr/0028 + INTEGRATION.md). The `observedProviderStatus` fed to the guard
 * is the provider event `type`; these maps map known types conservatively, and
 * anything un-listed becomes `UNKNOWN` (never a fake success).
 */

export const XENDIT_WEBHOOK_MAP: CanonicalStatusMap = {
  terminalSuccess: ["payment.succeeded", "payment.completed", "invoice.paid", "invoice.completed", "refund.succeeded"],
  terminalFailure: ["payment.failed", "invoice.expired", "invoice.cancelled", "refund.failed"],
  unknown: ["invoice.issued", "invoice.created", "payment.pending"],
};

export const STRIPE_WEBHOOK_MAP: CanonicalStatusMap = {
  terminalSuccess: ["payment_intent.succeeded", "charge.succeeded", "payout.paid", "transfer.created", "account.updated"],
  terminalFailure: ["payment_intent.payment_failed", "charge.failed", "payout.failed"],
  unknown: ["payment_intent.created", "charge.pending", "payment_intent.processing", "transfer.updated", "account.external_account.created"],
};
