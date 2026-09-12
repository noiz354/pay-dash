import { beforeEach, describe, expect, it } from "vitest";
import { addBlocklist } from "./blocklist";
import { auditEventsToCsv, auditSummary, getAuditEvents, listAuditEvents } from "./audit";
import { getLedgerRows } from "./transactions";
import { createApiKey } from "./settings";
import { tenantScope } from "@/domain/security/tenant";
const SCOPE = tenantScope("org-a");

function resetAllStores() {
  const g = globalThis as unknown as {
    __kineticSettingsStore?: unknown;
    __kineticPayoutStore?: unknown;
    __kineticWebhooksStore?: unknown;
    __kineticTxStore?: unknown;
    __kineticKycStore?: unknown;
    __kineticBlocklistStore?: unknown;
    __kineticRiskStore?: unknown;
    __kineticTeamStore?: unknown;
  };
  g.__kineticSettingsStore = undefined;
  g.__kineticPayoutStore = undefined;
  g.__kineticWebhooksStore = undefined;
  g.__kineticTxStore = undefined;
  g.__kineticKycStore = undefined;
  g.__kineticBlocklistStore = undefined;
  g.__kineticRiskStore = undefined;
  g.__kineticTeamStore = undefined;
  // Wave 7A: the seeded ledger is multi-org (org-a/org-b/demo). This suite
  // asserts absolute seeded-world counts through the scoped path, so re-own
  // the deterministic seed to the test scope. Tenant isolation itself is
  // proven by the S6 cross-tenant matrix, not here.
  getLedgerRows(SCOPE); // trigger lazy seed
  const txStore = g as unknown as { __kineticTxStore?: { rows: { organizationId: string }[] } };
  for (const row of txStore.__kineticTxStore?.rows ?? []) row.organizationId = SCOPE.organizationId;
}

beforeEach(resetAllStores);

// Seeded world (deterministic):
//  - 46 ledger transactions × event timelines (created/authorized + status
//    event) = 140 payment events: 92 INFO, 35 SUCCESS (captured),
//    9 WARNING (7 awaiting + 2 refunds), 4 FAILED (declined).
//  - 5 payout batches × timeline = 10 events (7 INFO, 2 SUCCESS, 1 WARNING).
//  - 7 webhook callbacks (4 RECEIVED, 1 DUPLICATED, 2 REJECTED).
//  - configuration = 3 API-key creations + 10 blocklist additions +
//    1 velocity-ruleset deploy + 5 team joins + 1 team invite = 20.
//  - grand total 177: 60 SUCCESS, 4 FAILED, 12 WARNING, 101 INFO.
const SEED_TOTAL = 177;

describe("audit — seeded world", () => {
  it("derives 177 events across the four categories", async () => {
    const summary = await auditSummary(SCOPE, );
    expect(summary.total).toBe(SEED_TOTAL);
    expect(summary.byCategory).toEqual({
      PAYMENTS: 140,
      PAYOUTS: 10,
      WEBHOOKS: 7,
      CONFIGURATION: 20,
    });
  });

  it("lists newest first with honest status mapping", async () => {
    const all = await getAuditEvents(SCOPE, );
    expect(all).toHaveLength(SEED_TOTAL);
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].at >= all[i].at).toBe(true);
    }
    const failed = all.filter((e) => e.status === "FAILED");
    expect(failed).toHaveLength(4);
    expect(failed.every((e) => e.category === "PAYMENTS" && e.action === "Authorization declined"))
      .toBe(true);
    // a rejected callback is the endpoint doing its job — warning, not failure
    const rejected = all.filter((e) => e.action === "Callback rejected");
    expect(rejected).toHaveLength(2);
    expect(rejected.every((e) => e.status === "WARNING")).toBe(true);
  });

  it("carries the real facts, not the prototype's invented rows", async () => {
    const all = await getAuditEvents(SCOPE, );
    const text = all.map((e) => `${e.action} ${e.resource} ${e.detail}`).join("\n");
    // off-world actors and invented ids are absent
    expect(text).not.toContain("alice.jones");
    expect(text).not.toContain("@org.com");
    expect(text).not.toContain("key_prod_892f");
    expect(text).not.toContain("2023");
    // real identifiers are present
    expect(all.some((e) => e.resource === "Production Main" && e.action === "API key created"))
      .toBe(true);
    expect(all.some((e) => e.action === "Velocity ruleset deployed")).toBe(true);
    expect(all.some((e) => e.action === "Team invite sent" && e.resource === "elena.j@acmecorp.com"))
      .toBe(true);
    expect(all.some((e) => e.category === "PAYOUTS" && e.resource === "BATCH-2026-08-014")).toBe(true);
  });
});

describe("audit — filters", () => {
  it("filters by category, status, range and free text", async () => {
    const byCategory = await listAuditEvents(SCOPE, { category: "CONFIGURATION" });
    expect(byCategory.total).toBe(20);

    const failed = await listAuditEvents(SCOPE, { status: "FAILED" });
    expect(failed.total).toBe(4);
    expect(failed.isFiltered).toBe(true);

    const day = await listAuditEvents(SCOPE, { range: "24h" });
    expect(day.total).toBeGreaterThan(0);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    expect(day.rows.every((e) => new Date(e.at).getTime() >= cutoff)).toBe(true);

    const searched = await listAuditEvents(SCOPE, { q: "authorization declined" });
    expect(searched.total).toBe(4);

    const combined = await listAuditEvents(SCOPE, { category: "PAYMENTS", status: "WARNING" });
    expect(combined.total).toBe(9); // 7 awaiting + 2 refunds
  });

  it("paginates the derived history", async () => {
    const page1 = await listAuditEvents(SCOPE, { page: 1, pageSize: 10 });
    expect(page1.pageCount).toBe(18);
    expect(page1.rows).toHaveLength(10);
    const last = await listAuditEvents(SCOPE, { page: 18, pageSize: 10 });
    expect(last.rows).toHaveLength(7);
    // over-range pages clamp instead of 404-ing
    const clamped = await listAuditEvents(SCOPE, { page: 99, pageSize: 10 });
    expect(clamped.page).toBe(18);
  });

  it("has a true empty state when nothing matches", async () => {
    const none = await listAuditEvents(SCOPE, { q: "zzzz-no-such-event" });
    expect(none.total).toBe(0);
    expect(none.rows).toHaveLength(0);
  });
});

describe("audit — live reads", () => {
  it("re-derives when the owners change", async () => {
    await addBlocklist({ type: "IP", value: "203.0.113.99", reason: "MANUAL_ENTRY" });
    await createApiKey({ name: "Staging", environment: "TEST", scopes: ["read"] });
    const summary = await auditSummary(SCOPE, );
    expect(summary.byCategory.CONFIGURATION).toBe(22);
    expect(summary.total).toBe(SEED_TOTAL + 2);
  });
});

describe("audit — CSV", () => {
  it("escapes cells and matches the filtered view", async () => {
    const { rows } = await listAuditEvents(SCOPE, { category: "WEBHOOKS", page: 1, pageSize: 10 });
    const csv = auditEventsToCsv(rows);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("timestamp,category,status,action,resource,detail");
    expect(lines).toHaveLength(rows.length + 1);
    expect(csv).toContain("Callback received");
  });
});
