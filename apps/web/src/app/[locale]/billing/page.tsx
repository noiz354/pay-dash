import { Suspense } from "react";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { SectionBoundary } from "@/components/common/section-boundary";
import { ExportCsvButton } from "@/components/transactions/export-csv-button";
import { TablePagination } from "@/components/transactions/table-pagination";
import { BillingSummaryCards, OverdueBanner } from "@/components/billing/billing-summary-cards";
import { InvoiceFilters } from "@/components/billing/invoice-filters";
import { InvoicesTable } from "@/components/billing/invoices-table";
import { getBillingSummary, listInvoices } from "@/server/data/invoices";
import type { InvoiceStatus } from "@/lib/invoice-status";

// Billing & Invoices — screens/desktop/billing_invoices.
// Invoices are derived from ledger fees (see ADR-0008); every filter lives in
// the URL, and the outstanding balance is actionable instead of decorative.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Billing & Invoices — Kinetic Ledger",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

async function SummaryRow() {
  const summary = await getBillingSummary();
  const { rows } = await listInvoices({ status: "ALL", sort: "due", pageSize: 100 });
  const payable = rows.filter((i) => i.status === "OVERDUE" || i.status === "PENDING");
  const overdue = rows.find((i) => i.status === "OVERDUE") ?? null;

  return (
    <div className="space-y-4">
      {overdue ? <OverdueBanner invoice={overdue} /> : null}
      <BillingSummaryCards summary={summary} nextPayable={payable[0] ?? null} />
    </div>
  );
}

async function InvoiceHistory({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const result = await listInvoices({
    q: one(sp.q) ?? "",
    status: (one(sp.status) as InvoiceStatus | "ALL") ?? "ALL",
    range: (one(sp.range) as "3m" | "6m" | "12m" | "all") ?? "all",
    sort: (one(sp.sort) as "recent" | "amount" | "due") ?? "recent",
    page: Number(one(sp.page) ?? 1) || 1,
    pageSize: 10,
  });

  return (
    <InvoicesTable
      rows={result.rows}
      isFiltered={result.isFiltered}
      toolbar={<InvoiceFilters resultCount={result.total} />}
      emptyAction={
        <Link href="/transactions">
          <Button variant="outline" className="border-[var(--border-subtle)]">
            View transactions
          </Button>
        </Link>
      }
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

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const key = new URLSearchParams(Object.entries(sp).map(([k, v]) => [k, String(one(v) ?? "")])).toString();

  return (
    <main className="mx-auto max-w-container-max space-y-6 p-gutter">
      {/* Breadcrumbs — billing_invoices:201-205 (locale-aware Link) */}
      <nav className="body-sm flex items-center gap-2 text-[var(--outline)]" aria-label="Breadcrumb">
        <Link href="/dashboard" className="transition-colors hover:text-[var(--primary)]">
          Enterprise
        </Link>
        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
          chevron_right
        </span>
        <span className="font-medium text-[var(--on-surface)]">Billing &amp; Invoices</span>
      </nav>

      {/* Page header & summary bento — 207-236 */}
      <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Billing History</h1>
          <p className="body-md mt-2 max-w-2xl text-[var(--on-surface-variant)]">
            Review past platform service invoices and track current accruals.
          </p>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
            Fees are billed from settled transactions —{" "}
            <Link href="/transactions?status=SUCCEEDED" className="text-[var(--primary)] hover:underline">
              see what you are being charged for
            </Link>
            .
          </p>
        </div>

        <SectionBoundary title="Billing summary" className="xl:w-auto">
          <Suspense
            fallback={
              <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:w-auto xl:grid-cols-4">
                <Card className="h-28 min-w-[200px] animate-pulse bg-[var(--surface-container-low)]" />
                <Card className="h-28 min-w-[240px] animate-pulse bg-[var(--surface-container-low)]" />
                <Card className="h-28 min-w-[220px] animate-pulse bg-[var(--surface-container-low)]" />
                <Card className="h-28 min-w-[200px] animate-pulse bg-[var(--surface-container-low)]" />
              </div>
            }
          >
            <SummaryRow />
          </Suspense>
        </SectionBoundary>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <ExportCsvButton
          label="Export Statement"
          endpoint="/api/exports/invoices"
          filePrefix="statement"
          className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--surface-tint)]"
        />
      </div>

      <SectionBoundary title="Invoice history">
        <Suspense key={key} fallback={<TableSkeleton rows={8} columns={5} />}>
          <InvoiceHistory searchParams={searchParams} />
        </Suspense>
      </SectionBoundary>
    </main>
  );
}
