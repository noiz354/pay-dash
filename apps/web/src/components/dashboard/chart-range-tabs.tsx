"use client";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export const CHART_RANGES = ["7d", "30d", "90d"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

const RANGE_LABELS: Record<ChartRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

/**
 * Range selector for the dashboard analytics chart. The range lives in the
 * URL (`?range=30d`) so the view is shareable and reload-safe — the same
 * contract as every other table on the app. The server re-fetches the
 * series behind a keyed Suspense, so switching shows the skeleton, not
 * stale data (ADR-0012).
 */
export function ChartRangeTabs({ range }: { range: ChartRange }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-1" role="tablist" aria-label="Chart range">
      {CHART_RANGES.map((r) => (
        <Link
          key={r}
          href={`/dashboard?range=${r}`}
          aria-current={range === r ? "page" : undefined}
          className={cn(
            "px-3 py-1.5 rounded-md body-sm font-medium transition-colors",
            range === r
              ? "bg-[var(--primary-container)]/20 text-[var(--primary)]"
              : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]"
          )}
        >
          {RANGE_LABELS[r]}
        </Link>
      ))}
    </div>
  );
}
