import "server-only";

import { hasPermission, type OrganizationRole, type Permission } from "@/domain/organization/roles";
import { compareSla, evaluateSla, isOverdueBand, type SlaBand, type SlaEntityType } from "@/lib/sla";
import { getPayoutBatches } from "./payouts";
import { legacyLedgerRows, legacyRefundQueue } from "./transactions-unscoped";
import { getRiskOverview } from "./risk";
import { getKycSubmission } from "./kyc";
import { listWebhooks } from "./webhooks";
import {
  canActOnHandoff,
  handoffIdentity,
  isHandoffVisibleTo,
  isPendingHandoff,
  listStoredHandoffs,
  nextStepFor,
  rolesWithPermission,
  withSla,
  type Handoff,
  type HandoffJourney,
  type HandoffStatus,
  type HandoffWithSla,
  type NextStep,
} from "./handoff-store";

export * from "./handoff-store";

// Wave 4 — Cross-role handoff view (spec §9, Wave 4 §4).
//
// The queue is DERIVED, not maintained. Every open handoff is recomputed from
// the live stores (payout batches, ledger refund state, risk alerts, KYC,
// webhook deliveries) on each read, then reconciled with the mutable overlay in
// `handoff-store` that records claims and completions. That is what keeps the
// Command Center honest: a batch that was approved a moment ago disappears from
// the Pending Approval lane on the next read, because the lane is a projection
// of the batch store rather than a second copy of it.
//
// Reconciliation rules:
//   - overlay record still pending  -> use it (carries claim/notification state)
//   - overlay record resolved       -> suppress the derived item (it was handled)
//   - no overlay record             -> synthesize a derived handoff
//
// PII rule: `entityLabel` is always a reference/batch id. Risk alert titles in
// the store embed a customer name; that never reaches a handoff, a lane card or
// an analytics event.

export type HandoffLane =
  | "pending_approval"
  | "needs_retry"
  | "fraud_review"
  | "compliance_review"
  | "integration_triage";

/** Which Command Center lane a journey feeds. */
export const JOURNEY_LANE: Record<HandoffJourney, HandoffLane> = {
  payout_approval: "pending_approval",
  refund_approval: "pending_approval",
  payout_retry: "needs_retry",
  payment_triage: "needs_retry",
  fraud_review: "fraud_review",
  kyc_review: "compliance_review",
  webhook_triage: "integration_triage",
  invite_acceptance: "compliance_review",
};

export type DerivedHandoff = HandoffWithSla & {
  lane: HandoffLane;
  /** Whether the derived record came from the overlay (has real claim state). */
  tracked: boolean;
};

type DeriveSource = {
  journey: HandoffJourney;
  entityType: Handoff["entityType"];
  entityId: string;
  entityLabel: string;
  requiredPermission: Permission;
  slaEntityType: SlaEntityType;
  createdAt: string;
  amount?: number | null;
  currency?: string | null;
  queueHref: string;
  actionHref: string;
  message: string;
  reason?: string | null;
  fromActor?: string;
};

function synthesise(source: DeriveSource, id: string): Handoff {
  return {
    id,
    journey: source.journey,
    entityType: source.entityType,
    entityId: source.entityId,
    entityLabel: source.entityLabel,
    // Derived items have no recorded initiator in the overlay; the store that
    // produced them is the authority. `system` keeps the dual-control guard
    // inert for derived rows (it only fires when fromActor is set).
    fromActor: source.fromActor ?? "system",
    fromRole: null,
    toRoles: rolesWithPermission(source.requiredPermission),
    requiredPermission: source.requiredPermission,
    status: "NOTIFIED",
    createdAt: source.createdAt,
    notifiedAt: source.createdAt,
    claimedAt: null,
    claimedBy: null,
    completedAt: null,
    completedBy: null,
    outcome: null,
    amount: source.amount ?? null,
    currency: source.currency ?? null,
    queueHref: source.queueHref,
    actionHref: source.actionHref,
    reason: source.reason ?? null,
    slaEntityType: source.slaEntityType,
    notifications: [
      {
        id: `${id}_n1`,
        toRoles: rolesWithPermission(source.requiredPermission),
        channel: "queue",
        message: source.message,
        href: source.queueHref,
        createdAt: source.createdAt,
        readAt: null,
      },
    ],
  };
}

