import "server-only";

// ---------------------------------------------------------------------------
// Risk & velocity limits (ADR-0023). INTEGRATION.md:117/:320 documents the
// screen with NO Xendit source — "Velocity/risk thresholds are
// Dashboard-only" — so the ruleset, the volume limits and the draft/deploy
// workflow are business records the app itself manages (the class the team,
// webhooks and links pages use). What is DERIVED, not seeded:
//   - high-risk alerts: ledger transactions with riskScore >= HIGH_RISK_SCORE
//   - cap usage: settled volume in 24h / 30d against the deployed caps
//   - the risk-score distribution of the ledger
// The prototype's "14 alerts / 12% vs yesterday", its "Card ending 4492"
// (the ledger has no card last4 field) and its "Merchant A" had no referent.
// ---------------------------------------------------------------------------

import { HIGH_RISK_SCORE, VOLUME_ALERT_PCT } from "@/lib/risk-options";
import { getLedgerRows, type Transaction } from "./transactions";

export { HIGH_RISK_SCORE, VOLUME_ALERT_PCT } from "@/lib/risk-options";

export type RuleScope = "GLOBAL" | "CARD" | "CUSTOMER";
export type RuleMetric = "VOLUME" | "COUNT";
export type RuleAction = "ALERT" | "BLOCK";
export type RuleWindow = "hourly" | "daily" | "monthly" | "per_txn";

export type VelocityRule = {
  id: string;
  name: string;
  scope: RuleScope;
  metric: RuleMetric;
  /** IDR for VOLUME rules, transaction count for COUNT rules. */
  threshold: number;
  window: RuleWindow;
  action: RuleAction;
  enabled: boolean;
};

export type RiskSettings = {
  dailyVolumeLimit: number;
  monthlyVolumeLimit: number;
  volumeLimitsEnabled: boolean;
  rules: VelocityRule[];
};

export type RiskAlert = {
  id: string;
  severity: "critical" | "warning";
  title: string;
  detail: string;
  at: string;
  transactionId?: string;
};

export type RiskDraft = {
  settings: RiskSettings;
  savedAt: string;
};

export type RiskOverview = {
  /** draft ?? deployed — what the page edits show. */
  effective: RiskSettings;
  deployed: RiskSettings;
  deployedAt: string;
  draft: RiskDraft | null;
  alerts: RiskAlert[];
  /** all high-risk transactions (the list shows the top 5). */
  alertCount: number;
  scanned: number;
  usage: {
    dailyVolume24h: number;
    dailyPct: number;
    monthlyVolume30d: number;
    monthlyPct: number;
  };
  distribution: { low: number; medium: number; high: number };
};

// --- seed ------------------------------------------------------------------

// The deployed ruleset is the app's own configuration history: seeded as
// "deployed 12 days ago" so Deploy/Discard have a real baseline. Volume caps
// are IDR (the prototype's USD framing was prototype debris) and sized
// plausibly against the ledger world (available balance Rp 2.2B; 46 seeded
// transactions totalling ~Rp 1.1B over ~6 days).
const DEPLOYED_SETTINGS: RiskSettings = {
  dailyVolumeLimit: 2_000_000_000,
  monthlyVolumeLimit: 60_000_000_000,
  volumeLimitsEnabled: true,
  rules: [
    {
      id: "rule_card_velocity",
      name: "Card velocity",
      scope: "CARD",
      metric: "COUNT",
      threshold: 25,
      window: "hourly",
      action: "ALERT",
      enabled: true,
    },
    {
      id: "rule_card_daily",
      name: "Max daily card charge",
      scope: "CARD",
      metric: "VOLUME",
      threshold: 50_000_000,
      window: "daily",
      action: "BLOCK",
      enabled: true,
    },
    {
      id: "rule_customer_burst",
      name: "Customer burst",
      scope: "CUSTOMER",
      metric: "COUNT",
      threshold: 10,
      window: "hourly",
      action: "ALERT",
      enabled: true,
    },
    {
      id: "rule_high_value",
      name: "High-value transaction",
      scope: "GLOBAL",
      metric: "VOLUME",
      threshold: 100_000_000,
      window: "per_txn",
      action: "ALERT",
      enabled: false,
    },
  ],
};

