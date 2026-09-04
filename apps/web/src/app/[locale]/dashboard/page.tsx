import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { AnalyticsChart } from "@/components/dashboard/analytics-chart";
import { BalanceStrip } from "@/components/dashboard/balance-strip";
import { ChartRangeTabs, type ChartRange } from "@/components/dashboard/chart-range-tabs";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { SetupProgress } from "@/components/dashboard/setup-progress";
import { Hero3DWrapper } from "@/components/three/hero-wrapper";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompactMoney, formatNumber, formatPercent } from "@/lib/format";
import { getAnalyticsSeries, getLedgerMetrics, listTransactions } from "@/server/data/transactions";

// Dashboard — screens/desktop/dashboard_home_desktop:228-349
// Every interactive element on this page resolves to a real destination or
// mutation: header actions -> dialog/export, metric tiles -> filtered
// ledger, quick actions -> real routes (customer create via ?new=1),
// checklist -> Server Action (bank step derived from the verified account),
// chart -> URL range, table rows -> /[locale]/transactions/[id].
// The home page also carries the balance position (ADR-0012) — derived from
// the same overview as /balance, so the two cannot disagree.

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const CHART_RANGE_DAYS: Record<ChartRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

function chartRangeOf(searchParams: Record<string, string | string[] | undefined>): ChartRange {
  const v = searchParams.range;
  return v === "30d" || v === "90d" ? v : "7d";
}

