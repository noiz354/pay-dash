import { beforeEach, describe, expect, it } from "vitest";

import { hasPermission } from "@/domain/organization/roles";
import {
  __resetHandoffStore,
  PENDING_HANDOFF_STATUSES,
  actionLabelFor,
  canActOnHandoff,
  claimHandoff,
  completeHandoff,
  handoffIdentity,
  isHandoffVisibleTo,
  isPendingHandoff,
  nextStepFor,
  openHandoff,
  rolesWithPermission,
  withSla,
  type OpenHandoffInput,
} from "./handoff-store";

// Wave 4 §4 — cross-role handoff engine.
//
// The invariant under test is the one the spec cares about most: a journey that
// changes hands must never dead-end. Every assertion about `nextStepFor` exists
// to prove that a viewer who cannot act is still told who can and where to look.

beforeEach(() => {
  __resetHandoffStore();
});

const NOW = new Date("2026-09-01T12:00:00.000Z");

function payoutApproval(overrides: Partial<OpenHandoffInput> = {}): OpenHandoffInput {
  return {
    journey: "payout_approval",
    entityType: "payout_batch",
    entityId: "batch_01",
    entityLabel: "September payroll",
    fromActor: "persona_dinda",
    fromRole: "FINANCE_OPERATOR",
    toRoles: rolesWithPermission("payout.release"),
    requiredPermission: "payout.release",
    slaEntityType: "payout_batch",
    amount: 1_500_000,
    currency: "IDR",
    queueHref: "/payouts?status=DRAFT",
    actionHref: "/payouts/batch_01",
    message: "Payout batch awaiting approval",
    ...overrides,
  };
}

describe("openHandoff — Role A's action becomes Role B's queue item", () => {
  it("transitions straight to NOTIFIED and records the queue notification", () => {
    const { handoff, created } = openHandoff(payoutApproval(), NOW);
    expect(created).toBe(true);
    expect(handoff.status).toBe("NOTIFIED");
    expect(handoff.notifiedAt).toBe(NOW.toISOString());
    // The notification is not optional: without it Role B has no way to know.
    expect(handoff.notifications).toHaveLength(1);
    expect(handoff.notifications[0].channel).toBe("queue");
    expect(handoff.notifications[0].href).toBe("/payouts?status=DRAFT");
    expect(handoff.notifications[0].readAt).toBeNull();
  });

  it("routes to the roles that actually hold the permission, derived from the matrix", () => {
    const { handoff } = openHandoff(payoutApproval(), NOW);
    expect(handoff.toRoles.length).toBeGreaterThan(0);
    for (const role of handoff.toRoles) expect(hasPermission(role, "payout.release")).toBe(true);
    // FINANCE_OPERATOR creates but cannot release — the separation that makes
    // JRN-021 a two-person journey.
    expect(handoff.toRoles).not.toContain("FINANCE_OPERATOR");
    expect(handoff.toRoles).toContain("FINANCE_ADMIN");
    expect(handoff.toRoles).toContain("OWNER");
  });

  it("keeps the SLA anchor as the caller's real timestamp, not the notification time", () => {
    const createdAt = "2026-09-01T02:00:00.000Z"; // 10h before NOW
    const { handoff } = openHandoff(payoutApproval({ createdAt }), NOW);
    expect(handoff.createdAt).toBe(createdAt);
    expect(handoff.notifiedAt).toBe(NOW.toISOString());
    // A 4h SLA anchored 10h ago is already overdue.
    expect(withSla(handoff, NOW).slaBand).toBe("OVERDUE");
  });

  it("is idempotent while pending — a double submit cannot create two queue items", () => {
    const first = openHandoff(payoutApproval(), NOW);
    const second = openHandoff(payoutApproval(), NOW);
    expect(second.created).toBe(false);
    expect(second.handoff.id).toBe(first.handoff.id);
  });

  it("re-opens a resolved journey for the same entity (a retry after rejection)", () => {
    const first = openHandoff(payoutApproval(), NOW);
    completeHandoff(first.handoff.id, { actor: "persona_hendri", outcome: "rejected", now: NOW });
    const again = openHandoff(payoutApproval(), NOW);
    expect(again.created).toBe(true);
    expect(again.handoff.status).toBe("NOTIFIED");
    expect(again.handoff.id).not.toBe(first.handoff.id);
  });
});

