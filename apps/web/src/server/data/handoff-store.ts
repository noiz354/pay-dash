import "server-only";

import { ORGANIZATION_ROLES, hasPermission, type OrganizationRole, type Permission } from "@/domain/organization/roles";
import { evaluateSla, type SlaBand, type SlaEntityType } from "@/lib/sla";

// Wave 4 — Cross-role handoff engine (spec §9 Cross-Role Blueprint).
//
// The blueprint describes journeys that *change hands*: Dinda creates a payout
// batch, Hendri approves it; Agus requests a refund, Hendri executes it. Before
// Wave 4 the app had no place for the second actor to land — the requesting
// actor had to supply an `approverId` in the same form, so the "handoff" was a
// text field, not a queue. That is a dead end for Role B: nothing tells them
// work is waiting.
//
// This module is the engine only. It deliberately imports nothing from the
// payout/transaction/KYC stores so those stores can open handoffs without
// creating a cycle; `./handoff.ts` layers the derived view on top.
//
// Invariant enforced here and asserted in tests: **every handoff exposes a next
// step**. If the current actor can act, `nextStep.kind === "action"`. If they
// cannot, it is `"escalate"` naming the roles that can, with a deep link into
// their queue. There is no third case.

export const HANDOFF_JOURNEYS = [
  "payout_approval",
  "payout_retry",
  "refund_approval",
  "payment_triage",
  "kyc_review",
  "fraud_review",
  "webhook_triage",
  "invite_acceptance",
] as const;
export type HandoffJourney = (typeof HANDOFF_JOURNEYS)[number];

export const HANDOFF_STATUSES = ["OPEN", "NOTIFIED", "CLAIMED", "COMPLETED", "REJECTED", "CANCELLED"] as const;
export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];

/** A handoff is still awaiting its second actor in these states. */
export const PENDING_HANDOFF_STATUSES: readonly HandoffStatus[] = ["OPEN", "NOTIFIED", "CLAIMED"];

export function isPendingHandoff(status: HandoffStatus): boolean {
  return PENDING_HANDOFF_STATUSES.includes(status);
}

export type HandoffNotification = {
  id: string;
  /** Roles whose queue receives this. Never an individual — role-scoped by design. */
  toRoles: OrganizationRole[];
  channel: "queue" | "toast";
  message: string;
  /** Deep link into Role B's filtered queue. This is what makes it not a dead end. */
  href: string;
  createdAt: string;
  readAt: string | null;
};

export type OpenHandoffInput = {
  journey: HandoffJourney;
  entityType: "payout_batch" | "transaction" | "refund" | "kyc_submission" | "webhook_delivery" | "team_invite";
  entityId: string;
  /** Short, non-PII label — an id or reference, never a customer name/email. */
  entityLabel: string;
  fromActor: string;
  fromRole: OrganizationRole | null;
  toRoles: OrganizationRole[];
  /** The permission Role B must hold to finish the journey. */
  requiredPermission: Permission;
  /** SLA anchor — a real backend timestamp, not Date.now() at render time. */
  createdAt?: string;
  slaEntityType: SlaEntityType;
  amount?: number;
  currency?: string;
  queueHref: string;
  actionHref: string;
  message: string;
  reason?: string | null;
};

export type Handoff = {
  id: string;
  journey: HandoffJourney;
  entityType: OpenHandoffInput["entityType"];
  entityId: string;
  entityLabel: string;
  fromActor: string;
  fromRole: OrganizationRole | null;
  toRoles: OrganizationRole[];
  requiredPermission: Permission;
  status: HandoffStatus;
  createdAt: string;
  notifiedAt: string | null;
  claimedAt: string | null;
  claimedBy: string | null;
  completedAt: string | null;
  completedBy: string | null;
  outcome: "approved" | "rejected" | "retried" | "cancelled" | null;
  amount: number | null;
  currency: string | null;
  queueHref: string;
  actionHref: string;
  reason: string | null;
  slaEntityType: SlaEntityType;
  notifications: HandoffNotification[];
};

export type HandoffWithSla = Handoff & {
  slaBand: SlaBand | null;
  slaAgeSeconds: number | null;
  slaDueAt: string | null;
  slaRemainingSeconds: number | null;
};

export type NextStep =
  | { kind: "action"; label: string; href: string; permission: Permission }
  | { kind: "escalate"; label: string; href: string; roles: OrganizationRole[] };

type Store = { rows: Handoff[]; seq: number };
const globalStore = globalThis as unknown as { __kineticHandoffStore?: Store };

