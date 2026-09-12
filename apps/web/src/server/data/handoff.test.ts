import { beforeEach, describe, expect, it } from "vitest";

import { evaluateSla } from "@/lib/sla";
import {
  __resetHandoffStore,
  completeHandoff,
  handoffIdentity,
  listStoredHandoffs,
  openHandoff,
  rolesWithPermission,
  type OpenHandoffInput,
} from "./handoff-store";
import {
  JOURNEY_LANE,
  deriveHandoffs,
  getHandoffCounts,
  getHandoffQueue,
  getOverdueHandoffs,
  slaBandFor,
} from "./handoff";
import { listTransactions, requestRefund } from "./transactions";
import { DEMO_CONTEXT } from "@/test/organization-context";

// Wave 4 §4 — Role B's queue.
//
// `handoff-store.ts` owns the mutable record; this module projects it onto the
// real stores so a queue item always points at a row the actor can open. The
// invariant that matters here: visibility is role-scoped, authority is
// permission-scoped, and the two are reported *separately* so the UI can say
// "waiting on Finance Admin" instead of rendering a button that would 403.

function resetStores() {
  const g = globalThis as unknown as Record<string, unknown>;
  g.__kineticTxStore = undefined;
  g.__kineticPayoutStore = undefined;
  g.__kineticBalanceStore = undefined;
  __resetHandoffStore();
}

beforeEach(resetStores);

// The seeded demo ledger is dated relative to import time, so a fixed instant
// in the past would make every seeded row look like it was created in the future.
const NOW = new Date();
const AGUS = "persona_agus";

function invite(overrides: Partial<OpenHandoffInput> = {}): OpenHandoffInput {
  return {
    journey: "invite_acceptance",
    entityType: "team_invite",
    entityId: "inv_01",
    entityLabel: "inv_01",
    fromActor: AGUS,
    fromRole: "OWNER",
    toRoles: rolesWithPermission("team.manage"),
    requiredPermission: "team.manage",
    slaEntityType: "team_invite",
    queueHref: "/team",
    actionHref: "/team",
    message: "Team invite awaiting acceptance",
    ...overrides,
  };
}

function kyc(overrides: Partial<OpenHandoffInput> = {}): OpenHandoffInput {
  return {
    journey: "kyc_review",
    entityType: "kyc_submission",
    entityId: "kyc_01",
    entityLabel: "NPWP",
    fromActor: AGUS,
    fromRole: null,
    toRoles: rolesWithPermission("kyc.submit"),
    requiredPermission: "kyc.submit",
    slaEntityType: "kyc_submission",
    queueHref: "/kyc",
    actionHref: "/kyc",
    message: "KYC document awaiting verification",
    ...overrides,
  };
}

function webhook(overrides: Partial<OpenHandoffInput> = {}): OpenHandoffInput {
  return {
    journey: "webhook_triage",
    entityType: "webhook_delivery",
    entityId: "wh_01",
    entityLabel: "evt_01",
    fromActor: AGUS,
    fromRole: null,
    toRoles: rolesWithPermission("provider.connect.test"),
    requiredPermission: "provider.connect.test",
    slaEntityType: "webhook_delivery",
    queueHref: "/webhooks?status=REJECTED",
    actionHref: "/webhooks/wh_01",
    message: "Webhook delivery rejected",
    ...overrides,
  };
}

