import "server-only";

// Wave 3/4 — Canonical Timeline data model (CMP-009, spec §17).
//
// The prototype rendered a transaction's `events[]` directly, which is why
// "Refund issued" appeared twice on SCR-006: the seed carries the event *and*
// the refund mutation appends another. This module is the single-event model —
// one entry per logical state change — plus the deterministic dedupe rule the
// UI and any server consumer must share. Keeping the rule here (not in the
// component) means a second render path cannot reintroduce duplicates.

/** Canonical action vocabulary. The UI maps each to a label/icon/tone. */
export const TIMELINE_ACTIONS = [
  // Money in
  "PAYMENT_CREATED",
  "PAYMENT_PENDING",
  "PAYMENT_SUCCEEDED",
  "PAYMENT_FAILED",
  "PAYMENT_RETRIED",
  // Payouts
  "PAYOUT_CREATED",
  "PAYOUT_PENDING",
  "PAYOUT_APPROVED",
  "PAYOUT_PROCESSING",
  "PAYOUT_PAID",
  "PAYOUT_PARTIAL",
  "PAYOUT_FAILED",
  "PAYOUT_CANCELLED",
  "PAYOUT_RETRIED",
  // Refunds
  "REFUND_REQUESTED",
  "REFUND_APPROVED",
  "REFUND_EXECUTED",
  "REFUND_REJECTED",
  "REFUND_FAILED",
  // Governance
  "BLOCKLIST_ADDED",
  "BLOCKLIST_REMOVED",
  "KYC_UPLOADED",
  "KYC_SUBMITTED",
  "KYC_APPROVED",
  "KYC_REJECTED",
  // Webhooks
  "WEBHOOK_RECEIVED",
  "WEBHOOK_DUPLICATED",
  "WEBHOOK_REJECTED",
  "WEBHOOK_REPLAYED",
  // Cross-role handoff (Wave 4)
  "HANDOFF_OPENED",
  "HANDOFF_NOTIFIED",
  "HANDOFF_CLAIMED",
  "HANDOFF_COMPLETED",
] as const;

export type TimelineAction = (typeof TIMELINE_ACTIONS)[number];

export type TimelineEntry = {
  /** Stable id for React keys. */
  id: string;
  /** The record this entry belongs to (transaction id, batch id, …). */
  entityId: string;
  /** Discriminator so ids from different stores cannot collide. */
  entityType: "transaction" | "payout_batch" | "refund" | "kyc" | "webhook" | "blocklist" | "handoff";
  /** Canonical action — drives label/icon in the UI. */
  action: TimelineAction | string;
  /** Who did it. `null` when the actor is a system/provider callback. */
  actor: string | null;
  /** ISO-8601 instant. Required — a timeline without a clock is not a timeline. */
  timestamp: string;
  fromState?: string | null;
  toState?: string | null;
  /** Human-readable justification (refund reason, block reason, failure cause). */
  reason?: string | null;
  /** Secondary detail line. */
  detail?: string | null;
};

/**
 * Deterministic dedupe key: actor + action + entity type + entity id + instant.
 *
 * Two entries with the same key are the *same* logical event recorded twice
 * (seed + mutation, or a retried webhook), so exactly one survives. The
 * timestamp is normalised to epoch seconds so `2026-01-01T10:00:00.000Z` and
 * `2026-01-01T10:00:00Z` collapse to one entry.
 *
 * `entityType` is part of the key because a merged timeline (transaction +
 * payout + handoff) can legitimately contain two different records that share
 * an id, an actor and an instant — without the discriminator the dedupe would
 * silently swallow one of them.
 */
export function timelineKey(
  entry: Pick<TimelineEntry, "actor" | "action" | "entityType" | "entityId" | "timestamp">,
): string {
  const ms = new Date(entry.timestamp).getTime();
  const normalised = Number.isFinite(ms) ? String(Math.floor(ms / 1000)) : String(entry.timestamp);
  return [entry.actor ?? "system", entry.action, entry.entityType, entry.entityId, normalised].join("|");
}

/** Remove duplicate logical events, keeping the first occurrence. */
export function dedupeTimeline(entries: readonly TimelineEntry[]): TimelineEntry[] {
  const seen = new Set<string>();
  const out: TimelineEntry[] = [];
  for (const entry of entries) {
    const key = timelineKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/** Newest first; ties broken by id so ordering is stable across renders. */
export function sortTimeline(entries: readonly TimelineEntry[]): TimelineEntry[] {
  return [...entries].sort((a, b) => {
    const at = new Date(a.timestamp).getTime();
    const bt = new Date(b.timestamp).getTime();
    if (bt !== at) return bt - at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Canonical pipeline: dedupe, then sort. Every consumer calls this. */
export function buildTimeline(entries: readonly TimelineEntry[]): TimelineEntry[] {
  return sortTimeline(dedupeTimeline(entries));
}

// ---------------------------------------------------------------------------
// Adapters — project the legacy per-store event logs onto the canonical model.
// ---------------------------------------------------------------------------

type LegacyEvent = { id: string; at: string; label: string; detail?: string };

/** Label → canonical action. Unmapped labels fall back to a generic action. */
const LABEL_TO_ACTION: Record<string, TimelineAction> = {
  "Payment created": "PAYMENT_CREATED",
  "Authorization requested": "PAYMENT_PENDING",
  "Awaiting confirmation": "PAYMENT_PENDING",
  "Payment captured": "PAYMENT_SUCCEEDED",
  "Provider transaction": "PAYMENT_PENDING",
  "Authorization declined": "PAYMENT_FAILED",
  "Payment retried": "PAYMENT_RETRIED",
  // Two-phase refund (Wave 4 §4): the request and the execution are different
  // logical events, so they get different canonical actions. Mapping "Refund
  // requested" to the PAYMENT_PENDING fallback would hide the handoff in the UI.
  "Refund requested": "REFUND_REQUESTED",
  "Refund issued": "REFUND_EXECUTED",
  "Partial refund issued": "REFUND_EXECUTED",
  "Refund rejected": "REFUND_REJECTED",
  "Batch created": "PAYOUT_CREATED",
  Scheduled: "PAYOUT_PENDING",
  "Disbursement started": "PAYOUT_PROCESSING",
  Completed: "PAYOUT_PAID",
  "Completed with failures": "PAYOUT_PARTIAL",
  "Batch cancelled": "PAYOUT_CANCELLED",
  "Failures retried": "PAYOUT_RETRIED",
  "Recipient retried": "PAYOUT_RETRIED",
};

export function actionForLabel(label: string): TimelineAction {
  return LABEL_TO_ACTION[label] ?? "PAYMENT_PENDING";
}

/** Project a transaction's `events[]` into canonical timeline entries. */
export function timelineFromTransactionEvents(
  transactionId: string,
  events: readonly LegacyEvent[],
  actor: string | null = null,
): TimelineEntry[] {
  return events.map((event) => ({
    id: event.id,
    entityId: transactionId,
    entityType: "transaction" as const,
    action: actionForLabel(event.label),
    actor,
    timestamp: event.at,
    reason: event.label,
    detail: event.detail ?? null,
  }));
}

/** Project a payout batch's `timeline[]` into canonical timeline entries. */
export function timelineFromPayoutEvents(
  batchId: string,
  events: readonly LegacyEvent[],
  actor: string | null = null,
): TimelineEntry[] {
  return events.map((event) => ({
    id: event.id,
    entityId: batchId,
    entityType: "payout_batch" as const,
    action: actionForLabel(event.label),
    actor,
    timestamp: event.at,
    reason: event.label,
    detail: event.detail ?? null,
  }));
}
