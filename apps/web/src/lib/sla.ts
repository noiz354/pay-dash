// Wave 4 — SLA / overdue model (spec §7 exception-first dashboard, Wave 4 §3).
//
// Every band is derived from a **real backend timestamp** (createdAt /
// scheduledFor / lastFailedAt / dueDate) and a per-entity-type policy. Nothing
// here invents a clock: `evaluateSla` takes `now` as an argument so the
// derivation is deterministic and unit-testable, and callers on the server pass
// the same instant used to aggregate the Command Center — so a badge on a card
// and the count in the lane can never disagree.
//
// Bands:
//   NORMAL      — inside the SLA window, no action implied
//   APPROACHING — >= 75% of the window consumed; act soon
//   OVERDUE     — window elapsed; SLA breached
//   CRITICAL    — overdue beyond the escalation threshold

/** Ordered worst-last so `sort` puts the most urgent first when reversed. */
export const SLA_BANDS = ["NORMAL", "APPROACHING", "OVERDUE", "CRITICAL"] as const;
export type SlaBand = (typeof SLA_BANDS)[number];

/** Severity rank — higher is more urgent. Used for sorting and lane assignment. */
export const SLA_SEVERITY: Record<SlaBand, number> = {
  NORMAL: 0,
  APPROACHING: 1,
  OVERDUE: 2,
  CRITICAL: 3,
};

/** Entity kinds that carry an SLA. Each maps to a real backend record. */
export const SLA_ENTITY_TYPES = [
  "payout_batch",
  "refund",
  "kyc_submission",
  "failed_payout",
  "failed_payment",
  "webhook_delivery",
  "invoice",
  "team_invite",
  "blocked_payment",
  "transaction_settlement",
] as const;
export type SlaEntityType = (typeof SLA_ENTITY_TYPES)[number];

export type SlaPolicy = {
  entityType: SlaEntityType;
  /** Seconds from the anchor timestamp until the item is due. */
  dueSeconds: number;
  /** Fraction of `dueSeconds` at which APPROACHING begins (0..1). */
  approachingAt: number;
  /** Seconds *past* due at which the item escalates to CRITICAL. */
  criticalAfterSeconds: number;
  /** Human-readable commitment, surfaced in tooltips and analytics. */
  commitment: string;
};

const HOUR = 3600;
const DAY = 24 * HOUR;

/**
 * Operational SLA policy. Values are business commitments for a same-day
 * settlement desk; they are the single source of truth for badges, lanes,
 * filters, sorting and the `sla_breached` event.
 */
export const SLA_POLICIES: Record<SlaEntityType, SlaPolicy> = {
  // Money out is the most time-sensitive: an unapproved batch stalls payroll.
  payout_batch: { entityType: "payout_batch", dueSeconds: 4 * HOUR, approachingAt: 0.75, criticalAfterSeconds: 20 * HOUR, commitment: "Approve within 4h" },
  // Dual-control refund — the second actor must not sit on it overnight.
  refund: { entityType: "refund", dueSeconds: 8 * HOUR, approachingAt: 0.75, criticalAfterSeconds: 40 * HOUR, commitment: "Second approval within 8h" },
  failed_payout: { entityType: "failed_payout", dueSeconds: 2 * HOUR, approachingAt: 0.75, criticalAfterSeconds: 10 * HOUR, commitment: "Retry within 2h" },
  failed_payment: { entityType: "failed_payment", dueSeconds: 4 * HOUR, approachingAt: 0.75, criticalAfterSeconds: 20 * HOUR, commitment: "Triage within 4h" },
  blocked_payment: { entityType: "blocked_payment", dueSeconds: 4 * HOUR, approachingAt: 0.75, criticalAfterSeconds: 8 * HOUR, commitment: "Fraud review within 4h" },
  kyc_submission: { entityType: "kyc_submission", dueSeconds: 1 * DAY, approachingAt: 0.75, criticalAfterSeconds: 2 * DAY, commitment: "Verify within 24h" },
  webhook_delivery: { entityType: "webhook_delivery", dueSeconds: 1 * DAY, approachingAt: 0.75, criticalAfterSeconds: 6 * DAY, commitment: "Resolve within 24h" },
  // Invoices are due on their own dueDate — the policy only governs escalation.
  invoice: { entityType: "invoice", dueSeconds: 0, approachingAt: 0.75, criticalAfterSeconds: 7 * DAY, commitment: "Pay by due date" },
  // Spec §32: team invites expire after 7 days; nudge before that.
  team_invite: { entityType: "team_invite", dueSeconds: 5 * DAY, approachingAt: 0.8, criticalAfterSeconds: 2 * DAY, commitment: "Accept within 7d" },
  // Wave 4 ledger wiring: an open payment (PENDING/PROCESSING) carries a
  // settlement commitment. Without it the transactions table could not speak
  // the same four-band vocabulary as the Command Center — "Overdue" would mean
  // one thing on a card and another on a ledger row.
  transaction_settlement: { entityType: "transaction_settlement", dueSeconds: 4 * HOUR, approachingAt: 0.75, criticalAfterSeconds: 20 * HOUR, commitment: "Confirm settlement within 4h" },
};

