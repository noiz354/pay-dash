import { Suspense } from "react";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { SectionBoundary } from "@/components/common/section-boundary";
import { ExportCsvButton } from "@/components/transactions/export-csv-button";
import { TopUpDialog } from "@/components/balance/top-up-dialog";
import { WithdrawDialog } from "@/components/balance/withdraw-dialog";
import { AutoWithdrawalCard } from "@/components/balance/auto-withdrawal-card";
import { BalanceTrendChart } from "@/components/balance/balance-trend-chart";
import { MovementsFilters } from "@/components/balance/movements-filters";
import { MovementsTable } from "@/components/balance/movements-table";
import { getBalanceOverview, getBalanceTrend, listMovements } from "@/server/data/balance";
import { getDestinationAccount, getPayoutSettings, listBankAccounts } from "@/server/data/payouts";
import { nextRunForCadence } from "@/lib/payout-status";
import { formatMoney, formatRelative } from "@/lib/format";
import type { MovementStatus, MovementType } from "@/lib/balance-status";

// Balance & History (ADR-0011) — every figure on this page is derived from
// the ledger + payout stores: one available number, one trend, one history.
// The two contradictory prototype balances and the invented
// "Daily → BCA ****4910" are gone.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Balance & History — Kinetic Ledger",
  description: "Available balance, 30-day trend and the full ledger of movements.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

async function BalanceCards() {
  const [overview, trend, settings, destination, accounts] = await Promise.all([
    getBalanceOverview(),
    getBalanceTrend(30),
    getPayoutSettings(),
    getDestinationAccount(),
    listBankAccounts(),
  ]);
  const nextRunAt = settings.automated
    ? nextRunForCadence(settings.cadence, settings.weekday, settings.monthDay)
    : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2 bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl p-6 shadow-sm flex flex-col relative overflow-hidden">
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end">
          <div className="shrink-0">
            <h3 className="label-caps text-[var(--on-surface-variant)] mb-2">Available Balance (IDR)</h3>
            <div className="data-mono text-3xl md:text-4xl leading-tight font-bold tracking-tight text-[var(--on-surface)] whitespace-nowrap" data-testid="balance-available">
              {formatMoney(overview.available, overview.currency)}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4">
              <div>
                <p className="label-caps text-[var(--outline)] mb-0.5">Pending Clearance</p>
                <p className="data-mono body-md text-[var(--on-surface-variant)]">
                  {formatMoney(overview.pendingSettlements, overview.currency)}
                </p>
              </div>
              <div className="w-px h-7 bg-[var(--border-subtle)] hidden sm:block" />
              <div>
                <p className="label-caps text-[var(--outline)] mb-0.5">Reserved for Payouts</p>
                <p className="data-mono body-md text-[var(--on-surface-variant)]">
                  {formatMoney(overview.reserved, overview.currency)}
                </p>
              </div>
              <div className="w-px h-7 bg-[var(--border-subtle)] hidden sm:block" />
              <div>
                <p className="label-caps text-[var(--outline)] mb-0.5">Last Payout</p>
                <p className="data-mono body-md text-[var(--on-surface-variant)]">
                  {overview.lastPayoutAt ? formatRelative(overview.lastPayoutAt) : "—"}
                </p>
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1 md:pl-6 md:border-l md:border-[var(--border-subtle)]" data-testid="balance-trend">
            <p className="label-caps text-[var(--outline)] mb-2">Last 30 days</p>
            <BalanceTrendChart data={trend} />
          </div>
        </div>
        <div className="relative z-10 flex gap-3 mt-8">
          <TopUpDialog triggerClassName="flex-1 justify-center" />
          <WithdrawDialog
            accounts={accounts}
            available={overview.available}
            currency={overview.currency}
            triggerClassName="flex-1 justify-center"
          />
        </div>
      </Card>

      <AutoWithdrawalCard settings={settings} destination={destination} nextRunAt={nextRunAt} />
    </div>
  );
}

async function Movements({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const data = await listMovements({
    type: (one(sp.type) as MovementType | "all") ?? "all",
    status: (one(sp.status) as MovementStatus | "all") ?? "all",
    range: (one(sp.range) as "7d" | "30d" | "90d" | "all") ?? "all",
    q: one(sp.q) ?? "",
    sort: (one(sp.sort) as "recent" | "amount") ?? "recent",
    page: Number(one(sp.page) ?? 1) || 1,
    pageSize: 10,
  });

  return (
    <>
      <MovementsFilters resultCount={data.total} />
      <MovementsTable data={data} />
    </>
  );
}

export default async function BalancePage({ searchParams }: { searchParams: SearchParams }) {
  // Awaited inside the streaming child; a stable key makes Suspense re-fire on
  // filter changes so the skeleton shows during server round-trips.
  const sp = await searchParams;
  const key = new URLSearchParams(
    Object.entries(sp).map(([k, v]) => [k, String(one(v) ?? "")])
  ).toString();

  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Balance &amp; History</h1>
          <p className="body-md text-[var(--on-surface-variant)] mt-1">
            Manage your funds and trace every movement back to the record that caused it.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/payouts"
            className="label-md rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
          >
            Payout history
          </Link>
          <ExportCsvButton label="Export CSV" endpoint="/api/exports/balance" filePrefix="balance-movements" />
        </div>
      </div>

      <SectionBoundary title="Balance unavailable">
        <Suspense
          fallback={
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2 h-64 animate-pulse bg-[var(--surface-container-low)]" />
              <Card className="h-64 animate-pulse bg-[var(--surface-container-low)]" />
            </div>
          }
        >
          <BalanceCards />
        </Suspense>
      </SectionBoundary>

      <section className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] shadow-sm">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--surface-canvas)]">
          <h2 className="headline-md text-[var(--on-surface)]">Recent Movements</h2>
          <Link href="/transactions" className="body-sm text-[var(--primary)] hover:underline">
            View the full ledger
          </Link>
        </div>
        <SectionBoundary title="Movements unavailable">
          <Suspense key={key} fallback={<TableSkeleton rows={10} columns={4} />}>
            <Movements searchParams={searchParams} />
          </Suspense>
        </SectionBoundary>
      </section>
    </main>
  );
}
