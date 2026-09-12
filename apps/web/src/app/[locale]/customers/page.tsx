import { Suspense } from "react";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { ExportCsvButton } from "@/components/transactions/export-csv-button";
import { CreateCustomerDialog } from "@/components/customers/create-customer-dialog";
import { CanonicalCustomersTable } from "@/components/customers/canonical-customers-table";
import { formatCompactMoney, formatNumber } from "@/lib/format";
import { getCustomerMetrics, listCustomers } from "@/server/data/customers";
import type { CustomerStatus } from "@/lib/customer-status";

// Customer Directory — SCR-009
// Migrated to CanonicalDataTable (FE-012)
// URL state: q, status, sort, page, pageSize
// Search by email cross-links from transaction detail

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Customers — Kinetic Ledger",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

async function DirectoryMetrics() {
  const m = await getCustomerMetrics();
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <span className="label-caps text-[var(--on-surface-variant)]">Total customers</span>
        <div className="mt-2 headline-lg data-mono text-[var(--on-surface)]">{formatNumber(m.total)}</div>
      </Card>
      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <span className="label-caps text-[var(--on-surface-variant)]">Active</span>
        <div className="mt-2 headline-lg data-mono text-[var(--success-status)]">{formatNumber(m.active)}</div>
      </Card>
      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <span className="label-caps text-[var(--on-surface-variant)]">Needs review</span>
        <div className="mt-2 headline-lg data-mono text-[var(--pending-status)]">{formatNumber(m.review)}</div>
      </Card>
      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <span className="label-caps text-[var(--on-surface-variant)]">Lifetime value</span>
        <div className="mt-2 headline-lg data-mono text-[var(--on-surface)]">
          {formatCompactMoney(m.totalLifetimeValue, m.currency)}
        </div>
      </Card>
    </div>
  );
}

async function Directory({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const result = await listCustomers({
    q: one(sp.q) ?? "",
    status: (one(sp.status) as CustomerStatus | "ALL") ?? "ALL",
    sort: (one(sp.sort) as "recent" | "name" | "ltv" | "added") ?? "recent",
    direction: (one(sp.direction) as "asc" | "desc") ?? "desc",
    page: Number(one(sp.page) ?? 1) || 1,
    pageSize: Number(one(sp.pageSize) ?? 10) || 10,
  });

  return (
    <CanonicalCustomersTable
      data={result.rows}
      total={result.total}
      page={result.page}
      pageCount={result.pageCount}
      pageSize={result.pageSize}
      isFiltered={result.isFiltered}
      lastUpdated={result.fetchedAt}
    />
  );
}

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  // A stable key makes Suspense re-fire on filter changes
  const sp = await searchParams;
  const key = new URLSearchParams(
    Object.entries(sp).map(([k, v]) => [k, String(one(v) ?? "")])
  ).toString();

  return (
    <main className="mx-auto w-full max-w-[var(--container-max)] space-y-6 p-[var(--gutter)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="headline-lg text-[var(--on-surface)]">Customers</h1>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
            Manage and view all customer records and payment history.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportCsvButton
            label="Export"
            endpoint="/api/exports/customers"
            filePrefix="customers"
            className="h-9 bg-[var(--surface-container-lowest)] font-medium text-[var(--on-surface)]"
          />
          <CreateCustomerDialog />
        </div>
      </div>

      <Suspense
        fallback={
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
            <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
            <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
            <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
          </div>
        }
      >
        <DirectoryMetrics />
      </Suspense>

      <Suspense key={key} fallback={<TableSkeleton rows={10} columns={7} />}>
        <Directory searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