/**
 * Collect every open handoff implied by the current state of the stores.
 * `now` is threaded through so a single aggregation pass stamps every SLA with
 * the same instant.
 */
export async function deriveHandoffs(now: Date = new Date()): Promise<DerivedHandoff[]> {
  const overlay = listStoredHandoffs();
  const overlayByIdentity = new Map(overlay.map((h) => [handoffIdentity(h.journey, h.entityType, h.entityId), h]));
  const sources: DeriveSource[] = [];

  // 1. Payout batches waiting for release (JRN-021: Dinda creates -> Hendri approves).
  const batches = getPayoutBatches();
  for (const batch of batches) {
    if (batch.status === "DRAFT" || batch.status === "SCHEDULED") {
      sources.push({
        journey: "payout_approval",
        entityType: "payout_batch",
        entityId: batch.id,
        entityLabel: batch.name || batch.id,
        requiredPermission: "payout.release",
        slaEntityType: "payout_batch",
        createdAt: batch.createdAt,
        amount: batch.recipients.reduce((sum, r) => sum + r.amount, 0),
        currency: batch.currency,
        queueHref: "/payouts?status=DRAFT",
        actionHref: `/payouts/${batch.id}`,
        message: "Payout batch awaiting approval",
      });
    }
    const failedRecipients = batch.recipients.filter((r) => r.status === "FAILED" || r.status === "RETURNED");
    if (failedRecipients.length > 0 && (batch.status === "FAILED" || batch.status === "PARTIAL" || batch.status === "RETURNED")) {
      // SLA anchor: the batch's own completion time when known, else creation.
      sources.push({
        journey: "payout_retry",
        entityType: "payout_batch",
        entityId: batch.id,
        entityLabel: batch.name || batch.id,
        requiredPermission: "payout.retry",
        slaEntityType: "failed_payout",
        createdAt: batch.completedAt ?? batch.createdAt,
        amount: failedRecipients.reduce((sum, r) => sum + r.amount, 0),
        currency: batch.currency,
        queueHref: "/payouts?status=PARTIAL",
        actionHref: `/payouts/${batch.id}`,
        message: `${failedRecipients.length} payout recipient${failedRecipients.length === 1 ? "" : "s"} failed and can be retried`,
      });
    }
  }

  // 2. Refunds awaiting a second approver (JRN-003 dual control).
  for (const tx of legacyRefundQueue("handoff")) {
    sources.push({
      journey: "refund_approval",
      entityType: "refund",
      entityId: tx.id,
      entityLabel: tx.referenceId,
      requiredPermission: "refund.execute",
      slaEntityType: "refund",
      createdAt: tx.refundRequest?.requestedAt ?? tx.updatedAt,
      amount: tx.refundRequest?.amount ?? 0,
      currency: tx.currency,
      queueHref: "/transactions?refundState=AWAITING_APPROVAL",
      actionHref: `/transactions/${tx.id}`,
      message: "Refund awaiting a second approval",
      reason: tx.refundRequest?.reason || null,
      // The requester is known, so the dual-control guard is live for this row.
      fromActor: tx.refundRequest?.requestedBy ?? "system",
    });
  }

  // 3. Failed payments needing triage.
  for (const tx of legacyLedgerRows("handoff")) {
    if (tx.status !== "FAILED") continue;
    sources.push({
      journey: "payment_triage",
      entityType: "transaction",
      entityId: tx.id,
      entityLabel: tx.referenceId,
      requiredPermission: "money_in.create",
      slaEntityType: "failed_payment",
      createdAt: tx.updatedAt || tx.createdAt,
      amount: tx.amount,
      currency: tx.currency,
      queueHref: "/transactions?status=FAILED",
      actionHref: `/transactions/${tx.id}`,
      message: "Failed payment needs triage or retry",
    });
  }

  // 4. High-risk transactions (the real fraud signal — `deriveAlerts`).
  const risk = await getRiskOverview();
  for (const alert of risk.alerts) {
    if (!alert.transactionId) continue; // volume-cap alerts have no single target
    const tx = legacyLedgerRows("handoff").find((t) => t.id === alert.transactionId);
    sources.push({
      journey: "fraud_review",
      entityType: "transaction",
      entityId: alert.transactionId,
      // Reference id only — the alert title embeds a customer name (PII).
      entityLabel: tx?.referenceId ?? alert.transactionId,
      requiredPermission: "audit.read",
      slaEntityType: "blocked_payment",
      createdAt: alert.at,
      amount: tx?.amount ?? null,
      currency: tx?.currency ?? null,
      queueHref: "/risk",
      actionHref: tx ? `/transactions/${tx.id}` : "/risk",
      message: "High-risk payment awaiting fraud review",
      reason: `Risk score ${tx?.riskScore ?? "high"}`,
    });
  }

  // 5. KYC document submitted and awaiting verification.
  const kyc = getKycSubmission();
  if (kyc) {
    sources.push({
      journey: "kyc_review",
      entityType: "kyc_submission",
      entityId: "merchant_kyc",
      entityLabel: kyc.docType,
      requiredPermission: "kyc.submit",
      slaEntityType: "kyc_submission",
      createdAt: kyc.submittedAt,
      queueHref: "/kyc",
      actionHref: "/kyc",
      message: "KYC document awaiting verification",
    });
  }

  // 6. Rejected webhook deliveries in the last 7 days.
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const webhooks = listWebhooks({ status: "REJECTED", page: 1, pageSize: 100 });
  for (const event of webhooks.rows) {
    if (new Date(event.receivedAt).getTime() < sevenDaysAgo) continue;
    sources.push({
      journey: "webhook_triage",
      entityType: "webhook_delivery",
      entityId: event.id,
      entityLabel: event.eventId,
      requiredPermission: "provider.connect.test",
      slaEntityType: "webhook_delivery",
      createdAt: event.receivedAt,
      queueHref: "/webhooks?status=REJECTED",
      actionHref: `/webhooks/${event.id}`,
      message: "Webhook delivery rejected — inspect and replay",
      reason: event.reason,
    });
  }

  // --- reconcile with the overlay -----------------------------------------
  const out: DerivedHandoff[] = [];
  for (const source of sources) {
    const identity = handoffIdentity(source.journey, source.entityType, source.entityId);
    const tracked = overlayByIdentity.get(identity);
    if (tracked) {
      // Resolved in the overlay -> the journey is closed; do not re-derive it.
      if (!isPendingHandoff(tracked.status)) continue;
      out.push({ ...withSla(tracked, now), lane: JOURNEY_LANE[tracked.journey], tracked: true });
      continue;
    }
    const id = `derived_${identity.replace(/[^a-z0-9]+/gi, "_")}`;
    out.push({ ...withSla(synthesise(source, id), now), lane: JOURNEY_LANE[source.journey], tracked: false });
  }

  // Pending overlay rows with no matching source: the overlay is the authority
  // here (e.g. `invite_acceptance`, which no store derives). Dropping them would
  // strand an open handoff in nobody's queue — a dead end, which §4 forbids.
  const sourceIdentities = new Set(sources.map((s) => handoffIdentity(s.journey, s.entityType, s.entityId)));
  for (const tracked of overlay) {
    if (!isPendingHandoff(tracked.status)) continue;
    if (sourceIdentities.has(handoffIdentity(tracked.journey, tracked.entityType, tracked.entityId))) continue;
    out.push({ ...withSla(tracked, now), lane: JOURNEY_LANE[tracked.journey], tracked: true });
  }

  // Resolved overlay handoffs are still worth showing in "Recently Completed".
  for (const tracked of overlay) {
    if (isPendingHandoff(tracked.status)) continue;
    const identity = handoffIdentity(tracked.journey, tracked.entityType, tracked.entityId);
    // Only include a resolved handoff if its underlying condition is really gone
    // (i.e. it is not also in `sources`), otherwise a rejected refund would show
    // as both completed and pending.
    const stillLive = sources.some((s) => handoffIdentity(s.journey, s.entityType, s.entityId) === identity);
    if (stillLive) continue;
    out.push({ ...withSla(tracked, now), lane: JOURNEY_LANE[tracked.journey], tracked: true });
  }

  return out.sort(
    (a, b) =>
      compareSla(
        { band: a.slaBand ?? "NORMAL", ageSeconds: a.slaAgeSeconds ?? 0 },
        { band: b.slaBand ?? "NORMAL", ageSeconds: b.slaAgeSeconds ?? 0 },
      ) || b.createdAt.localeCompare(a.createdAt),
  );
}