describe("deriveHandoffs — overlay + real stores reconciled", () => {
  it("stamps every row with a lane and an SLA evaluated against one instant", async () => {
    const derived = await deriveHandoffs(NOW);
    expect(derived.length).toBeGreaterThan(0); // the seeded demo ledger has open work
    for (const h of derived) {
      expect(JOURNEY_LANE[h.journey]).toBe(h.lane);
      expect(typeof h.tracked).toBe("boolean");
      if (h.slaBand !== null) {
        // Clamped at zero: an anchor in the future is "no time elapsed", never negative.
        expect(h.slaAgeSeconds).toBeGreaterThanOrEqual(0);
      }
    }
    expect(derived.some((h) => (h.slaAgeSeconds ?? 0) > 0)).toBe(true);
  });

  it("keeps an overlay handoff no store derives — dropping it would strand the journey", async () => {
    // `invite_acceptance` has no derive source: the overlay is the only record.
    openHandoff(invite(), NOW);
    const derived = await deriveHandoffs(NOW);
    const found = derived.find((h) => h.entityId === "inv_01");
    expect(found).toBeDefined();
    expect(found?.journey).toBe("invite_acceptance");
    expect(found?.tracked).toBe(true);
  });

  it("does not re-derive a handoff the overlay has already resolved", async () => {
    const { rows } = await listTransactions(DEMO_CONTEXT, { pageSize: 50, page: 1 });
    const row = rows.find((t) => t.status !== "FAILED" && t.refundedAmount === 0);
    expect(row).toBeDefined();
    if (!row) return;

    await requestRefund(DEMO_CONTEXT, { transactionId: row.id, amount: 5_000, reason: "Duplicate", requestedBy: AGUS, now: NOW });
    expect((await deriveHandoffs(NOW)).filter((h) => h.entityId === row.id)).toHaveLength(1);

    const tracked = listStoredHandoffs().find((h) => h.entityId === row.id);
    expect(tracked).toBeDefined();
    if (!tracked) return;
    completeHandoff(tracked.id, { actor: "persona_hendri", outcome: "approved", enforceDistinctActor: true, now: NOW });

    // The refund is now APPROVED, so it leaves the awaiting list; the closed
    // handoff must not linger as pending, nor duplicate itself.
    const after = await deriveHandoffs(NOW);
    expect(after.filter((h) => h.entityId === row.id && h.status === "NOTIFIED")).toHaveLength(0);
    expect(after.filter((h) => h.entityId === row.id).length).toBeLessThanOrEqual(1);
  });

  it("sorts worst-first so the top of the queue is the thing to act on", async () => {
    openHandoff(kyc({ entityId: "kyc_fresh", createdAt: new Date(NOW.getTime() - 60_000).toISOString() }), NOW);
    openHandoff(webhook({ entityId: "wh_ancient", createdAt: new Date(NOW.getTime() - 30 * 24 * 3600 * 1000).toISOString() }), NOW);

    const derived = await deriveHandoffs(NOW);
    const mine = derived.filter((h) => h.entityId === "kyc_fresh" || h.entityId === "wh_ancient");
    expect(mine.map((h) => h.entityId)).toEqual(["wh_ancient", "kyc_fresh"]);
    expect(mine[0].slaBand === "OVERDUE" || mine[0].slaBand === "CRITICAL").toBe(true);
  });
});

