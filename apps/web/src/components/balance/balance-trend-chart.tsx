"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { TrendPoint } from "@/server/data/balance";

const chartConfig = {
  ending: {
    label: "Balance",
    color: "var(--primary)",
  },
} satisfies Record<string, { label: string; color: string }>;

function formatIDRCompact(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
    notation: "compact",
  }).format(value);
}

function formatIDRFull(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * 30-day ending balance — replaces the decorative blur circle in the
 * prototype. Points come from `getBalanceTrend()`, which applies the same
 * rules as the available figure, so the last point equals the big number.
 */
export function BalanceTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-40 w-full" aria-label="Available balance — last 30 days">
      <AreaChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }} accessibilityLayer>
        <defs>
          <linearGradient id="balance-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--on-surface-variant)", fontSize: 10 }}
          tickMargin={8}
          minTickGap={32}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          domain={["dataMin", "auto"]}
          tick={{ fill: "var(--on-surface-variant)", fontSize: 10, fontFamily: "var(--font-jetbrains)" }}
          tickFormatter={(v: number) => formatIDRCompact(v)}
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
                    {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
                  </span>
                  <span className="data-mono font-medium tabular-nums text-[var(--on-surface)]">
                    {formatIDRFull(value as number)}
                  </span>
                </div>
              )}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="ending"
          stroke="var(--primary)"
          strokeWidth={2}
          fill="url(#balance-trend-fill)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