// ---------------------------------------------------------------------------
// Role B's queue
// ---------------------------------------------------------------------------

export type HandoffQueueFilter = {
  roles?: OrganizationRole[];
  status?: HandoffStatus | "PENDING" | "ALL";
  journey?: HandoffJourney;
  lane?: HandoffLane;
  sla?: SlaBand | "ALL";
  /** Only handoffs this actor is allowed to close (hides escalation-only items). */
  actionableOnly?: boolean;
};

export type HandoffQueueItem = DerivedHandoff & { nextStep: NextStep; canAct: boolean };

/**
 * The queue a given actor sees. Visibility is role-scoped; authority is
 * permission-scoped. They are reported separately so the UI can show "waiting on
 * Finance Admin" instead of a button that would 403 — that distinction is what
 * removes the dead end.
 */
export async function getHandoffQueue(filter: HandoffQueueFilter = {}, now: Date = new Date()): Promise<HandoffQueueItem[]> {
  const roles = filter.roles ?? [];
  const derived = await deriveHandoffs(now);

  return derived
    .filter((h) => {
      if (filter.status === "PENDING" || filter.status === undefined) {
        if (!isPendingHandoff(h.status)) return false;
      } else if (filter.status !== "ALL" && h.status !== filter.status) {
        return false;
      }
      if (filter.journey && h.journey !== filter.journey) return false;
      if (filter.lane && h.lane !== filter.lane) return false;
      if (filter.sla && filter.sla !== "ALL" && h.slaBand !== filter.sla) return false;
      // With no roles supplied (anonymous/dev fallback) show everything — the
      // page-level guard decides access, not this projection.
      if (roles.length > 0 && !isHandoffVisibleTo(h, roles) && !canActOnHandoff(h, roles)) return false;
      return true;
    })
    .map((h) => ({ ...h, nextStep: nextStepFor(h, roles), canAct: canActOnHandoff(h, roles) }))
    .filter((h) => (filter.actionableOnly ? h.canAct : true));
}

