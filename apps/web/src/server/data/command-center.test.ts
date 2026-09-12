import { beforeEach, describe, expect, it } from "vitest";

import {
  COMMAND_CENTER_LANES,
  COUNTED_EXCEPTION_LANES,
  EXCEPTION_LANES,
  LANE_META,
  emptyCommandCenter,
  isCommandCenterDto,
  type CommandCenterItem,
  type CommandCenterLane,
} from "@/lib/command-center";
import { __resetHandoffStore, openHandoff, rolesWithPermission, type OpenHandoffInput } from "./handoff-store";
import { getCommandCenter, toDto, worstBand, type CommandCenterSnapshot } from "./command-center";
import { getPayoutBatches } from "./payouts";
import { listTransactions, requestRefund } from "./transactions";

// Wave 4 §2 — the Command Center.
//
// The property that makes this an ops surface rather than a summary: every lane
// is derived from the *same* stores the list screens read, so a count here and
// the filtered list behind `href` are one query and cannot disagree. The second
// property: `canAct` is computed server-side, so a card never offers an action
// the session would be refused.

function resetStores() {
  const g = globalThis as unknown as Record<string, unknown>;
  g.__kineticTxStore = undefined;
  g.__kineticPayoutStore = undefined;
  g.__kineticBalanceStore = undefined;
  __resetHandoffStore();
}

beforeEach(resetStores);

// Real clock: the seeded demo ledger is dated relative to import time, so a
// fixed past instant would make seeded rows look future-dated (age clamped to 0).
const NOW = new Date();
const AGUS = "persona_agus";

function laneOf(cc: CommandCenterSnapshot, lane: CommandCenterLane): CommandCenterItem[] {
  return cc.lanes[lane];
}

function itemOf(cc: CommandCenterSnapshot, lane: CommandCenterLane, id: string): CommandCenterItem | undefined {
  return cc.lanes[lane].find((i) => i.id === id);
}

/** A team invite opened 10 days ago: 5d SLA + 2d to critical => CRITICAL. */
function staleInvite(): OpenHandoffInput {
  return {
    journey: "invite_acceptance",
    entityType: "team_invite",
    entityId: "inv_stale",
    entityLabel: "inv_stale",
    fromActor: AGUS,
    fromRole: "OWNER",
    toRoles: rolesWithPermission("team.manage"),
    requiredPermission: "team.manage",
    slaEntityType: "team_invite",
    createdAt: new Date(NOW.getTime() - 10 * 24 * 3600 * 1000).toISOString(),
    queueHref: "/team",
    actionHref: "/team",
    message: "Team invite awaiting acceptance",
  };
}

describe("lane structure", () => {
  it("returns exactly the six spec §7 lanes, keyed and ordered", async () => {
    const cc = await getCommandCenter(["OWNER"], NOW);
    expect(Object.keys(cc.lanes)).toEqual(COMMAND_CENTER_LANES);
    expect(COMMAND_CENTER_LANES).toEqual([
      "critical",
      "needs_attention",
      "pending_approval",
      "failed",
      "overdue",
      "recently_completed",
    ]);
    expect(cc.roles).toEqual(["OWNER"]);
    expect(cc.generatedAt).toBe(NOW.toISOString());
  });

  it("gives every item a deep link, a tone and a concrete sample", async () => {
    const cc = await getCommandCenter(["OWNER"], NOW);
    let seen = 0;
    for (const lane of COMMAND_CENTER_LANES) {
      for (const item of laneOf(cc, lane)) {
        seen += 1;
        expect(item.lane).toBe(lane);
        expect(item.tone).toBe(LANE_META[lane].tone);
        expect(item.count).toBeGreaterThan(0); // empty groups are dropped, not rendered
        expect(item.title.length).toBeGreaterThan(0);
        expect(item.description.length).toBeGreaterThan(0);
        expect(item.href.startsWith("/")).toBe(true);
        expect(item.icon.length).toBeGreaterThan(0);
        expect(item.samples.length).toBeGreaterThan(0);
        expect(item.samples.length).toBeLessThanOrEqual(3);
        expect(typeof item.canAct).toBe("boolean");
      }
    }
    // The seeded demo ledger is never empty — a blank Command Center would mean
    // the aggregation silently swallowed its sources.
    expect(seen).toBeGreaterThan(0);
  });

  it("keeps PII out of the sample labels (spec §26)", async () => {
    const cc = await getCommandCenter(["OWNER"], NOW);
    for (const lane of COMMAND_CENTER_LANES) {
      for (const item of laneOf(cc, lane)) {
        for (const sample of item.samples) {
          expect(sample).not.toMatch(/@/); // no email
          expect(sample).not.toMatch(/(?:\+?62|0)[\s-]?8\d{1,2}/); // no phone
          expect(sample).not.toMatch(/\d{10,}/); // no account/NIK number
        }
      }
    }
  });

  it("sorts each lane worst-first", async () => {
    openHandoff(staleInvite(), NOW);
    const cc = await getCommandCenter(["OWNER"], NOW);
    for (const lane of COMMAND_CENTER_LANES) {
      const items = laneOf(cc, lane);
      for (let i = 1; i < items.length; i += 1) {
        expect(items[i - 1].severity).toBeGreaterThanOrEqual(items[i].severity);
      }
    }
  });
});

