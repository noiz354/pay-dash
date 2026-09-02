import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { AlertsBento } from "@/components/risk/alerts-bento";
import { RiskHeaderActions } from "@/components/risk/risk-header-actions";
import { RiskProfilePanel } from "@/components/risk/risk-profile-panel";
import { RulesTable } from "@/components/risk/rules-table";
import { VolumeLimitsCard } from "@/components/risk/volume-limits-card";
import { getRiskOverview } from "@/server/data/risk";

// Risk & Velocity Limits (ADR-0023). INTEGRATION.md:117/:320: no Xendit
// source — "Velocity/risk thresholds are Dashboard-only" — so the ruleset,
// the volume limits and the draft/deploy workflow are app-owned. What the
// prototype invented is replaced by derivation: the "14 alerts / 12% vs
// yesterday" card becomes the count of ledger transactions scoring >= 60;
// the ghost "Card ending 4492" / "Merchant A" triggers become real
// transactions, each linking to /transactions/[id]; the USD caps become IDR
// caps with derived usage; the empty right column becomes the ledger's
// risk-score distribution.
export const metadata: Metadata = {
  title: "Risk & Velocity Limits — Kinetic Ledger",
  description:
    "Dashboard-owned velocity rules, volume limits and the derived high-risk alert queue.",
};

export default async function RiskPage() {
  const overview = await getRiskOverview();
  const hasDraft = overview.draft !== null;

  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Risk &amp; Velocity Limits</h1>
          <p className="body-md text-[var(--on-surface-variant)] mt-1">
            Configure transaction thresholds and monitor real-time velocity triggers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 label-caps border ${
              hasDraft
                ? "border-[var(--pending-status)]/20 bg-[var(--pending-status)]/10 text-[var(--pending-status)]"
                : "border-[var(--success-status)]/20 bg-[var(--success-status)]/10 text-[var(--success-status)]"
            }`}
            aria-label={hasDraft ? "Draft pending" : "Active ruleset"}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                hasDraft ? "bg-[var(--pending-status)]" : "bg-[var(--success-status)]"
              }`}
              aria-hidden="true"
            />
            {hasDraft ? "Draft pending" : "Active Ruleset"}
          </Badge>
          <RiskHeaderActions hasDraft={hasDraft} />
        </div>
      </div>

      <AlertsBento alerts={overview.alerts} alertCount={overview.alertCount} scanned={overview.scanned} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <VolumeLimitsCard overview={overview} />
          <RulesTable rules={overview.effective.rules} />
        </div>
        <div className="space-y-6 lg:col-span-4">
          <RiskProfilePanel overview={overview} />
        </div>
      </div>
    </main>
  );
}