function store(): Store {
  if (!globalStore.__kineticHandoffStore) globalStore.__kineticHandoffStore = { rows: [], seq: 0 };
  return globalStore.__kineticHandoffStore;
}

/** Test seam — clears the mutable overlay without touching derived data. */
export function __resetHandoffStore(): void {
  globalStore.__kineticHandoffStore = { rows: [], seq: 0 };
}

/**
 * Stable identity for a handoff: one journey + one entity = one handoff.
 * Re-opening the same journey for the same entity while it is still pending is
 * a no-op that returns the existing record, so a double submit cannot create
 * two queue items for the same batch.
 */
export function handoffIdentity(journey: HandoffJourney, entityType: string, entityId: string): string {
  return `${journey}:${entityType}:${entityId}`;
}

export type OpenHandoffResult = { handoff: Handoff; created: boolean };

/**
 * Role A's action lands here: create the handoff, transition it to NOTIFIED and
 * emit the queue notification for Role B in one step. The notification is not
 * optional — a handoff nobody was told about is the dead end we are removing.
 */
export function openHandoff(input: OpenHandoffInput, now: Date = new Date()): OpenHandoffResult {
  const s = store();
  const identity = handoffIdentity(input.journey, input.entityType, input.entityId);

  const existing = s.rows.find((h) => handoffIdentity(h.journey, h.entityType, h.entityId) === identity);
  if (existing && isPendingHandoff(existing.status)) {
    return { handoff: existing, created: false };
  }
  // A previously completed/cancelled handoff for the same entity may be
  // re-opened (e.g. a retry after rejection) — replace it so the queue shows
  // exactly one live item.
  if (existing) {
    s.rows = s.rows.filter((h) => h !== existing);
  }

  const createdAt = input.createdAt ?? now.toISOString();
  s.seq += 1;
  const id = `ho_${s.seq.toString(36).padStart(4, "0")}_${input.entityId}`;

  const notification: HandoffNotification = {
    id: `${id}_n1`,
    toRoles: input.toRoles,
    channel: "queue",
    message: input.message,
    href: input.queueHref,
    createdAt: now.toISOString(),
    readAt: null,
  };

  const handoff: Handoff = {
    id,
    journey: input.journey,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    fromActor: input.fromActor,
    fromRole: input.fromRole,
    toRoles: input.toRoles,
    requiredPermission: input.requiredPermission,
    status: "NOTIFIED",
    createdAt,
    notifiedAt: now.toISOString(),
    claimedAt: null,
    claimedBy: null,
    completedAt: null,
    completedBy: null,
    outcome: null,
    amount: input.amount ?? null,
    currency: input.currency ?? null,
    queueHref: input.queueHref,
    actionHref: input.actionHref,
    reason: input.reason ?? null,
    slaEntityType: input.slaEntityType,
    notifications: [notification],
  };

  s.rows.unshift(handoff);
  return { handoff, created: true };
}

export function getHandoff(id: string): Handoff | null {
  return store().rows.find((h) => h.id === id) ?? null;
}

