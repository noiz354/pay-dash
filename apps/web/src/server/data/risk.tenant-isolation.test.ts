// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { createTransaction, getLedgerRows } from "./transactions";
import {
  countRiskTenants,
  deriveAlerts,
  discardDraft,
  deployRiskSettings,
  getRiskOverview,
  patchDraft,
  soleRiskOrganizationId,
  type RiskSettings,
} from "./risk";

/**
 * Wave 7G Q1 — risk policy tenant isolation, target-API tests (G-5).
 *
 * The drafted spec called this module *verify-only* ("`deriveAlerts` is already
 * pure-over-rows, no ctx needed"). Q0 verification found that half right and
 * dangerously incomplete:
 *
 *   - `deriveAlerts(settings, rows)` **is** pure ✓ — pinned below and in GS-3;
 *   - `getRiskOverview()` reads `legacyLedgerRows("risk")` and aggregates volume,
 *     distribution and alerts over **every tenant's ledger**;
 *   - and the risk store is a process-wide singleton holding `deployed` +
 *     `draft`, so `patchDraft` / `deployRiskSettings` / `discardDraft` are
 *     **shared-policy writes**: tenant A deploying a velocity cap silently
 *     changes tenant B's effective limits, and A can discard B's pending draft.
 *
 * That last one is the loudest class in this programme — a cross-tenant *write*
 * to the control that decides whether B's payments get blocked. So risk joins
 * the scoped set, which is also what clears the `risk` entry in
 * `LEGACY_LEDGER_SURFACES`.
 *
 * Product defaults (`DEPLOYED_SETTINGS`: the four-rule starter ruleset and the
 * IDR volume caps) are the app's own vocabulary, not another tenant's data, so a
 * fresh tenant still starts from them — but not from the demo tenant's
 * *history*: `deployedAt` is not back-dated twelve days for a tenant that has
 * never deployed anything.
 *
 * RED on `6c104ab`: `risk.ts` accepts no tenant anywhere.
 */

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA: OrganizationContext = parseOrganizationContext({ organizationId: ORG_A });
const ctxB: OrganizationContext = parseOrganizationContext({ organizationId: ORG_B });
const ctxDemo: OrganizationContext = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });

const PRODUCT_DEFAULT_DAILY = 2_000_000_000;

function resetStores() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticRiskStore;
  delete g.__kineticTxStore;
}

function rawPartitions(): Map<string, { deployed: RiskSettings; deployedAt: string; draft: unknown }> {
  const g = globalThis as unknown as {
    __kineticRiskStore?: { tenants?: Map<string, { deployed: RiskSettings; deployedAt: string; draft: unknown }> };
  };
  return g.__kineticRiskStore?.tenants ?? new Map();
}

beforeEach(() => {
  resetStores();
});