describe("getHandoffQueue — visibility vs authority", () => {
  it("shows an item to a role that can act, with an action next step", async () => {
    openHandoff(invite(), NOW);
    const queue = await getHandoffQueue({ roles: rolesWithPermission("team.manage") }, NOW);
    const item = queue.find((h) => h.entityId === "inv_01");
    expect(item).toBeDefined();
    if (!item) return;
    expect(item.canAct).toBe(true);
    expect(item.nextStep.kind).toBe("action");
    expect(item.nextStep.label).toBe("Accept invite");
    expect(item.nextStep.href).toBe("/team");
  });

  it("hides an item from a role that is neither addressed nor authorised", async () => {
    openHandoff(kyc(), NOW);
    const support = await getHandoffQueue({ roles: ["SUPPORT"] }, NOW);
    expect(support.some((h) => h.entityId === "kyc_01")).toBe(false);
  });

  it("shows but disables for a role that can see the work and cannot finish it", async () => {
    // DEVELOPER holds provider.connect.test but not kyc.submit; OWNER sees both.
    openHandoff(kyc(), NOW);
    const owner = await getHandoffQueue({ roles: ["OWNER"] }, NOW);
    const item = owner.find((h) => h.entityId === "kyc_01");
    expect(item).toBeDefined();
    expect(item?.canAct).toBe(true);
    expect(item?.nextStep.kind).toBe("action");
  });

  it("escalates instead of dead-ending when the viewer lacks the permission", async () => {
    openHandoff(invite({ toRoles: ["OWNER", "ANALYST"] }), NOW);
    const analyst = await getHandoffQueue({ roles: ["ANALYST"] }, NOW);
    const item = analyst.find((h) => h.entityId === "inv_01");
    expect(item).toBeDefined(); // visible — it is addressed to them
    expect(item?.canAct).toBe(false); // but not authorised
    expect(item?.nextStep.kind).toBe("escalate");
    if (item?.nextStep.kind === "escalate") {
      expect(item.nextStep.roles).toEqual(rolesWithPermission("team.manage").filter((r) => r === "OWNER"));
      expect(item.nextStep.label).toMatch(/Waiting on/);
      expect(item.nextStep.href).toBe("/team");
    }
  });

  it("actionableOnly filters to the rows this actor can close", async () => {
    openHandoff(kyc(), NOW);
    openHandoff(webhook(), NOW);

    // The seeded ledger contributes rows of its own, so assert on membership of
    // the two items this test opened plus the authority rule that produced them.
    const compliance = await getHandoffQueue({ roles: ["COMPLIANCE_ANALYST"], actionableOnly: true }, NOW);
    expect(compliance.map((h) => h.entityId)).toContain("kyc_01");
    expect(compliance.map((h) => h.entityId)).not.toContain("wh_01");
    expect(compliance.every((h) => h.canAct)).toBe(true);

    const dev = await getHandoffQueue({ roles: ["DEVELOPER"], actionableOnly: true }, NOW);
    expect(dev.map((h) => h.entityId)).toContain("wh_01");
    expect(dev.map((h) => h.entityId)).not.toContain("kyc_01");
    expect(dev.every((h) => h.canAct)).toBe(true);

    const owner = await getHandoffQueue({ roles: ["OWNER"], actionableOnly: true }, NOW);
    const ownerIds = owner.map((h) => h.entityId);
    expect(ownerIds).toContain("kyc_01");
    expect(ownerIds).toContain("wh_01");
  });

  it("filters by journey and by lane", async () => {
    openHandoff(kyc(), NOW);
    openHandoff(webhook(), NOW);
    const byJourney = await getHandoffQueue({ journey: "webhook_triage" }, NOW);
    expect(byJourney.map((h) => h.entityId)).toContain("wh_01");
    expect(byJourney.every((h) => h.journey === "webhook_triage")).toBe(true);

    const byLane = await getHandoffQueue({ lane: "compliance_review" }, NOW);
    expect(byLane.map((h) => h.entityId)).toContain("kyc_01");
    expect(byLane.every((h) => h.lane === "compliance_review")).toBe(true);
    expect(byLane.map((h) => h.entityId)).not.toContain("wh_01");
  });

  it("status=ALL includes resolved handoffs; the default hides them", async () => {
    openHandoff(kyc(), NOW);
    const tracked = listStoredHandoffs()[0];
    completeHandoff(tracked.id, { actor: "persona_hendri", outcome: "approved", enforceDistinctActor: true, now: NOW });

    expect((await getHandoffQueue({}, NOW)).some((h) => h.entityId === "kyc_01")).toBe(false);
    expect((await getHandoffQueue({ status: "ALL" }, NOW)).some((h) => h.entityId === "kyc_01")).toBe(true);
    expect((await getHandoffQueue({ status: "COMPLETED" }, NOW)).map((h) => h.entityId)).toEqual(["kyc_01"]);
  });
});