/** All handoffs in the mutable overlay, newest first. */
export function listStoredHandoffs(): Handoff[] {
  return [...store().rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type CompleteHandoffInput = {
  actor: string;
  outcome: "approved" | "rejected" | "retried" | "cancelled";
  /**
   * Dual-control journeys must reject a completion by the opening actor.
   * Enforcement lives in the caller's server action too (backend is final);
   * this is the engine-level guard so no caller can forget it.
   */
  enforceDistinctActor?: boolean;
  now?: Date;
};

export type CompleteHandoffResult =
  | { ok: true; handoff: Handoff }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_RESOLVED" | "SAME_ACTOR" };

/**
 * Role B's action lands here: resolve the handoff and record who closed it.
 * Returns a discriminated result rather than throwing so server actions can map
 * each code onto a distinct, honest error message.
 */
export function completeHandoff(id: string, input: CompleteHandoffInput): CompleteHandoffResult {
  const handoff = getHandoff(id);
  if (!handoff) return { ok: false, code: "NOT_FOUND" };
  if (!isPendingHandoff(handoff.status)) return { ok: false, code: "ALREADY_RESOLVED" };
  if (input.enforceDistinctActor && handoff.fromActor && handoff.fromActor === input.actor) {
    return { ok: false, code: "SAME_ACTOR" };
  }

  const now = input.now ?? new Date();
  handoff.status = input.outcome === "approved" || input.outcome === "retried" ? "COMPLETED" : input.outcome === "rejected" ? "REJECTED" : "CANCELLED";
  handoff.completedAt = now.toISOString();
  handoff.completedBy = input.actor;
  handoff.outcome = input.outcome;
  return { ok: true, handoff };
}

/** Claiming marks intent without resolving — used by "Review" affordances. */
export function claimHandoff(id: string, actor: string, now: Date = new Date()): Handoff | null {
  const handoff = getHandoff(id);
  if (!handoff || !isPendingHandoff(handoff.status)) return null;
  if (handoff.status === "OPEN" || handoff.status === "NOTIFIED") {
    handoff.status = "CLAIMED";
    handoff.claimedAt = now.toISOString();
    handoff.claimedBy = actor;
  }
  return handoff;
}

export function markNotificationsRead(id: string, now: Date = new Date()): void {
  const handoff = getHandoff(id);
  if (!handoff) return;
  for (const n of handoff.notifications) if (n.readAt === null) n.readAt = now.toISOString();
}

// ---------------------------------------------------------------------------
// Authorization / routing helpers
// ---------------------------------------------------------------------------

/**
 * Every role that holds `permission`, derived from the canonical RBAC matrix.
 * Handoffs route to *roles*, never to a hard-coded list, so tightening the
 * matrix automatically retargets the queue.
 */
export function rolesWithPermission(permission: Permission): OrganizationRole[] {
  return ORGANIZATION_ROLES.filter((r) => hasPermission(r, permission));
}

/** Can this actor close the handoff? Role B must hold the required permission. */
export function canActOnHandoff(handoff: Handoff, roles: readonly OrganizationRole[]): boolean {
  return roles.some((r) => hasPermission(r, handoff.requiredPermission));
}

/** Is this handoff in this actor's queue at all (visibility != authority). */
export function isHandoffVisibleTo(handoff: Handoff, roles: readonly OrganizationRole[]): boolean {
  if (handoff.toRoles.length === 0) return true;
  return handoff.toRoles.some((r) => roles.includes(r));
}

/**
 * The no-dead-end contract. Given a handoff and the viewer's roles, return what
 * they should do next: act, or escalate to the roles that can.
 */
export function nextStepFor(handoff: Handoff, roles: readonly OrganizationRole[]): NextStep {
  if (canActOnHandoff(handoff, roles)) {
    return { kind: "action", label: actionLabelFor(handoff.journey), href: handoff.actionHref, permission: handoff.requiredPermission };
  }
  const able = handoff.toRoles.filter((r) => hasPermission(r, handoff.requiredPermission));
  return {
    kind: "escalate",
    label: `Waiting on ${able.length > 0 ? able.map(roleLabel).join(" or ") : "an approver"}`,
    href: handoff.queueHref,
    roles: able.length > 0 ? able : handoff.toRoles,
  };
}

export function actionLabelFor(journey: HandoffJourney): string {
  switch (journey) {
    case "payout_approval":
      return "Approve payout";
    case "payout_retry":
      return "Retry failures";
    case "refund_approval":
      return "Approve refund";
    case "payment_triage":
      return "Triage payment";
    case "kyc_review":
      return "Review KYC";
    case "fraud_review":
      return "Review in Fraud";
    case "webhook_triage":
      return "Inspect delivery";
    case "invite_acceptance":
      return "Accept invite";
  }
}

export function roleLabel(role: OrganizationRole): string {
  switch (role) {
    case "OWNER":
      return "Owner";
    case "FINANCE_ADMIN":
      return "Finance Admin";
    case "FINANCE_OPERATOR":
      return "Finance Operator";
    case "DEVELOPER":
      return "Developer";
    case "ANALYST":
      return "Analyst";
    case "COMPLIANCE_ANALYST":
      return "Compliance Analyst";
    case "RISK_ANALYST":
      return "Risk Analyst";
    case "SUPPORT":
      return "Support";
  }
}

/**
 * Attach the SLA evaluation to a handoff using its real `createdAt`.
 * `now` is threaded through so an aggregation pass stamps every item with the
 * same instant — otherwise two lanes could disagree about the same record.
 */
export function withSla(handoff: Handoff, now: Date = new Date()): HandoffWithSla {
  const sla = evaluateSla(handoff.slaEntityType, handoff.createdAt, { now });
  return {
    ...handoff,
    slaBand: sla?.band ?? null,
    slaAgeSeconds: sla?.ageSeconds ?? null,
    slaDueAt: sla?.dueAt ?? null,
    slaRemainingSeconds: sla?.remainingSeconds ?? null,
  };
}
