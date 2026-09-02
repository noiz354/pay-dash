"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import { HIGH_RISK_SCORE } from "@/lib/risk-options";
import type { RiskOverview } from "@/server/data/risk";

// The prototype's right column was an empty <div class="lg:col-span-4">.
// ADR-0023 fills it with what the ledger actually says: the distribution of
// risk scores across all transactions, and when the current ruleset was
// deployed.
export function RiskProfilePanel({ overview }: { overview: RiskOverview }) {
  const { distribution, scanned, deployedAt } = overview;
  const bands = [
    { label: `0 – ${HIGH_RISK_SCORE - 21}`, count: distribution.low, tone: "var(--success-status)" },
    { label: `${HIGH_RISK_SCORE - 20} – ${HIGH_RISK_SCORE - 1}`, count: distribution.medium, tone: "var(--pending-status)" },
    { label: `≥ ${HIGH_RISK_SCORE}`, count: distribution.high, tone: "var(--failed-status)" },
  ];
  const max = Math.max(1, ...bands.map((b) => b.count));

  return (
    <Card className="border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] shadow-sm">
      <CardHeader className="px-4 py-3">
        <CardTitle className="label-caps text-[var(--on-surface-variant)]">
          Ledger Risk Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-4">
        <div className="space-y-3">
          {bands.map((band) => (
            <div key={band.label}>
              <div className="mb-1 flex items-center justify-between">
                <span className="body-sm text-[var(--on-surface-variant)]">{band.label}</span>
                <span className="data-mono text-[var(--on-surface)]">{band.count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-container)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round((band.count / max) * 100)}%`,
                    backgroundColor: `var(${band.tone})`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--border-subtle)] pt-3">
          <p className="body-sm text-xs text-[var(--on-surface-variant)]">
            {scanned} transactions scanned · ruleset deployed {formatRelative(deployedAt)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
