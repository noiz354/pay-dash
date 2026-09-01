import { Suspense } from "react";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { CreateTransactionDialog } from "@/components/transactions/create-transaction-dialog";
import { ExportCsvButton } from "@/components/transactions/export-csv-button";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { TablePagination } from "@/components/transactions/table-pagination";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { formatCompactMoney, formatNumber, formatPercent } from "@/lib/format";
import {
  getLedgerMetrics,
  listTransactions,
  type Channel,
  type TransactionStatus,
} from "@/server/data/transactions";

// Transaction Ledger — screens/desktop/transaction_ledger_desktop
// Filters, search and pagination are URL state so the view is shareable and
// server-rendered; the table streams behind a skeleton.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Transaction Ledger — Kinetic Ledger",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

async function MetricsRow() {
  const m = await getLedgerMetrics();
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="bg-[var(--surface)] border-[var(--border-subtle)] p-4">
        <span className="label-caps text-[var(--on-surface-variant)]">Total Volume (7d)</span>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="headline-lg data-mono text-[var(--on-surface)]">
            {formatCompactMoney(m.totalVolume, m.currency)}
          </span>
          <span
            className={`data-mono text-xs ${m.volumeDelta >= 0 ? "text-[var(--success-status)]" : "text-[var(--failed-status)]"}`}
          >
            {formatPercent(m.volumeDelta)}
          </span>
        </div>
      </Card>
      <Card className="bg-[var(--surface)] border-[var(--border-subtle)] p-4">
        <span className="label-caps text-[var(--on-surface-variant)]">Successful (7d)</span>
        <div className="mt-2">
          <span className="headline-lg data-mono text-[var(--success-status)]">{formatNumber(m.succeededCount)}</span>
        </div>
      </Card>
      <Card className="bg-[var(--surface)] border-[var(--border-subtle)] p-4">
        <span className="label-caps text-[var(--on-surface-variant)]">Failed / Processing (7d)</span>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="headline-lg data-mono text-[var(--failed-status)]">{m.failedCount}</span>
          <span className="body-md text-[var(--on-surface-variant)]">/</span>
          <span className="headline-lg data-mono text-[var(--pending-status)]">{m.processingCount}</span>
        </div>
      </Card>
    </div>
  );
}

async function LedgerTable({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const page = Number(one(sp.page) ?? 1) || 1;
  const result = await listTransactions({
    status: (one(sp.status) as TransactionStatus | "ALL") ?? "ALL",
    channel: (one(sp.channel) as Channel | "ALL") ?? "ALL",
    range: (one(sp.range) as "7d" | "30d" | "90d" | "all") ?? "all",
    q: one(sp.q) ?? "",
    page,
    pageSize: 10,
  });

  return (
    <TransactionsTable
      rows={result.rows}
      isFiltered={result.isFiltered}
      toolbar={<TransactionFilters resultCount={result.total} />}
      footer={
        result.total > 0 ? (
          <TablePagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            pageSize={result.pageSize}
          />
        ) : null
      }
    />
  );
}

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  // Awaited inside the streaming child; a stable key makes Suspense re-fire on
  // filter changes so the skeleton shows during server round-trips.
  const sp = await searchParams;
  const key = new URLSearchParams(
    Object.entries(sp).map(([k, v]) => [k, String(one(v) ?? "")])
  ).toString();

  return (
    <main className="mx-auto w-full max-w-container-max p-gutter space-y-6 bg-[var(--surface-canvas)]">
      <div className="flex flex-col gap-6 pt-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h1 className="headline-xl text-[var(--on-surface)]">Transaction Ledger</h1>
            <p className="body-md text-[var(--on-surface-variant)] mt-1">
              Review and manage recent processing activity.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <ExportCsvButton />
            <CreateTransactionDialog triggerLabel="Create Payment" />
          </div>
        </div>

        <Suspense
          fallback={
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
              <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
              <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
            </div>
          }
        >
          <MetricsRow />
        </Suspense>
      </div>

      <Suspense key={key} fallback={<TableSkeleton rows={10} columns={7} />}>
        <LedgerTable searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