describe("G-5 risk policy is per tenant", () => {
  it("a tenant's overview aggregates only its own ledger", async () => {
    await createTransaction(ctxA, {
      amount: 5_000_000,
      currency: "IDR",
      channel: "CARD",
      customerName: "Alpha payer",
      customerEmail: "payer@alpha.test",
      description: "Alpha sale",
    });

    const a = await getRiskOverview(ctxA);
    expect(a.scanned).toBe(1);
    expect(a.distribution.low + a.distribution.medium + a.distribution.high).toBe(1);

    // B has no ledger of its own: nothing scanned, nothing counted, no A content.
    const b = await getRiskOverview(ctxB);
    expect(b.scanned).toBe(0);
    expect(b.alertCount).toBe(0);
    expect(b.usage.monthlyVolume30d).toBe(0);
    expect(b.distribution).toEqual({ low: 0, medium: 0, high: 0 });
    expect(JSON.stringify(b.alerts)).not.toContain("Alpha payer");
  });

  it("the demo tenant keeps its seeded world; a fresh tenant does not inherit its history", async () => {
    const demo = await getRiskOverview(ctxDemo);
    expect(demo.scanned).toBeGreaterThan(0);
    expect(demo.deployed.rules.length).toBeGreaterThan(0);

    const fresh = await getRiskOverview(ctxA);
    expect(fresh.scanned).toBe(0);
    // Product defaults are shared vocabulary, so the starter ruleset is present…
    expect(fresh.deployed.rules.map((r) => r.id)).toEqual(demo.deployed.rules.map((r) => r.id));
    // …but the demo tenant's deployment history is not.
    expect(fresh.deployedAt).not.toBe(demo.deployedAt);
    expect(fresh.draft).toBeNull();
  });

  it("each tenant edits its own draft", async () => {
    const a = patchDraft(ctxA, { dailyVolumeLimit: 1_000 });
    expect(a.settings.dailyVolumeLimit).toBe(1_000);

    const b = patchDraft(ctxB, { dailyVolumeLimit: 999_000 });
    expect(b.settings.dailyVolumeLimit).toBe(999_000);

    // Neither draft is visible in the other tenant's effective settings.
    expect((await getRiskOverview(ctxA)).effective.dailyVolumeLimit).toBe(1_000);
    expect((await getRiskOverview(ctxB)).effective.dailyVolumeLimit).toBe(999_000);
    expect(rawPartitions().get(ORG_A)?.draft).not.toBeNull();
    expect(rawPartitions().get(ORG_B)?.draft).not.toBeNull();
  });

  it("a rule toggle by id only reaches the caller's own ruleset", () => {
    const a = patchDraft(ctxA, { ruleId: "rule_high_value", ruleEnabled: true });
    expect(a.settings.rules.find((r) => r.id === "rule_high_value")?.enabled).toBe(true);

    // B's copy of the same rule id is untouched (rule ids are product vocabulary).
    const b = patchDraft(ctxB, { dailyVolumeLimit: 42 });
    expect(b.settings.rules.find((r) => r.id === "rule_high_value")?.enabled).toBe(false);
  });

  it("deploying in A does not change B's effective limits", () => {
    patchDraft(ctxA, { dailyVolumeLimit: 1_234 });
    const deployed = deployRiskSettings(ctxA);
    expect(deployed.ruleCount).toBeGreaterThan(0);

    expect(rawPartitions().get(ORG_A)?.deployed.dailyVolumeLimit).toBe(1_234);
    expect(rawPartitions().get(ORG_A)?.draft).toBeNull();
    // B either has no partition yet or still holds the product default.
    expect(rawPartitions().get(ORG_B)?.deployed.dailyVolumeLimit ?? PRODUCT_DEFAULT_DAILY).toBe(PRODUCT_DEFAULT_DAILY);
  });

  it("A cannot discard B's pending draft", () => {
    patchDraft(ctxB, { monthlyVolumeLimit: 777 });
    expect(rawPartitions().get(ORG_B)?.draft).not.toBeNull();

    // A has no draft of its own: the honest answer is false, and B's survives.
    expect(discardDraft(ctxA)).toBe(false);
    expect(rawPartitions().get(ORG_B)?.draft).not.toBeNull();

    expect(discardDraft(ctxB)).toBe(true);
    expect(rawPartitions().get(ORG_B)?.draft).toBeNull();
  });

  it("deploy with no draft is a no-op that fabricates nothing", () => {
    const result = deployRiskSettings(ctxA);
    expect(result.ruleCount).toBeGreaterThan(0);
    expect(rawPartitions().get(ORG_A)?.draft ?? null).toBeNull();
  });

  it("the overview is a copy: mutating it cannot reach the store", async () => {
    patchDraft(ctxA, { dailyVolumeLimit: 555 });
    const view = await getRiskOverview(ctxA);
    view.effective.dailyVolumeLimit = 1;
    view.deployed.rules.push({
      id: "injected",
      name: "x",
      scope: "GLOBAL",
      metric: "COUNT",
      threshold: 1,
      window: "daily",
      action: "BLOCK",
      enabled: true,
    });

    const again = await getRiskOverview(ctxA);
    expect(again.effective.dailyVolumeLimit).toBe(555);
    expect(again.deployed.rules.some((r) => r.id === "injected")).toBe(false);
  });

  it("probes count tenants and never return a policy", () => {
    expect(countRiskTenants()).toBe(0);
    expect(soleRiskOrganizationId()).toBeNull();

    patchDraft(ctxA, { dailyVolumeLimit: 1 });
    expect(countRiskTenants()).toBe(1);
    expect(soleRiskOrganizationId()).toBe(ORG_A);

    patchDraft(ctxB, { dailyVolumeLimit: 2 });
    expect(countRiskTenants()).toBe(2);
    expect(soleRiskOrganizationId()).toBeNull();
  });

  it("the store holds partitions, not one shared policy", () => {
    patchDraft(ctxA, { dailyVolumeLimit: 1 });
    patchDraft(ctxB, { dailyVolumeLimit: 2 });
    expect([...rawPartitions().keys()].sort()).toEqual([ORG_A, ORG_B].sort());
  });

  it("a missing context is rejected on the read and on every policy write", async () => {
    const missing = undefined as unknown as OrganizationContext;
    await expect(getRiskOverview(missing)).rejects.toThrow();
    expect(() => patchDraft(missing, { dailyVolumeLimit: 1 })).toThrow();
    expect(() => deployRiskSettings(missing)).toThrow();
    expect(() => discardDraft(missing)).toThrow();
    expect(() => parseOrganizationContext({ organizationId: "   " })).toThrow();
  });
});

describe("G-5b deriveAlerts stays pure", () => {
  const settings: RiskSettings = {
    dailyVolumeLimit: 1_000,
    monthlyVolumeLimit: 2_000,
    volumeLimitsEnabled: true,
    rules: [],
  };
  const rows = [
    { id: "tx_1", riskScore: 92, status: "SUCCEEDED", amount: 500, createdAt: new Date().toISOString() },
    { id: "tx_2", riskScore: 10, status: "SUCCEEDED", amount: 500, createdAt: new Date().toISOString() },
  ] as never;

  it("answers from its arguments alone, identically with two tenants in the store", () => {
    const first = deriveAlerts(settings, rows);

    patchDraft(ctxA, { dailyVolumeLimit: 1 });
    patchDraft(ctxB, { dailyVolumeLimit: 2 });

    expect(deriveAlerts(settings, rows)).toEqual(first);
    expect(first.some((a) => a.transactionId === "tx_1")).toBe(true);
  });

  it("reads no store: the caller's ledger stays empty while it runs", () => {
    const alerts = deriveAlerts(settings, rows);
    expect(alerts.length).toBeGreaterThan(0);
    expect(getLedgerRows(ctxA)).toHaveLength(0);
    expect(getLedgerRows(ctxB)).toHaveLength(0);
  });
});
