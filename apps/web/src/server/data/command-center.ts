import "server-only";

import type { OrganizationRole, Permission } from "@/domain/organization/roles";
import { hasPermission } from "@/domain/organization/roles";
import { SLA_SEVERITY, type SlaBand } from "@/lib/sla";
import {
  COMMAND_CENTER_LANES,
  COUNTED_EXCEPTION_LANES,
  LANE_META,
  type CommandCenterDto,
  type CommandCenterItem,
  type CommandCenterLane,
  type CommandCenterTotals,
} from "@/lib/command-center";
import { getPayoutBatches } from "./payouts";
import { getLedgerRows } from "./transactions";
import { listWebhooks } from "./webhooks";
import { canActOnHandoff } from "./handoff-store";
import { deriveHandoffs, type DerivedHandoff } from "./handoff";

export { COMMAND_CENTER_LANES, LANE_META };
export type { CommandCenterDto, CommandCenterItem, CommandCenterLane, CommandCenterTotals };

// Wave 4 §2 — Command Center aggregation.
//
// The dashboard stops being a summary and becomes the operational surface: six
// lanes, each an *exception* queue an actor can walk into and finish. Every item
// is derived from the same stores the list screens read, so a count here and the
// filtered list behind it are the same query and cannot disagree.
//
// Lane semantics (an item appears in exactly one primary lane, plus — when its
// SLA has elapsed — the Overdue lane, which is a cross-cut):
//   critical            SLA critically breached, or money is stuck/failed
//   needs_attention     approaching SLA, or high-risk but inside the window
//   pending_approval    waiting on a second actor (cross-role handoff)
//   failed              terminal failure needing retry or triage
//   overdue             any pending item past its SLA deadline
//   recently_completed  resolved in the last 24h — proof the queue drains
//
// PII rule: `samples` carry reference/batch ids only. Risk alert titles in the
// store embed a customer name; that never reaches a lane card or an event.

export type CommandCenterSnapshot = {
  /** Single instant every SLA in this snapshot was evaluated against. */
  generatedAt: string;
  lanes: Record<CommandCenterLane, CommandCenterItem[]>;
  totals: CommandCenterTotals;
  /** True when no exception lane has anything in it — the celebrate state. */
  allClear: boolean;
  /** Roles this snapshot's `canAct` flags were computed for. */
  roles: OrganizationRole[];
};

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_SAMPLES = 3;

/**
 * An item before the viewer's permissions are applied.
 *
 * `canActOverride` carries the answer for the handoff-derived lanes, whose
 * `permission` is null because they aggregate several journeys. For those the
 * truthful answer is "can this actor close at least one of the handoffs in the
 * group?" — a flat `true` would advertise a button that the target screen would
 * then have to refuse.
 */
type RawItem = Omit<CommandCenterItem, "canAct"> & { canActOverride?: boolean };
type Sample = { ageSeconds: number | null; band: SlaBand | null; label: string };

function group(
  id: string,
  lane: CommandCenterLane,
  meta: { title: string; description: string; href: string; icon: string; permission: Permission | null },
  rows: Sample[],
): RawItem | null {
  if (rows.length === 0) return null;

  const oldest = rows.reduce<number | null>(
    (max, r) => (r.ageSeconds === null ? max : max === null ? r.ageSeconds : Math.max(max, r.ageSeconds)),
    null,
  );
  const worst = rows.reduce<SlaBand | null>((band, r) => {
    if (!r.band) return band;
    if (!band) return r.band;
    return SLA_SEVERITY[r.band] > SLA_SEVERITY[band] ? r.band : band;
  }, null);

  return {
    id,
    lane,
    title: meta.title,
    description: meta.description,
    count: rows.length,
    href: meta.href,
    icon: meta.icon,
    tone: LANE_META[lane].tone,
    permission: meta.permission,
    severity: worst ? SLA_SEVERITY[worst] : lane === "critical" ? 3 : lane === "failed" ? 2 : 1,
    slaBand: worst,
    oldestAgeSeconds: oldest,
    samples: rows.slice(0, MAX_SAMPLES).map((r) => r.label),
  };
}