export function slaPolicyFor(entityType: SlaEntityType): SlaPolicy {
  return SLA_POLICIES[entityType];
}

export type SlaEvaluation = {
  band: SlaBand;
  /** Seconds since the anchor timestamp (never negative — clamped to 0). */
  ageSeconds: number;
  /** The SLA window in seconds for this entity type. */
  dueSeconds: number;
  /** Seconds until due; negative once overdue. */
  remainingSeconds: number;
  /** ISO instant the SLA is/was due. */
  dueAt: string;
  /** True for OVERDUE and CRITICAL — i.e. the commitment was missed. */
  breached: boolean;
  /** 0..1+ progress through the window; >1 means overdue. */
  progress: number;
};

function toTime(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Evaluate an SLA band from a real timestamp.
 *
 * `anchor` is the moment the clock starts (createdAt, lastFailedAt, …).
 * `explicitDueAt` overrides the policy window for entities that carry their own
 * deadline (invoice dueDate, invite expiry) — the policy then only governs when
 * OVERDUE escalates to CRITICAL.
 *
 * Returns `null` when the anchor is missing or unparseable, so callers can
 * render "no SLA" instead of silently claiming NORMAL.
 */
export function evaluateSla(
  entityType: SlaEntityType,
  anchor: Date | string | number | null | undefined,
  options: { now?: Date | string | number; explicitDueAt?: Date | string | number | null } = {},
): SlaEvaluation | null {
  const policy = slaPolicyFor(entityType);
  const anchorMs = toTime(anchor);
  if (anchorMs === null) return null;

  const nowMs = toTime(options.now) ?? Date.now();
  const explicitDueMs = toTime(options.explicitDueAt);

  const dueMs = explicitDueMs !== null ? explicitDueMs : anchorMs + policy.dueSeconds * 1000;
  const ageSeconds = Math.max(0, Math.floor((nowMs - anchorMs) / 1000));
  const remainingSeconds = Math.floor((dueMs - nowMs) / 1000);

  // Window used for the APPROACHING fraction: an explicit deadline measures
  // from the anchor to that deadline, otherwise it is the policy window.
  const windowSeconds = explicitDueMs !== null ? Math.max(1, Math.floor((explicitDueMs - anchorMs) / 1000)) : policy.dueSeconds;
  const progress = windowSeconds > 0 ? (nowMs - anchorMs) / 1000 / windowSeconds : remainingSeconds <= 0 ? 1 : 0;

  let band: SlaBand;
  if (remainingSeconds <= 0) {
    const overdueBy = -remainingSeconds;
    band = overdueBy >= policy.criticalAfterSeconds ? "CRITICAL" : "OVERDUE";
  } else if (windowSeconds > 0 && progress >= policy.approachingAt) {
    band = "APPROACHING";
  } else {
    band = "NORMAL";
  }

  return {
    band,
    ageSeconds,
    dueSeconds: windowSeconds,
    remainingSeconds,
    dueAt: new Date(dueMs).toISOString(),
    breached: band === "OVERDUE" || band === "CRITICAL",
    progress: Number(progress.toFixed(4)),
  };
}

/** Sort helper: most urgent band first, then oldest first within a band. */
export function compareSla(a: { band: SlaBand; ageSeconds: number }, b: { band: SlaBand; ageSeconds: number }): number {
  const bySeverity = SLA_SEVERITY[b.band] - SLA_SEVERITY[a.band];
  if (bySeverity !== 0) return bySeverity;
  return b.ageSeconds - a.ageSeconds;
}

/** Whether a band should be surfaced in the Overdue lane. */
export function isOverdueBand(band: SlaBand): boolean {
  return band === "OVERDUE" || band === "CRITICAL";
}

export const SLA_BAND_LABELS: Record<SlaBand, string> = {
  NORMAL: "On track",
  APPROACHING: "Approaching SLA",
  OVERDUE: "Overdue",
  CRITICAL: "Critically overdue",
};

export function slaBandLabel(band: SlaBand): string {
  return SLA_BAND_LABELS[band];
}

/**
 * Compact, locale-independent human countdown ("3h left", "2d overdue").
 * Deliberately avoids `Intl.RelativeTimeFormat` so server and client render the
 * same string and hydration cannot mismatch.
 */
export function formatSlaRemaining(remainingSeconds: number): string {
  const abs = Math.abs(Math.floor(remainingSeconds));
  const suffix = remainingSeconds < 0 ? "overdue" : "left";
  if (abs < 60) return `${abs}s ${suffix}`;
  const minutes = Math.floor(abs / 60);
  if (minutes < 60) return `${minutes}m ${suffix}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${suffix}`;
  const days = Math.floor(hours / 24);
  return `${days}d ${suffix}`;
}
