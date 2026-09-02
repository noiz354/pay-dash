"use client";

import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import { HIGH_RISK_SCORE } from "@/lib/risk-options";
import type { RiskAlert } from "@/server/data/risk";

// Active alerts (ADR-0023) — derived from the ledger, not invented: the
// count is every transaction scoring >= HIGH_RISK_SCORE, and the list is the
// newest five, each linking to the transaction the alert came from.
export function AlertsBento({
  alerts,
  alertCount,
  scanned,
}: {
  alerts: RiskAlert[];
  alertCount: number;
  scanned: number;
}) {
  const top = alerts.slice(0, 5);
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-label="Active alerts">
      <Card className="flex flex-col justify-between border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="label-caps text-[var(--on-surface-variant)]">High-risk alerts</span>
          <span className="material-symbols-outlined text-[20px] text-[var(--failed-status)]" aria-hidden="true">
            warning
          </span>
        </div>
        <div>
          <div className="headline-xl text-[var(--on-surface)]">{alertCount}</div>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
            score {">="} {HIGH_RISK_SCORE} · {scanned} transactions scanned
          </p>
        </div>
      </Card>

      <Card className="border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] shadow-sm md:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <CardTitle className="label-caps text-[var(--on-surface-variant)]">Critical Triggers</CardTitle>
          <span className="body-sm text-xs text-[var(--on-surface-variant)]">
            {alertCount > top.length ? `${top.length} of ${alertCount}` : "all"}
          </span>
        </CardHeader>
        <CardContent className="p-4">
          {top.length === 0 ? (
            <p className="body-sm text-[var(--on-surface-variant)]">
              No transactions above the risk threshold.
            </p>
          ) : (
            <div className="space-y-2">
              {top.map((alert) => {
                const inner = (
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          alert.severity === "critical"
                            ? "bg-[var(--failed-status)]"
                            : "bg-[var(--pending-status)]"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="body-sm min-w-0 truncate font-medium text-[var(--on-surface)]">
                        {alert.title}
                      </span>
                      <span className="body-sm hidden min-w-0 truncate text-[var(--on-surface-variant)] sm:inline">
                        {alert.detail}
                      </span>
                    </span>
                    <span className="data-mono shrink-0 text-[var(--on-surface-variant)]">
                      {formatRelative(alert.at)}
                    </span>
                  </span>
                );
                return alert.transactionId ? (
                  <Link
                    key={alert.id}
                    href={`/transactions/${alert.transactionId}`}
                    className="block rounded py-1 hover:bg-[var(--surface-container-low)]"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={alert.id} className="py-1">
                    {inner}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