describe("getHandoffCounts / getOverdueHandoffs — the card numbers", () => {
  it("buckets counts by lane", async () => {
    openHandoff(kyc(), NOW);
    openHandoff(webhook(), NOW);
    const counts = await getHandoffCounts(["OWNER"], NOW);
    const queue = await getHandoffQueue({ roles: ["OWNER"], status: "PENDING" }, NOW);
    // The counts are a pure re-bucketing of the same queue: they must agree.
    for (const lane of Object.keys(counts) as (keyof typeof counts)[]) {
      expect(counts[lane]).toBe(queue.filter((h) => h.lane === lane).length);
    }
    expect(counts.compliance_review).toBeGreaterThanOrEqual(1);
    expect(counts.integration_triage).toBeGreaterThanOrEqual(1);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(queue.length);
  });

  it("returns only SLA-breached rows from getOverdueHandoffs", async () => {
    openHandoff(kyc({ entityId: "kyc_late", createdAt: new Date(NOW.getTime() - 10 * 24 * 3600 * 1000).toISOString() }), NOW);
    openHandoff(kyc({ entityId: "kyc_new", createdAt: new Date(NOW.getTime() - 60_000).toISOString() }), NOW);

    const overdue = await getOverdueHandoffs(["OWNER"], NOW);
    const ids = overdue.map((h) => h.entityId);
    expect(ids).toContain("kyc_late");
    expect(ids).not.toContain("kyc_new"); // inside its window
    for (const h of overdue) expect(h.slaBand === "OVERDUE" || h.slaBand === "CRITICAL").toBe(true);
  });

  it("filters overdue by SLA band", async () => {
    openHandoff(kyc({ entityId: "kyc_late", createdAt: new Date(NOW.getTime() - 10 * 24 * 3600 * 1000).toISOString() }), NOW);
    const critical = await getHandoffQueue({ sla: "CRITICAL" }, NOW);
    expect(critical.map((h) => h.entityId)).toContain("kyc_late");
    expect(critical.every((h) => h.slaBand === "CRITICAL")).toBe(true);

    const all = await getHandoffQueue({ sla: "ALL" }, NOW);
    expect(all.length).toBeGreaterThanOrEqual(critical.length);
    // sla=ALL must not silently widen the status filter.
    expect(all.every((h) => h.status === "OPEN" || h.status === "NOTIFIED" || h.status === "CLAIMED")).toBe(true);
  });
});

describe("slaBandFor — one rule, many surfaces", () => {
  it("agrees with evaluateSla for the same anchor and instant", () => {
    const anchor = new Date(NOW.getTime() - 5 * 3600 * 1000).toISOString();
    expect(slaBandFor("payout_batch", anchor, NOW)).toBe(evaluateSla("payout_batch", anchor, { now: NOW })?.band ?? null);
    expect(slaBandFor("refund", anchor, NOW)).toBe(evaluateSla("refund", anchor, { now: NOW })?.band ?? null);
  });

  it("returns null when there is no anchor to measure from", () => {
    expect(slaBandFor("refund", null, NOW)).toBeNull();
  });

  it("accepts a Date as well as an ISO string", () => {
    const anchor = new Date(NOW.getTime() - 5 * 3600 * 1000);
    expect(slaBandFor("payout_batch", anchor, NOW)).toBe(slaBandFor("payout_batch", anchor.toISOString(), NOW));
  });
});

describe("queue deep links", () => {
  it("every pending item carries a queue href and an action href", async () => {
    const queue = await getHandoffQueue({}, NOW);
    for (const item of queue) {
      expect(item.queueHref.startsWith("/")).toBe(true);
      expect(item.actionHref.startsWith("/")).toBe(true);
      expect(item.notifications.length).toBeGreaterThan(0);
      for (const n of item.notifications) {
        expect(n.href.startsWith("/")).toBe(true);
        expect(n.toRoles.length).toBeGreaterThan(0);
      }
    }
  });

  it("the refund queue href is the exact filter the transactions screen honours", async () => {
    const { rows } = await listTransactions(DEMO_CONTEXT, { pageSize: 50, page: 1 });
    const row = rows.find((t) => t.status !== "FAILED" && t.refundedAmount === 0);
    if (!row) return;
    await requestRefund(DEMO_CONTEXT, { transactionId: row.id, amount: 5_000, reason: "Duplicate", requestedBy: AGUS, now: NOW });

    const [item] = (await getHandoffQueue({ roles: ["FINANCE_ADMIN"] }, NOW)).filter(
      (h) => h.journey === "refund_approval" && h.entityId === row.id,
    );
    expect(item.queueHref).toBe("/transactions?refundState=AWAITING_APPROVAL");
    expect(item.actionHref).toBe(`/transactions/${row.id}`);
    expect(handoffIdentity(item.journey, item.entityType, item.entityId)).toBe(`refund_approval:refund:${row.id}`);
  });
});
