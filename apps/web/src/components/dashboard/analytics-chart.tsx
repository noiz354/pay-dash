"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

export type AnalyticsPoint = {
  date: string;
  total: number;
  succeeded?: number;
  failed?: number;
};

// Mock data — last 7 days, IDR scale matching DataTable below
const defaultData: AnalyticsPoint[] = [
  { date: "Oct 18", total: 18500000, succeeded: 15200000, failed: 800000 },
  { date: "Oct 19", total: 22400000, succeeded: 20100000, failed: 600000 },
  { date: "Oct 20", total: 19800000, succeeded: 17500000, failed: 1200000 },
  { date: "Oct 21", total: 26700000, succeeded: 24500000, failed: 400000 },
  { date: "Oct 22", total: 31200000, succeeded: 29800000, failed: 900000 },
  { date: "Oct 23", total: 27800000, succeeded: 26000000, failed: 700000 },
  { date: "Oct 24", total: 34500000, succeeded: 32200000, failed: 1100000 },
];

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
} satisfies Record<string, { label: string; color: string }>;

function formatIDR(value: number) {
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

export function AnalyticsChart({
  data = defaultData,
  isLoading = false,
}: {
  data?: AnalyticsPoint[];
  isLoading?: boolean;
}) {
  const isEmpty = !isLoading && (!data || data.length === 0);

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
          <p className="body-sm text-[var(--on-surface-variant)]">Volume over time (IDR)</p>
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
        <div className="flex justify-between items-start gap-4">
          <div>
            <CardTitle className="headline-md text-[var(--on-surface)]">Transaction Analytics</CardTitle>
            <p className="body-sm text-[var(--on-surface-variant)] mt-1">Daily volume — last 7 days (IDR)</p>
          </div>
          <span className="label-caps text-[var(--on-surface-variant)] bg-[var(--surface-container-low)] px-2 py-1 rounded whitespace-nowrap">
            Last 7 days
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <ChartContainer config={chartConfig} className="h-[280px] w-full" aria-label="Transaction volume over time">
          <AreaChart data={data} margin={{ left: 12, right: 12, top: 12, bottom: 0 }} accessibilityLayer>
            <defs>
              <linearGradient id="fill-primary" x1="0" y1="0" x2="0" y2="1">
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
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={72}
              tick={{ fill: "var(--on-surface-variant)", fontSize: 11, fontFamily: "var(--font-jetbrains)" }}
              tickFormatter={(v: number) => formatIDR(v)}
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
                      <span className="text-[var(--on-surface-variant)]">{chartConfig[name as keyof typeof chartConfig]?.label ?? name}</span>
                      <span className="data-mono font-medium tabular-nums text-[var(--on-surface)]">{formatIDRFull(value as number)}</span>
                    </div>
                  )}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#fill-primary)"
              dot={false}
              activeDot={{ r: 4, stroke: "var(--primary)", strokeWidth: 2, fill: "var(--surface)" }}
            />
          </AreaChart>
        </ChartContainer>
        <div className="mt-2 flex items-center justify-between body-sm text-[var(--on-surface-variant)]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--primary)]" aria-hidden="true" /> Total volume
          </span>
          <span className="data-mono text-xs tabular-nums">{formatIDRFull(data[data.length - 1]?.total ?? 0)} today</span>
        </div>
      </CardContent>
    </Card>
  );
}
