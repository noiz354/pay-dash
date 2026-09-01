import { Suspense } from "react";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { SectionBoundary } from "@/components/common/section-boundary";
import { ExportCsvButton } from "@/components/transactions/export-csv-button";
import { PayoutsSummaryCards } from "@/components/payouts/payouts-summary-cards";
import { BatchFilters } from "@/components/payouts/batch-filters";
import { BatchesTable } from "@/components/payouts/batches-table";
import { CreateBatchDialog } from "@/components/payouts/create-batch-dialog";
import { getPayoutsOverview, listBatches } from "@/server/data/payouts";
import type { PayoutStatus } from "@/lib/payout-status";

// Payouts index — the route that used to 404 while two children hung off the
// sidebar. Batch history lives here (ADR-0010); filters are URL state so a
// "what failed last month?" view is shareable.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payouts — Kinetic Ledger",
  description: "Batch disbursements, payout history and settlement status.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

async function SummaryRow() {
  const overview = await getPayoutsOverview();
  return <PayoutsSummaryCards overview={overview} />;
}

async function BatchHistory({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const data = await listBatches({
    q: one(sp.q) ?? "",
    status: (one(sp.status) as PayoutStatus | "ALL") ?? "ALL",
    range: (one(sp.range) as "30d" | "90d" | "12m" | "all") ?? "all",
    sort: (one(sp.sort) as "recent" | "amount" | "recipients") ?? "recent",
    page: Number(one(sp.page) ?? 1) || 1,
    pageSize: 10,
  });

  return (
    <>
      <BatchFilters resultCount={data.total} />
      <BatchesTable data={data} />
    </>
  );
}

export default async function PayoutsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto w-full max-w-container-max space-y-6 p-gutter">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <nav aria-label="Breadcrumb" className="body-sm mb-1 flex items-center gap-2 text-[var(--on-surface-variant)]">
            <Link href="/balance" className="transition-colors hover:text-[var(--primary)]">
              Balance
            </Link>
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              chevron_right
            </span>
            <span className="font-medium text-[var(--on-surface)]" aria-current="page">
              Payouts
            </span>
          </nav>
          <h1 className="headline-xl text-[var(--on-surface)]">Payouts</h1>
          <p className="body-md mt-2 max-w-2xl text-[var(--on-surface-variant)]">
            Every disbursement batch, its recipients and where the money got stuck.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/payouts/settings"
            className="label-md rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
          >
            Payout settings
          </Link>
          <ExportCsvButton label="Export Log" endpoint="/api/exports/payouts" filePrefix="payout-batches" />
          <CreateBatchDialog />
        </div>
      </div>

      <SectionBoundary title="Payout summary unavailable">
        <Suspense
          fallback={
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl bg-[var(--surface-container-low)]" />
              ))}
            </div>
          }
        >
          <SummaryRow />
        </Suspense>
      </SectionBoundary>

      <section className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)]">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="headline-md text-[var(--on-surface)]">Batch history</h2>
          <Link href="/payouts/bulk" className="body-sm text-[var(--primary)] hover:underline">
            Open the bulk upload workspace
          </Link>
        </div>
        <SectionBoundary title="Batch history unavailable">
          <Suspense fallback={<TableSkeleton rows={8} columns={6} />}>
            <BatchHistory searchParams={searchParams} />
          </Suspense>
        </SectionBoundary>
      </section>
    </main>
  );
}
