"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompactMoney, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type AnalyticsPoint = {
  date: string;
  total: number;
  succeeded?: number;
  failed?: number;
};

type SeriesKey = "total" | "succeeded" | "failed";

const chartConfig = {
  total: {
    label: "Volume",
    color: "var(--primary)",
  },
  succeeded: {
    label: "Succeeded",
    color: "var(--success-status)",
  },
  failed: {
    label: "Failed",
    color: "var(--failed-status)",
  },
} satisfies Record<SeriesKey, { label: string; color: string }>;

const SERIES_KEYS = Object.keys(chartConfig) as SeriesKey[];

/**
 * Volume-over-time for the dashboard home. `data` is always the real series
 * (or an explicit empty list) — the prototype's static "Oct 18–24" mock is
 * gone, so there is no way to render invented figures. The range label comes
 * from the server (ADR-0012); series chips are local view state.
 */
export function AnalyticsChart({
  data,
  currency = "IDR",
  rangeLabel = "Last 7 days",
  isLoading = false,
}: {
  data: AnalyticsPoint[];
  currency?: string;
  rangeLabel?: string;
  isLoading?: boolean;
}) {
  const [active, setActive] = React.useState<Record<SeriesKey, boolean>>({
    total: true,
    succeeded: true,
    failed: true,
  });

  const isEmpty = !isLoading && data.length === 0;
  const visible = SERIES_KEYS.filter((k) => active[k]);

  const toggle = (key: SeriesKey) => {
    setActive((prev) => {
      // Keep at least one series visible — an empty chart with tooltips is
      // worse than a disabled toggle.
      if (prev[key] && Object.values(prev).filter(Boolean).length === 1) return prev;
      return { ...prev, [key]: !prev[key] };
    });
  };

  if (isLoading) {
    return (
      <Card className="bg-[var(--surface)] border-[var(--border-subtle)] rounded-lg shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <Skeleton className="h-5 w-40 bg-[var(--surface-container-low)]" />
            <Skeleton className="h-4 w-20 bg-[var(--surface-container-low)]" />
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px] w-full bg-[var(--surface-container-low)] rounded-lg animate-pulse" aria-label="Loading chart" />
        </CardContent>
      </Card>
    );
  }

  if (isEmpty) {
    return (
      <Card className="bg-[var(--surface)] border-[var(--border-subtle)] rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle className="headline-md text-[var(--on-surface)]">Transaction Analytics</CardTitle>
          <p className="body-sm text-[var(--on-surface-variant)]">Volume over time ({currency})</p>
        </CardHeader>
        <CardContent>
          <div
            className="h-[260px] w-full flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-container-low)]/30"
            role="img"
            aria-label="No transaction data available"
          >
            <span className="material-symbols-outlined text-[32px] text-[var(--on-surface-variant)] mb-2" aria-hidden="true">
              bar_chart
            </span>
            <p className="body-sm text-[var(--on-surface-variant)]">No transactions yet</p>
            <p className="body-sm text-[var(--outline)] text-xs mt-1">Data will appear once transactions are recorded</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[var(--surface)] border-[var(--border-subtle)] rounded-lg shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <CardTitle className="headline-md text-[var(--on-surface)]">Transaction Analytics</CardTitle>
            <p className="body-sm text-[var(--on-surface-variant)] mt-1">
              Daily volume — {rangeLabel.toLowerCase()} ({currency})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1" role="group" aria-label="Chart series">
              {SERIES_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  aria-pressed={active[key]}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded border text-[12px] body-sm transition-colors",
                    active[key]
                      ? "border-[var(--primary)]/40 bg-[var(--primary-container)]/10 text-[var(--on-surface)]"
                      : "border-[var(--border-subtle)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]"
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: active[key] ? chartConfig[key].color : "var(--outline)" }}
                    aria-hidden="true"
                  />
                  {chartConfig[key].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <ChartContainer config={chartConfig} className="h-[280px] w-full" aria-label="Transaction volume over time">
          <AreaChart data={data} margin={{ left: 12, right: 12, top: 12, bottom: 0 }} accessibilityLayer>
            <defs>
              <linearGradient id="fill-total" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={{ stroke: "var(--border-subtle)" }}
              tick={{ fill: "var(--on-surface-variant)", fontSize: 11, fontFamily: "var(--font-inter)" }}
              tickMargin={8}
              minTickGap={28}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={72}
              tick={{ fill: "var(--on-surface-variant)", fontSize: 11, fontFamily: "var(--font-jetbrains)" }}
              tickFormatter={(v: number) => formatCompactMoney(v, currency)}
              tickCount={4}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--border-subtle)", strokeDasharray: "3 3" }}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  className="bg-[var(--surface-container-lowest)] border-[var(--border-subtle)] shadow-xl"
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                  formatter={(value, name) => (
                    <div className="flex w-full justify-between gap-4">
                      <span className="text-[var(--on-surface-variant)]">
                        {chartConfig[name as SeriesKey]?.label ?? name}
                      </span>
                      <span className="data-mono font-medium tabular-nums text-[var(--on-surface)]">
                        {formatMoney(value as number, currency)}
                      </span>
                    </div>
                  )}
                />
              }
            />
            {visible.map((key) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={chartConfig[key].color}
                strokeWidth={key === "total" ? 2 : 1.5}
                fill={key === "total" ? "url(#fill-total)" : "none"}
                dot={false}
                activeDot={{ r: 4, stroke: chartConfig[key].color, strokeWidth: 2, fill: "var(--surface)" }}
              />
            ))}
          </AreaChart>
        </ChartContainer>
        <div className="mt-2 flex items-center justify-between body-sm text-[var(--on-surface-variant)]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--primary)]" aria-hidden="true" /> {visible.length} of{" "}
            {SERIES_KEYS.length} series shown
          </span>
          <span className="data-mono text-xs tabular-nums">
            {formatMoney(data[data.length - 1]?.total ?? 0, currency)} today
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
