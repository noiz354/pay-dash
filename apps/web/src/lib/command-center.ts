// Client-safe Command Center vocabulary.
//
// `server/data/command-center.ts` imports "server-only", so anything a client
// component needs at runtime (lane ids, labels, icons, DTO types) lives here —
// the same seam `lib/payout-status.ts` provides for `server/data/payouts.ts`.
// Both sides import this module, so the lane list cannot drift between the
// aggregator and the UI.

import type { Permission } from "@/domain/organization/roles";
import type { SlaBand } from "./sla";

export const COMMAND_CENTER_LANES = [
  "critical",
  "needs_attention",
  "pending_approval",
  "failed",
  "overdue",
  "recently_completed",
] as const;
export type CommandCenterLane = (typeof COMMAND_CENTER_LANES)[number];

export type LaneTone = "critical" | "warning" | "pending" | "neutral" | "success";

export type LaneMeta = {
  label: string;
  icon: string;
  tone: LaneTone;
  blurb: string;
  /** Lanes that represent exceptions (everything but the completed lane). */
  isException: boolean;
  /**
   * A cross-cut lane re-reports records already counted in another lane (an
   * overdue item is also critical or pending). It is still an exception lane for
   * rendering and for "how many lanes have work", but it must never be summed
   * into `totals.exceptions` or the same record is counted twice.
   */
  crossCut: boolean;
};

export const LANE_META: Record<CommandCenterLane, LaneMeta> = {
  critical: {
    label: "Critical",
    icon: "emergency",
    tone: "critical",
    blurb: "SLA breached or money is stuck — act now.",
    isException: true,
    crossCut: false,
  },
  needs_attention: {
    label: "Needs Attention",
    icon: "notification_important",
    tone: "warning",
    blurb: "Approaching a deadline or flagged for review.",
    isException: true,
    crossCut: false,
  },
  pending_approval: {
    label: "Pending Approval",
    icon: "pending_actions",
    tone: "pending",
    blurb: "Waiting on a second actor to continue.",
    isException: true,
    crossCut: false,
  },
  failed: {
    label: "Failed",
    icon: "error",
    tone: "critical",
    blurb: "Terminal failures that can be retried or triaged.",
    isException: true,
    crossCut: false,
  },
  overdue: {
    label: "Overdue",
    icon: "timer_off",
    tone: "warning",
    blurb: "Anything still open past its SLA deadline.",
    isException: true,
    crossCut: true,
  },
  recently_completed: {
    label: "Recently Completed",
    icon: "task_alt",
    tone: "success",
    blurb: "Resolved in the last 24 hours.",
    isException: false,
    crossCut: false,
  },
};

/** Lanes rendered in the exception grid, in urgency order (includes the cross-cut). */
export const EXCEPTION_LANES: readonly CommandCenterLane[] = COMMAND_CENTER_LANES.filter((lane) => LANE_META[lane].isException);

/**
 * The exception lanes whose records are *disjoint* — exactly the set summed into
 * `totals.exceptions`. Both the aggregator and the client use this list, so the
 * invariant `totals.exceptions === sum(totals[lane] for lane in COUNTED_EXCEPTION_LANES)`
 * holds by construction rather than by convention.
 */
export const COUNTED_EXCEPTION_LANES: readonly CommandCenterLane[] = EXCEPTION_LANES.filter(
  (lane) => !LANE_META[lane].crossCut,
);

export type CommandCenterItem = {
  /** Stable id — used for React keys and analytics (never contains PII). */
  id: string;
  lane: CommandCenterLane;
  title: string;
  description: string;
  count: number;
  /** Deep link into the filtered list where the work is finished. */
  href: string;
  icon: string;
  tone: LaneTone;
  /** Permission needed to act. The card adapts when the viewer lacks it. */
  permission: Permission | null;
  severity: number;
  slaBand: SlaBand | null;
  /** Age of the oldest item in the group — drives "3h overdue" copy. */
  oldestAgeSeconds: number | null;
  /** Non-PII entity labels so the card is concrete without a round trip. */
  samples: string[];
  /** Whether the viewer may act. Computed server-side from the session roles. */
  canAct: boolean;
};

export type CommandCenterTotals = Record<CommandCenterLane, number> & {
  /** Sum of the exception lanes. `overdue` is excluded — it cross-cuts the others. */
  exceptions: number;
};

export type CommandCenterDto = {
  /** ISO instant the snapshot was built; every SLA used this same instant. */
  generatedAt: string;
  allClear: boolean;
  totals: CommandCenterTotals;
  lanes: Record<CommandCenterLane, CommandCenterItem[]>;
};

/** Empty snapshot — the shape the client starts from before the first read. */
export function emptyCommandCenter(generatedAt = new Date().toISOString()): CommandCenterDto {
  return {
    generatedAt,
    allClear: true,
    totals: {
      critical: 0,
      needs_attention: 0,
      pending_approval: 0,
      failed: 0,
      overdue: 0,
      recently_completed: 0,
      exceptions: 0,
    },
    lanes: {
      critical: [],
      needs_attention: [],
      pending_approval: [],
      failed: [],
      overdue: [],
      recently_completed: [],
    },
  };
}

/**
 * Validate an untrusted payload from the polling endpoint. The client must not
 * crash on a partial or malformed response — that is the difference between an
 * error state and a blank dashboard.
 */
export function isCommandCenterDto(value: unknown): value is CommandCenterDto {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.generatedAt !== "string") return false;
  if (typeof v.allClear !== "boolean") return false;
  if (!v.totals || typeof v.totals !== "object") return false;
  if (!v.lanes || typeof v.lanes !== "object") return false;
  const lanes = v.lanes as Record<string, unknown>;
  return COMMAND_CENTER_LANES.every((lane) => Array.isArray(lanes[lane]));
}