type RiskStore = {
  deployed: RiskSettings;
  deployedAt: string;
  draft: RiskDraft | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function seedStore(): RiskStore {
  const anchor = new Date();
  anchor.setUTCHours(9, 0, 0, 0);
  return {
    deployed: structuredClone(DEPLOYED_SETTINGS),
    deployedAt: new Date(anchor.getTime() - 12 * DAY_MS).toISOString(),
    draft: null,
  };
}

const globalStore = globalThis as unknown as { __kineticRiskStore?: RiskStore };
function store(): RiskStore {
  if (!globalStore.__kineticRiskStore) globalStore.__kineticRiskStore = seedStore();
  return globalStore.__kineticRiskStore;
}

function clone(s: RiskSettings): RiskSettings {
  return structuredClone(s);
}

// --- derivation --------------------------------------------------------------

function settleVolumeSince(rows: Transaction[], sinceMs: number): number {
  const since = Date.now() - sinceMs;
  return rows
    .filter((t) => t.status === "SUCCEEDED" && new Date(t.createdAt).getTime() >= since)
    .reduce((sum, t) => sum + t.amount, 0);
}

export function deriveAlerts(settings: RiskSettings, rows: Transaction[]): RiskAlert[] {
  const alerts: RiskAlert[] = [];

  if (settings.volumeLimitsEnabled) {
    const volume24h = settleVolumeSince(rows, DAY_MS);
    const pct = Math.round((volume24h / settings.dailyVolumeLimit) * 100);
    if (pct >= VOLUME_ALERT_PCT) {
      alerts.push({
        id: "alert_volume_daily",
        severity: "critical",
        title: `Daily volume at ${pct}% of cap`,
        detail: `Rp ${volume24h.toLocaleString("id-ID")} settled in 24h against the Rp ${settings.dailyVolumeLimit.toLocaleString("id-ID")} cap.`,
        at: new Date().toISOString(),
      });
    }
  }

  for (const t of rows) {
    if (t.riskScore < HIGH_RISK_SCORE) continue;
    alerts.push({
      id: `alert_${t.id}`,
      severity: t.riskScore >= 70 ? "critical" : "warning",
      title: `Risk score ${t.riskScore} — ${t.customerName}`,
      detail: `Rp ${t.amount.toLocaleString("id-ID")} via ${t.methodLabel} (${t.status.toLowerCase()}).`,
      at: t.createdAt,
      transactionId: t.id,
    });
  }

  return alerts.sort((a, b) => b.at.localeCompare(a.at));
}

export async function getRiskOverview(): Promise<RiskOverview> {
  const s = store();
  const rows = getLedgerRows();

  const dailyVolume24h = settleVolumeSince(rows, DAY_MS);
  const monthlyVolume30d = settleVolumeSince(rows, 30 * DAY_MS);
  const deployed = s.deployed;

  const distribution = { low: 0, medium: 0, high: 0 };
  for (const t of rows) {
    if (t.riskScore >= HIGH_RISK_SCORE) distribution.high += 1;
    else if (t.riskScore >= 40) distribution.medium += 1;
    else distribution.low += 1;
  }

  return {
    effective: s.draft ? s.draft.settings : deployed,
    deployed,
    deployedAt: s.deployedAt,
    draft: s.draft,
    alerts: deriveAlerts(deployed, rows),
    alertCount: rows.filter((t) => t.riskScore >= HIGH_RISK_SCORE).length,
    scanned: rows.length,
    usage: {
      dailyVolume24h,
      dailyPct: Math.round((dailyVolume24h / deployed.dailyVolumeLimit) * 100),
      monthlyVolume30d,
      monthlyPct: Math.round((monthlyVolume30d / deployed.monthlyVolumeLimit) * 100),
    },
    distribution,
  };
}

// --- mutations (draft lifecycle) ---------------------------------------------

export type DraftPatch =
  | Partial<Pick<RiskSettings, "dailyVolumeLimit" | "monthlyVolumeLimit" | "volumeLimitsEnabled">>
  | { ruleId: string; ruleEnabled: boolean };

/** Apply one patch to the draft (creating it from the effective settings if
 * none exists). The draft is the app's pending configuration — it changes
 * nothing live until deployed. */
export function patchDraft(patch: DraftPatch): RiskDraft {
  const s = store();
  const base = s.draft ? s.draft.settings : clone(s.deployed);
  const settings = clone(base);
  if ("ruleId" in patch) {
    const rule = settings.rules.find((r) => r.id === patch.ruleId);
    if (rule) rule.enabled = patch.ruleEnabled;
  } else {
    if (patch.dailyVolumeLimit !== undefined) settings.dailyVolumeLimit = patch.dailyVolumeLimit;
    if (patch.monthlyVolumeLimit !== undefined) settings.monthlyVolumeLimit = patch.monthlyVolumeLimit;
    if (patch.volumeLimitsEnabled !== undefined) settings.volumeLimitsEnabled = patch.volumeLimitsEnabled;
  }
  s.draft = { settings, savedAt: new Date().toISOString() };
  return s.draft;
}

export function deployRiskSettings(): { deployedAt: string; ruleCount: number } {
  const s = store();
  if (!s.draft) return { deployedAt: s.deployedAt, ruleCount: s.deployed.rules.length };
  s.deployed = clone(s.draft.settings);
  s.deployedAt = new Date().toISOString();
  s.draft = null;
  return { deployedAt: s.deployedAt, ruleCount: s.deployed.rules.length };
}

export function discardDraft(): boolean {
  const s = store();
  if (!s.draft) return false;
  s.draft = null;
  return true;
}