describe("permission awareness (§2)", () => {
  it("marks a permissioned lane item actionable only for a role that holds it", async () => {
    // The seed carries a FAILED recipient, so the retry card is populated.
    const hasFailedRecipient = getPayoutBatches().some((b) =>
      b.recipients.some((r) => r.status === "FAILED" || r.status === "RETURNED"),
    );
    if (!hasFailedRecipient) return;

    const owner = await getCommandCenter(["OWNER"], NOW);
    const support = await getCommandCenter(["SUPPORT"], NOW);
    expect(itemOf(owner, "failed", "failed-recipients")?.canAct).toBe(true);
    expect(itemOf(support, "failed", "failed-recipients")?.canAct).toBe(false);
    // Still shown — hiding it recreates the dead end §4 forbids.
    expect(itemOf(support, "failed", "failed-recipients")).toBeDefined();
  });

  it("derives canAct for the aggregated handoff lanes from the underlying handoffs", async () => {
    openHandoff(staleInvite(), NOW);
    const able = rolesWithPermission("team.manage");
    const owner = await getCommandCenter(["OWNER"], NOW);
    const support = await getCommandCenter(["SUPPORT"], NOW);

    // `critical-sla` / `overdue-handoffs` have a null permission because they
    // aggregate journeys; the override makes them truthful anyway.
    expect(itemOf(owner, "critical", "critical-sla")?.canAct).toBe(true);
    expect(itemOf(support, "critical", "critical-sla")?.canAct).toBe(false);
    expect(itemOf(owner, "overdue", "overdue-handoffs")?.canAct).toBe(true);
    expect(itemOf(support, "overdue", "overdue-handoffs")?.canAct).toBe(false);
    expect(able).toContain("OWNER");
    expect(able).not.toContain("SUPPORT");
  });

  it("counts a real two-phase refund as pending approval for the approver only", async () => {
    const { rows } = await listTransactions({ pageSize: 50, page: 1 });
    const row = rows.find((t) => t.status !== "FAILED" && t.refundedAmount === 0);
    expect(row).toBeDefined();
    if (!row) return;
    await requestRefund({ transactionId: row.id, amount: 5_000, reason: "Duplicate", requestedBy: AGUS, now: NOW });

    const admin = await getCommandCenter(["FINANCE_ADMIN"], NOW);
    const support = await getCommandCenter(["SUPPORT"], NOW);
    const adminCard = itemOf(admin, "pending_approval", "pending-handoffs");
    expect(adminCard).toBeDefined();
    expect(adminCard?.canAct).toBe(true);
    expect(adminCard?.samples).toContain(row.referenceId);
    expect(itemOf(support, "pending_approval", "pending-handoffs")?.canAct).toBe(false);
    expect(admin.allClear).toBe(false);
  });

  it("reports allClear only when no exception lane has work", async () => {
    const cc = await getCommandCenter(["OWNER"], NOW);
    expect(cc.allClear).toBe(cc.totals.exceptions === 0);
    // The demo ledger always has exceptions; if that ever changes this asserts
    // the celebrate state is reached rather than stuck on.
    expect(cc.totals.exceptions).toBeGreaterThan(0);
    expect(cc.allClear).toBe(false);
    // allClear must never be true while a counted lane still holds work.
    expect(COUNTED_EXCEPTION_LANES.some((lane) => cc.totals[lane] > 0)).toBe(true);
  });
});