/** Counts per lane for the Command Center cards. */
export async function getHandoffCounts(roles: OrganizationRole[] = [], now: Date = new Date()): Promise<Record<HandoffLane, number>> {
  const queue = await getHandoffQueue({ roles, status: "PENDING" }, now);
  const counts: Record<HandoffLane, number> = {
    pending_approval: 0,
    needs_retry: 0,
    fraud_review: 0,
    compliance_review: 0,
    integration_triage: 0,
  };
  for (const item of queue) counts[item.lane] += 1;
  return counts;
}

/** Handoffs whose SLA has been breached (OVERDUE or CRITICAL). */
export async function getOverdueHandoffs(roles: OrganizationRole[] = [], now: Date = new Date()): Promise<HandoffQueueItem[]> {
  const queue = await getHandoffQueue({ roles, status: "PENDING" }, now);
  return queue.filter((h) => h.slaBand !== null && isOverdueBand(h.slaBand));
}

/**
 * SLA band for an arbitrary entity, exposed so list screens (transactions,
 * payouts, invoices) can badge and sort by the same rule the Command Center
 * uses. One policy, many surfaces.
 */
export function slaBandFor(entityType: SlaEntityType, anchor: string | Date | null, now: Date = new Date()): SlaBand | null {
  return evaluateSla(entityType, anchor, { now })?.band ?? null;
}
