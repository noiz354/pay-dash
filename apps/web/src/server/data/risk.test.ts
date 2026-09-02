import { describe, expect, it } from "vitest";
import {
  deployRiskSettings,
  deriveAlerts,
  discardDraft,
  getRiskOverview,
  HIGH_RISK_SCORE,
  patchDraft,
  VOLUME_ALERT_PCT,
} from "./risk";
import { getLedgerRows, getTransaction } from "./transactions";

describe("risk store (ADR-0023)", () => {
  it("seeds an app-owned ruleset: four rules, IDR caps, no draft", async () => {
    const o = await getRiskOverview();
    expect(o.draft).toBeNull();
    expect(o.effective).toEqual(o.deployed);
    expect(o.deployed.dailyVolumeLimit).toBe(2_000_000_000);
    expect(o.deployed.monthlyVolumeLimit).toBe(60_000_000_000);
    expect(o.deployed.volumeLimitsEnabled).toBe(true);
    expect(o.deployed.rules).toHaveLength(4);
    expect(o.deployed.rules.map((r) => r.id)).toContain("rule_card_velocity");
    // the USD framing is gone: thresholds are positive IDR amounts or counts
    for (const r of o.deployed.rules) {
      expect(r.threshold).toBeGreaterThan(0);
    }
  });

  it("derives alerts from the ledger, and every transactionId resolves", async () => {
    const o = await getRiskOverview();
    const rows = getLedgerRows();
    const expected = rows.filter((t) => t.riskScore >= HIGH_RISK_SCORE).length;
    // a volume alert may be present only when usage >= VOLUME_ALERT_PCT
    expect(o.alertCount).toBe(expected);
    expect(o.usage.dailyPct).toBeLessThan(VOLUME_ALERT_PCT);
    expect(o.alerts).toHaveLength(expected);
    expect(o.alerts.every((a) => a.id.startsWith("alert_"))).toBe(true);
    for (const a of o.alerts) {
      expect(a.transactionId).toBeDefined();
      const tx = await getTransaction(a.transactionId!);
      expect(tx).not.toBeNull();
      expect(tx!.riskScore).toBeGreaterThanOrEqual(HIGH_RISK_SCORE);
      // newest-first
    }
    for (let i = 1; i < o.alerts.length; i++) {
      expect(new Date(o.alerts[i].at).getTime()).toBeLessThanOrEqual(
        new Date(o.alerts[i - 1].at).getTime()
      );
    }
  });

  it("derives cap usage and the score distribution from the ledger", async () => {
    const o = await getRiskOverview();
    const rows = getLedgerRows();
    expect(o.scanned).toBe(rows.length);
    expect(o.usage.dailyVolume24h).toBeGreaterThan(0);
    expect(o.usage.dailyPct).toBeGreaterThanOrEqual(0);
    expect(o.distribution.low + o.distribution.medium + o.distribution.high).toBe(rows.length);
    expect(o.distribution.high).toBe(o.alertCount);
  });

  it("draft lifecycle: patch -> deploy -> deployed wins, discard reverts", async () => {
    const before = await getRiskOverview();
    const beforeDeployedAt = before.deployedAt;

    patchDraft({ dailyVolumeLimit: 3_000_000_000 });
    let o = await getRiskOverview();
    expect(o.draft).not.toBeNull();
    expect(o.effective.dailyVolumeLimit).toBe(3_000_000_000);
    expect(o.deployed.dailyVolumeLimit).toBe(before.deployed.dailyVolumeLimit);

    const deployedAt = deployRiskSettings().deployedAt;
    o = await getRiskOverview();
    expect(o.draft).toBeNull();
    expect(o.deployed.dailyVolumeLimit).toBe(3_000_000_000);
    expect(o.effective).toEqual(o.deployed);
    expect(new Date(deployedAt).getTime()).toBeGreaterThan(
      new Date(beforeDeployedAt).getTime()
    );

    // deploy with no draft is a no-op
    const again = deployRiskSettings();
    expect(again.deployedAt).toBe(deployedAt);

    // rule toggle drafts, deploy commits, discard reverts
    patchDraft({ ruleId: "rule_high_value", ruleEnabled: true });
    o = await getRiskOverview();
    expect(o.effective.rules.find((r) => r.id === "rule_high_value")?.enabled).toBe(true);
    expect(o.deployed.rules.find((r) => r.id === "rule_high_value")?.enabled).toBe(false);

    expect(discardDraft()).toBe(true);
    o = await getRiskOverview();
    expect(o.draft).toBeNull();
    expect(o.effective.rules.find((r) => r.id === "rule_high_value")?.enabled).toBe(false);
    expect(discardDraft()).toBe(false);
  });

  it("raises the volume alert only when 24h usage reaches the threshold", () => {
    const rows = getLedgerRows();
    const base = {
      dailyVolumeLimit: 2_000_000_000,
      monthlyVolumeLimit: 60_000_000_000,
      volumeLimitsEnabled: true,
      rules: [],
    };

    // a 1 IDR cap makes any real 24h volume breach the threshold
    const breached = deriveAlerts(
      { ...base, dailyVolumeLimit: 1 },
      rows
    );
    expect(breached.map((a) => a.id)).toContain("alert_volume_daily");
    expect(breached.find((a) => a.id === "alert_volume_daily")?.severity).toBe("critical");

    // the seeded cap is far above the ledger's 24h volume
    const quiet = deriveAlerts(base, rows);
    expect(quiet.map((a) => a.id)).not.toContain("alert_volume_daily");

    // and the check is skipped when volume limits are disabled
    const disabled = deriveAlerts(
      { ...base, dailyVolumeLimit: 1, volumeLimitsEnabled: false },
      rows
    );
    expect(disabled.map((a) => a.id)).not.toContain("alert_volume_daily");
  });
});