describe("totals and the overdue cross-cut", () => {
  it("sums the exception lanes and excludes the overdue cross-cut", async () => {
    openHandoff(staleInvite(), NOW);
    const cc = await getCommandCenter(["OWNER"], NOW);

    for (const lane of COMMAND_CENTER_LANES) {
      expect(cc.totals[lane]).toBe(laneOf(cc, lane).reduce((sum, i) => sum + i.count, 0));
    }
    expect(cc.totals.exceptions).toBe(
      cc.totals.critical + cc.totals.needs_attention + cc.totals.pending_approval + cc.totals.failed,
    );
    // A CRITICAL handoff lands in both `critical` and `overdue`; counting the
    // cross-cut into exceptions would report the same record twice.
    expect(cc.totals.overdue).toBeGreaterThan(0);
    expect(EXCEPTION_LANES).toContain("overdue"); // rendered as an exception lane…
    expect(COUNTED_EXCEPTION_LANES).not.toContain("overdue"); // …but never summed
    expect(cc.totals.exceptions).toBe(COUNTED_EXCEPTION_LANES.reduce((sum, lane) => sum + cc.totals[lane], 0));
    expect(cc.totals.exceptions).toBeLessThan(EXCEPTION_LANES.reduce((sum, lane) => sum + cc.totals[lane], 0));
  });

  it("exposes the worst band for the page banner", async () => {
    openHandoff(staleInvite(), NOW);
    const cc = await getCommandCenter(["OWNER"], NOW);
    expect(worstBand(cc)).toBe("CRITICAL");
  });

  it("returns null from worstBand when nothing carries an SLA", () => {
    expect(worstBand(emptySnapshot())).toBeNull();
  });
});

function emptySnapshot(): CommandCenterSnapshot {
  const lanes = {} as Record<CommandCenterLane, CommandCenterItem[]>;
  for (const lane of COMMAND_CENTER_LANES) lanes[lane] = [];
  return {
    generatedAt: NOW.toISOString(),
    lanes,
    totals: {
      critical: 0,
      needs_attention: 0,
      pending_approval: 0,
      failed: 0,
      overdue: 0,
      recently_completed: 0,
      exceptions: 0,
    },
    allClear: true,
    roles: [],
  };
}

describe("client DTO (§8 — polled over the wire)", () => {
  it("survives JSON round-tripping into the shape the client validates", async () => {
    const cc = await getCommandCenter(["OWNER"], NOW);
    const json = JSON.parse(JSON.stringify(toDto(cc)));
    expect(isCommandCenterDto(json)).toBe(true);
    expect(json.generatedAt).toBe(cc.generatedAt);
    expect(json.allClear).toBe(cc.allClear);
    expect(Object.keys(json.lanes)).toEqual(COMMAND_CENTER_LANES);
    // Roles never leave the server.
    expect(json.roles).toBeUndefined();
  });

  it("rejects a malformed payload rather than crashing the dashboard", () => {
    expect(isCommandCenterDto(null)).toBe(false);
    expect(isCommandCenterDto({})).toBe(false);
    expect(isCommandCenterDto({ generatedAt: "x", allClear: true, totals: {}, lanes: {} })).toBe(false);
    const partial = emptyCommandCenter();
    delete (partial.lanes as Record<string, unknown>).failed;
    expect(isCommandCenterDto(partial)).toBe(false);
  });

  it("provides an empty fallback the client can render before its first read", () => {
    const empty = emptyCommandCenter(NOW.toISOString());
    expect(isCommandCenterDto(empty)).toBe(true);
    expect(empty.allClear).toBe(true);
    expect(empty.totals.exceptions).toBe(0);
    for (const lane of COMMAND_CENTER_LANES) expect(empty.lanes[lane]).toEqual([]);
  });
});

describe("recently completed — proof the queue drains", () => {
  it("includes work resolved inside 24h and excludes older work", async () => {
    openHandoff(staleInvite(), NOW);
    const tracked = await import("./handoff-store").then((m) => m.listStoredHandoffs()[0]);
    const { completeHandoff } = await import("./handoff-store");
    completeHandoff(tracked.id, { actor: "persona_hendri", outcome: "approved", enforceDistinctActor: true, now: NOW });

    const cc = await getCommandCenter(["OWNER"], NOW);
    const recent = itemOf(cc, "recently_completed", "recently-completed");
    expect(recent?.samples).toContain("inv_stale");
    // Nothing in the lane may be older than the window it advertises.
    expect(recent?.oldestAgeSeconds ?? 0).toBeLessThanOrEqual(24 * 3600);
  });
});