describe("completeHandoff — Role B closes the journey", () => {
  it("records who closed it and when", () => {
    const { handoff } = openHandoff(payoutApproval(), NOW);
    const result = completeHandoff(handoff.id, { actor: "persona_hendri", outcome: "approved", now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handoff.status).toBe("COMPLETED");
    expect(result.handoff.completedBy).toBe("persona_hendri");
    expect(result.handoff.completedAt).toBe(NOW.toISOString());
    expect(result.handoff.outcome).toBe("approved");
    expect(isPendingHandoff(result.handoff.status)).toBe(false);
  });

  it("refuses a same-actor completion when dual control is required (BE-002)", () => {
    const { handoff } = openHandoff(payoutApproval(), NOW);
    const result = completeHandoff(handoff.id, {
      actor: "persona_dinda", // the initiator
      outcome: "approved",
      enforceDistinctActor: true,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, code: "SAME_ACTOR" });
  });

  it("allows a same-actor completion when dual control is not required", () => {
    const { handoff } = openHandoff(payoutApproval(), NOW);
    const result = completeHandoff(handoff.id, { actor: "persona_dinda", outcome: "cancelled", now: NOW });
    expect(result.ok).toBe(true);
  });

  it("cannot resolve an already-resolved handoff twice", () => {
    const { handoff } = openHandoff(payoutApproval(), NOW);
    completeHandoff(handoff.id, { actor: "persona_hendri", outcome: "approved", now: NOW });
    expect(completeHandoff(handoff.id, { actor: "persona_rina", outcome: "approved", now: NOW })).toEqual({
      ok: false,
      code: "ALREADY_RESOLVED",
    });
  });

  it("reports NOT_FOUND rather than silently succeeding", () => {
    expect(completeHandoff("ho_missing", { actor: "x", outcome: "approved" })).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("maps outcomes onto distinct terminal statuses", () => {
    const cases = [
      ["approved", "COMPLETED"],
      ["retried", "COMPLETED"],
      ["rejected", "REJECTED"],
      ["cancelled", "CANCELLED"],
    ] as const;
    cases.forEach(([outcome, expected], index) => {
      __resetHandoffStore();
      const { handoff } = openHandoff(payoutApproval({ entityId: `batch_${index}` }), NOW);
      const result = completeHandoff(handoff.id, { actor: "persona_hendri", outcome, now: NOW });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.handoff.status).toBe(expected);
    });
  });
});

describe("claimHandoff", () => {
  it("marks intent without resolving", () => {
    const { handoff } = openHandoff(payoutApproval(), NOW);
    const claimed = claimHandoff(handoff.id, "persona_hendri", NOW);
    expect(claimed?.status).toBe("CLAIMED");
    expect(claimed?.claimedBy).toBe("persona_hendri");
    expect(isPendingHandoff(claimed!.status)).toBe(true);
    // Still closable after claiming.
    expect(completeHandoff(handoff.id, { actor: "persona_hendri", outcome: "approved", now: NOW }).ok).toBe(true);
  });

  it("does not steal a claim from another actor", () => {
    const { handoff } = openHandoff(payoutApproval(), NOW);
    claimHandoff(handoff.id, "persona_hendri", NOW);
    const second = claimHandoff(handoff.id, "persona_rina", NOW);
    expect(second?.claimedBy).toBe("persona_hendri");
  });

  it("returns null for a resolved handoff", () => {
    const { handoff } = openHandoff(payoutApproval(), NOW);
    completeHandoff(handoff.id, { actor: "persona_hendri", outcome: "approved", now: NOW });
    expect(claimHandoff(handoff.id, "persona_rina", NOW)).toBeNull();
  });
});

describe("visibility vs authority — the distinction that removes the dead end", () => {
  it("treats PENDING statuses as the open queue", () => {
    expect(PENDING_HANDOFF_STATUSES).toEqual(["OPEN", "NOTIFIED", "CLAIMED"]);
    for (const status of PENDING_HANDOFF_STATUSES) expect(isPendingHandoff(status)).toBe(true);
    expect(isPendingHandoff("COMPLETED")).toBe(false);
    expect(isPendingHandoff("REJECTED")).toBe(false);
  });

  it("gives FINANCE_ADMIN both visibility and authority", () => {
    const { handoff } = openHandoff(payoutApproval(), NOW);
    expect(isHandoffVisibleTo(handoff, ["FINANCE_ADMIN"])).toBe(true);
    expect(canActOnHandoff(handoff, ["FINANCE_ADMIN"])).toBe(true);
    const step = nextStepFor(handoff, ["FINANCE_ADMIN"]);
    expect(step.kind).toBe("action");
    if (step.kind === "action") {
      expect(step.href).toBe("/payouts/batch_01");
      expect(step.label).toBe("Approve payout");
      expect(step.permission).toBe("payout.release");
    }
  });

  it("gives the initiator visibility but NOT authority, and says who is blocking", () => {
    const { handoff } = openHandoff(payoutApproval(), NOW);
    // Dinda (FINANCE_OPERATOR) created it; she can see it but cannot release it.
    expect(isHandoffVisibleTo(handoff, ["FINANCE_OPERATOR"])).toBe(false); // not in toRoles
    expect(canActOnHandoff(handoff, ["FINANCE_OPERATOR"])).toBe(false);

    const step = nextStepFor(handoff, ["FINANCE_OPERATOR"]);
    expect(step.kind).toBe("escalate");
    if (step.kind === "escalate") {
      expect(step.roles).toContain("FINANCE_ADMIN");
      expect(step.label).toMatch(/Finance Admin/);
      // The escalation still points somewhere real — never a dead end.
      expect(step.href).toBe("/payouts?status=DRAFT");
    }
  });

  it("always yields either an action or an escalation — never nothing", () => {
    const { handoff } = openHandoff(payoutApproval(), NOW);
    const roleSets = [
      [],
      ["OWNER"],
      ["FINANCE_ADMIN"],
      ["FINANCE_OPERATOR"],
      ["SUPPORT"],
      ["DEVELOPER"],
      ["ANALYST"],
      ["RISK_ANALYST"],
      ["COMPLIANCE_ANALYST"],
      ["FINANCE_OPERATOR", "SUPPORT"],
    ] as const;
    for (const roles of roleSets) {
      const step = nextStepFor(handoff, [...roles]);
      expect(["action", "escalate"], `roles=${roles.join("+")}`).toContain(step.kind);
      expect(step.href).toBeTruthy();
      expect(step.label).toBeTruthy();
    }
  });
});

describe("rolesWithPermission — derived from the RBAC matrix, never hard-coded", () => {
  it.each([
    ["payout.release", ["OWNER", "FINANCE_ADMIN"]],
    ["refund.execute", ["OWNER", "FINANCE_ADMIN"]],
    ["kyc.submit", ["OWNER", "COMPLIANCE_ANALYST"]],
    ["provider.connect.test", ["OWNER", "DEVELOPER"]],
  ])("maps %s to %s", (permission, expected) => {
    expect(rolesWithPermission(permission as never)).toEqual(expected);
  });

  it("never returns a role that lacks the permission", () => {
    for (const permission of ["payout.release", "refund.execute", "audit.read", "team.manage"] as const) {
      for (const role of rolesWithPermission(permission)) expect(hasPermission(role, permission)).toBe(true);
    }
  });
});

describe("handoffIdentity", () => {
  it("is stable across journey/entity so re-opens reconcile", () => {
    expect(handoffIdentity("refund_approval", "refund", "txn_1")).toBe("refund_approval:refund:txn_1");
    expect(handoffIdentity("payout_approval", "payout_batch", "b1")).not.toBe(handoffIdentity("payout_retry", "payout_batch", "b1"));
  });
});

describe("actionLabelFor — every journey has a verb", () => {
  it("labels all journeys, including the Wave 4 additions", () => {
    const journeys = [
      "payout_approval",
      "payout_retry",
      "refund_approval",
      "payment_triage",
      "kyc_review",
      "fraud_review",
      "webhook_triage",
      "invite_acceptance",
    ] as const;
    for (const journey of journeys) expect(actionLabelFor(journey), journey).toBeTruthy();
    expect(actionLabelFor("payout_retry")).toBe("Retry failures");
    expect(actionLabelFor("payment_triage")).toBe("Triage payment");
  });
});