function groupHandoffs(
  handoffs: DerivedHandoff[],
  lane: CommandCenterLane,
  id: string,
  meta: Parameters<typeof group>[2],
  predicate: (h: DerivedHandoff) => boolean,
  roles: OrganizationRole[],
): RawItem | null {
  const rows = handoffs.filter(predicate);
  const item = group(
    id,
    lane,
    meta,
    rows.map((h) => ({ ageSeconds: h.slaAgeSeconds, band: h.slaBand, label: h.entityLabel })),
  );
  if (!item) return null;
  return { ...item, canActOverride: rows.some((h) => canActOnHandoff(h, roles)) };
}

function canAct(permission: Permission | null, roles: OrganizationRole[]): boolean {
  // A null permission means the lane is informational (an aggregate of several
  // journeys) — the per-item authority is resolved on the target screen.
  if (permission === null) return true;
  return roles.some((r) => hasPermission(r, permission));
}

/**
 * Build the Command Center snapshot.
 *
 * `roles` drives the `canAct` flag on every item: an item the actor cannot act on
 * is still shown (hiding it recreates the dead end), but the card renders "waiting
 * on Finance Admin" instead of a button that would 403. Pass `[]` for a session
 * with no granted roles.
 */
export async function getCommandCenter(roles: OrganizationRole[] = [], now: Date = new Date()): Promise<CommandCenterSnapshot> {
  const handoffs = await deriveHandoffs(now);
  const pending = handoffs.filter((h) => h.status === "OPEN" || h.status === "NOTIFIED" || h.status === "CLAIMED");
  const batches = getPayoutBatches();
  const ledger = getLedgerRows();

  const raw: Record<CommandCenterLane, RawItem[]> = {
    critical: [],
    needs_attention: [],
    pending_approval: [],
    failed: [],
    overdue: [],
    recently_completed: [],
  };

  // --- CRITICAL: SLA critically breached, or failed money ------------------
  const criticalSla = groupHandoffs(pending, "critical", "critical-sla", {
    title: "Critically overdue",
    description: "Open work far past its SLA deadline.",
    href: "/dashboard?lane=critical",
    icon: "emergency",
    permission: null,
  }, (h) => h.slaBand === "CRITICAL", roles);
  if (criticalSla) raw.critical.push(criticalSla);

  const criticalFailedMoney = group(
    "critical-failed-batches",
    "critical",
    {
      title: "Failed payout batches",
      description: "Batches where no recipient was paid — money is reserved, not settled.",
      href: "/payouts?status=FAILED",
      icon: "payments",
      permission: "payout.retry",
    },
    batches
      .filter((b) => b.status === "FAILED")
      .map((b) => ({
        ageSeconds: ageOf(now, b.completedAt ?? b.createdAt),
        band: null,
        label: b.name || b.id,
      })),
  );
  if (criticalFailedMoney) raw.critical.push(criticalFailedMoney);

  // --- NEEDS ATTENTION: approaching SLA ------------------------------------
  const approaching = groupHandoffs(pending, "needs_attention", "attention-approaching", {
    title: "Approaching SLA",
    description: "Still inside the window, but the deadline is close.",
    href: "/dashboard?lane=needs_attention",
    icon: "notification_important",
    permission: null,
  }, (h) => h.slaBand === "APPROACHING", roles);
  if (approaching) raw.needs_attention.push(approaching);

  const highRisk = group(
    "attention-high-risk",
    "needs_attention",
    {
      title: "High-risk payments",
      description: "Ledger rows above the risk threshold awaiting review.",
      href: "/risk",
      icon: "shield",
      permission: "audit.read",
    },
    ledger
      .filter((t) => t.riskScore >= 65 && t.status !== "REFUNDED")
      // Reference id only — never the customer name.
      .map((t) => ({ ageSeconds: ageOf(now, t.createdAt), band: null, label: t.referenceId })),
  );
  if (highRisk) raw.needs_attention.push(highRisk);

  // --- PENDING APPROVAL: cross-role handoffs -------------------------------
  const pendingApproval = groupHandoffs(pending, "pending_approval", "pending-handoffs", {
    title: "Awaiting a second actor",
    description: "Handoffs that cannot progress until someone with the right permission acts.",
    href: "/dashboard?lane=pending_approval",
    icon: "pending_actions",
    permission: null,
  }, (h) => h.journey === "payout_approval" || h.journey === "refund_approval" || h.journey === "kyc_review", roles);
  if (pendingApproval) raw.pending_approval.push(pendingApproval);

  // --- FAILED: retryable terminal failures ---------------------------------
  const failedPayments = group(
    "failed-payments",
    "failed",
    {
      title: "Failed payments",
      description: "Ledger rows that can be retried or triaged.",
      href: "/transactions?status=FAILED",
      icon: "receipt_long",
      permission: "money_in.create",
    },
    ledger
      .filter((t) => t.status === "FAILED")
      .map((t) => ({ ageSeconds: ageOf(now, t.updatedAt || t.createdAt), band: null, label: t.referenceId })),
  );
  if (failedPayments) raw.failed.push(failedPayments);

  const failedRecipients = batches
    .filter((b) => b.status === "PARTIAL" || b.status === "RETURNED")
    .flatMap((b) => b.recipients.filter((r) => r.status === "FAILED" || r.status === "RETURNED").map((r) => ({ batch: b, recipient: r })));
  const failedPayoutRecipients = group(
    "failed-recipients",
    "failed",
    {
      title: "Failed payout recipients",
      description: "Individual recipients in partial batches — retry without re-uploading.",
      href: "/payouts?status=PARTIAL",
      icon: "replay",
      permission: "payout.retry",
    },
    failedRecipients.map(({ batch, recipient }) => ({
      ageSeconds: ageOf(now, batch.completedAt ?? batch.createdAt),
      band: null,
      // Recipient reference only — the recipient name is PII.
      label: recipient.reference || batch.id,
    })),
  );
  if (failedPayoutRecipients) raw.failed.push(failedPayoutRecipients);

  const rejectedWebhooks = listWebhooks({ status: "REJECTED", page: 1, pageSize: 100 }).rows.filter(
    (e) => now.getTime() - new Date(e.receivedAt).getTime() <= 7 * RECENT_WINDOW_MS,
  );
  const webhookFailures = group(
    "failed-webhooks",
    "failed",
    {
      title: "Rejected webhook deliveries",
      description: "Inbound callbacks rejected in the last 7 days.",
      href: "/webhooks?status=REJECTED",
      icon: "webhook",
      permission: "provider.connect.test",
    },
    rejectedWebhooks.map((e) => ({ ageSeconds: ageOf(now, e.receivedAt), band: null, label: e.eventId })),
  );
  if (webhookFailures) raw.failed.push(webhookFailures);

  // --- OVERDUE: cross-cut of every pending item past its deadline ----------
  const overdue = groupHandoffs(pending, "overdue", "overdue-handoffs", {
    title: "Past SLA deadline",
    description: "Open handoffs whose commitment has already elapsed.",
    href: "/dashboard?lane=overdue",
    icon: "timer_off",
    permission: null,
  }, (h) => h.slaBand === "OVERDUE" || h.slaBand === "CRITICAL", roles);
  if (overdue) raw.overdue.push(overdue);

  // --- RECENTLY COMPLETED: proof the queue drains --------------------------
  const recent: Sample[] = [];
  for (const h of handoffs) {
    if (h.status !== "COMPLETED" && h.status !== "REJECTED" && h.status !== "CANCELLED") continue;
    if (!h.completedAt) continue;
    const age = ageOf(now, h.completedAt);
    if (age > RECENT_WINDOW_MS / 1000) continue;
    recent.push({ ageSeconds: age, band: null, label: h.entityLabel });
  }
  for (const b of batches) {
    if (b.status !== "PAID" || !b.completedAt) continue;
    const age = ageOf(now, b.completedAt);
    if (age > RECENT_WINDOW_MS / 1000) continue;
    recent.push({ ageSeconds: age, band: null, label: b.name || b.id });
  }
  for (const t of ledger) {
    if (t.status !== "REFUNDED" && t.status !== "SUCCEEDED") continue;
    const age = ageOf(now, t.updatedAt || t.createdAt);
    if (age > RECENT_WINDOW_MS / 1000) continue;
    recent.push({ ageSeconds: age, band: null, label: t.referenceId });
  }
  const recentlyCompleted = group(
    "recently-completed",
    "recently_completed",
    {
      title: "Completed in the last 24h",
      description: "Journeys that reached a terminal state — the queue is draining.",
      href: "/audit",
      icon: "task_alt",
      permission: "audit.read",
    },
    recent.sort((a, b) => (a.ageSeconds ?? 0) - (b.ageSeconds ?? 0)),
  );
  if (recentlyCompleted) raw.recently_completed.push(recentlyCompleted);

  // Sort every lane worst-first so the top card is the one to act on, then apply
  // the viewer's permissions.
  const lanes = {} as Record<CommandCenterLane, CommandCenterItem[]>;
  for (const lane of COMMAND_CENTER_LANES) {
    lanes[lane] = raw[lane]
      .sort((a, b) => b.severity - a.severity || (b.oldestAgeSeconds ?? 0) - (a.oldestAgeSeconds ?? 0))
      .map(({ canActOverride, ...item }) => ({
        ...item,
        canAct: canActOverride ?? canAct(item.permission, roles),
      }));
  }

  const totals: CommandCenterTotals = {
    critical: sumCounts(lanes.critical),
    needs_attention: sumCounts(lanes.needs_attention),
    pending_approval: sumCounts(lanes.pending_approval),
    failed: sumCounts(lanes.failed),
    overdue: sumCounts(lanes.overdue),
    recently_completed: sumCounts(lanes.recently_completed),
    exceptions: 0,
  };
  // `overdue` cross-cuts the other lanes, so counting it into `exceptions` would
  // double-count the same record. `COUNTED_EXCEPTION_LANES` is the shared
  // vocabulary for "disjoint exception lanes" — see lib/command-center.ts.
  totals.exceptions = COUNTED_EXCEPTION_LANES.reduce((sum, lane) => sum + totals[lane], 0);

  return { generatedAt: now.toISOString(), lanes, totals, allClear: totals.exceptions === 0, roles };
}

function ageOf(now: Date, iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 1000));
}

function sumCounts(items: CommandCenterItem[]): number {
  return items.reduce((sum, i) => sum + i.count, 0);
}

/** The single worst SLA band across the exception lanes — for the page banner. */
export function worstBand(snapshot: CommandCenterSnapshot): SlaBand | null {
  const bands: SlaBand[] = [];
  for (const lane of COMMAND_CENTER_LANES) {
    if (!LANE_META[lane].isException) continue;
    for (const item of snapshot.lanes[lane]) if (item.slaBand) bands.push(item.slaBand);
  }
  if (bands.length === 0) return null;
  return bands.sort((a, b) => SLA_SEVERITY[b] - SLA_SEVERITY[a])[0];
}

/** The JSON shape the polling endpoint returns. */
export function toDto(snapshot: CommandCenterSnapshot): CommandCenterDto {
  return {
    generatedAt: snapshot.generatedAt,
    allClear: snapshot.allClear,
    totals: snapshot.totals,
    lanes: snapshot.lanes,
  };
}