function MetricTile({
  label,
  value,
  delta,
  deltaTone,
  hint,
  href,
}: {
  label: string;
  value: string;
  delta: string;
  deltaTone: "positive" | "negative";
  hint: string;
  href: string;
}) {
  const tone =
    deltaTone === "positive"
      ? "text-[var(--success-status)] bg-[var(--success-status)]/10"
      : "text-[var(--failed-status)] bg-[var(--failed-status)]/10";
  return (
    <Link href={href} className="group focus-visible:outline-none">
      <Card className="h-full bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm flex flex-col justify-between transition-colors group-hover:border-[var(--primary)]/50 group-focus-visible:border-[var(--primary)]">
        <div>
          <p className="label-caps text-[var(--on-surface-variant)] mb-1">{label}</p>
          <h4 className="data-mono text-[28px] font-bold text-[var(--on-surface)] leading-none">{value}</h4>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded data-mono text-[11px] whitespace-nowrap ${tone}`}>
            <span className="material-symbols-outlined text-[14px] shrink-0" aria-hidden="true">
              {deltaTone === "positive" ? "trending_up" : "trending_down"}
            </span>
            {delta}
          </span>
          <span className="body-sm text-[12px] text-[var(--on-surface-variant)]">{hint}</span>
        </div>
      </Card>
    </Link>
  );
}

async function MetricsGroup() {
  const m = await getLedgerMetrics();
  return (
    <>
      <MetricTile
        label="Total Volume"
        value={formatCompactMoney(m.totalVolume, m.currency)}
        delta={formatPercent(m.volumeDelta)}
        deltaTone={m.volumeDelta >= 0 ? "positive" : "negative"}
        hint="vs last week"
        href="/transactions?range=7d"
      />
      <MetricTile
        label="Successful Payments"
        value={formatNumber(m.succeededCount)}
        delta={formatPercent(m.succeededDelta)}
        deltaTone={m.succeededDelta >= 0 ? "positive" : "negative"}
        hint="vs last week"
        href="/transactions?status=SUCCEEDED&range=7d"
      />
      <MetricTile
        label="Failure Rate"
        value={`${m.failedRate.toFixed(1)}%`}
        delta={formatPercent(m.failedRateDelta)}
        deltaTone={m.failedRateDelta <= 0 ? "positive" : "negative"}
        hint="vs last week"
        href="/transactions?status=FAILED&range=7d"
      />
    </>
  );
}

async function AnalyticsSection({ range }: { range: ChartRange }) {
  const [series, metrics] = await Promise.all([
    getAnalyticsSeries(CHART_RANGE_DAYS[range]),
    getLedgerMetrics(),
  ]);
  const hasData = series.some((p) => p.total > 0);
  return (
    <AnalyticsChart
      data={hasData ? series : []}
      currency={metrics.currency}
      rangeLabel={range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : "Last 90 days"}
    />
  );
}

async function RecentTransactions() {
  const { rows } = await listTransactions({ pageSize: 5, page: 1 });
  return (
    <TransactionsTable
      rows={rows}
      variant="compact"
      toolbar={
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] p-4">
          <div>
            <h3 className="headline-md text-[var(--on-surface)]">Recent Transactions</h3>
            <p className="body-sm text-[var(--on-surface-variant)]">Latest 5 payments across all channels.</p>
          </div>
          <Link href="/transactions">
            <Button variant="outline" className="border-[var(--border-subtle)] gap-1">
              View all
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                arrow_forward
              </span>
            </Button>
          </Link>
        </div>
      }
    />
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const range = chartRangeOf(sp);

  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6 pb-12">
      {/* Welcome Section — greeting derived from the merchant profile */}
      <DashboardHeader />

      {/* Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Suspense
          fallback={
            <Card className="lg:col-span-4 p-5 space-y-4">
              <Skeleton className="h-5 w-32 bg-[var(--surface-container-high)]" />
              <Skeleton className="h-1.5 w-full bg-[var(--surface-container-high)]" />
              <Skeleton className="h-40 w-full bg-[var(--surface-container-low)]" />
            </Card>
          }
        >
          <SetupProgress />
        </Suspense>

        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Suspense
            fallback={
              <>
                <Skeleton className="h-32 w-full bg-[var(--surface-container-low)] rounded-xl" />
                <Skeleton className="h-32 w-full bg-[var(--surface-container-low)] rounded-xl" />
                <Skeleton className="h-32 w-full bg-[var(--surface-container-low)] rounded-xl" />
              </>
            }
          >
            <MetricsGroup />
          </Suspense>

          {/* Quick Actions — every label matches an intent the target route can fulfil */}
          <div className="sm:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-4 mt-2">
            {[
              { label: "Invoices", icon: "receipt_long", href: "/billing" },
              { label: "Add Customer", icon: "person_add", href: "/customers?new=1" },
              { label: "Payouts", icon: "account_balance", href: "/payouts/bulk" },
              { label: "AI Journal", icon: "auto_awesome", href: "/ai-journal" },
            ].map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg p-4 flex flex-col items-center justify-center gap-2 hover:bg-[var(--surface-container-low)] hover:border-[var(--primary)]/50 group transition-colors min-w-0"
              >
                <span
                  className="material-symbols-outlined text-[18px] text-[var(--on-surface-variant)] group-hover:text-[var(--primary)] shrink-0"
                  aria-hidden="true"
                >
                  {a.icon}
                </span>
                <span className="body-sm font-medium text-[var(--on-surface)] text-center break-words">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Balance position — same derivation as /balance (ADR-0011/0012) */}
      <Suspense
        fallback={
          <Card className="bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm">
            <Skeleton className="h-4 w-40 bg-[var(--surface-container-high)]" />
            <Skeleton className="h-8 w-56 bg-[var(--surface-container-low)] mt-2" />
            <Skeleton className="h-4 w-full max-w-md bg-[var(--surface-container-low)] mt-6" />
          </Card>
        }
      >
        <BalanceStrip />
      </Suspense>

      <Hero3DWrapper />

      {/* Analytics — range in the URL; keyed Suspense so the skeleton
          reappears on every range round-trip */}
      <div className="flex items-center justify-between">
        <p className="sr-only">Transaction analytics range</p>
        <ChartRangeTabs range={range} />
      </div>
      <Suspense key={range} fallback={<AnalyticsChart data={[]} isLoading />}>
        <AnalyticsSection range={range} />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={5} columns={5} />}>
        <RecentTransactions />
      </Suspense>
    </main>
  );
}
