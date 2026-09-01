import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { SectionBoundary } from "@/components/common/section-boundary";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import {
  InvoiceHeader,
  InvoiceLineItems,
  InvoicePaymentTimeline,
  InvoiceTotals,
} from "@/components/billing/invoice-detail-parts";
import { formatDateLong } from "@/lib/format";
import {
  getInvoice,
  getInvoiceLineItems,
  getInvoiceTimeline,
  getInvoiceTransactions,
} from "@/server/data/invoices";

// Invoice detail — the destination the prototype already linked to
// (`/billing/[id]`) but never created.
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const invoice = await getInvoice(decodeURIComponent(id));
  return { title: `${invoice?.number ?? id} — Invoice — Kinetic Ledger` };
}

async function BilledTransactions({ id }: { id: string }) {
  const rows = await getInvoiceTransactions(id);
  return (
    <section className="space-y-3" aria-label="Billed transactions">
      <div className="flex items-center justify-between">
        <h2 className="headline-md text-[var(--on-surface)]">Billed transactions</h2>
        {rows.length > 5 ? (
          <Link href="/transactions?status=SUCCEEDED">
            <Button variant="ghost" size="sm" className="text-[var(--primary)]">
              View all {rows.length}
            </Button>
          </Link>
        ) : null}
      </div>
      <TransactionsTable rows={rows.slice(0, 5)} variant="compact" />
    </section>
  );
}

async function LineItems({ id }: { id: string }) {
  const [invoice, items] = await Promise.all([getInvoice(id), getInvoiceLineItems(id)]);
  if (!invoice) return null;
  return <InvoiceLineItems items={items} invoice={invoice} />;
}

async function Timeline({ id }: { id: string }) {
  const events = await getInvoiceTimeline(id);
  return <InvoicePaymentTimeline events={events} />;
}

export default async function InvoiceDetailPage({ params }: { params: Params }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  return (
    <main className="mx-auto w-full max-w-container-max space-y-6 p-gutter">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/dashboard">Dashboard</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/billing">Billing</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="data-mono">{invoice.number}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <InvoiceHeader invoice={invoice} />

      <SectionBoundary title="Invoice totals">
        <InvoiceTotals invoice={invoice} />
      </SectionBoundary>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionBoundary title="Line items">
            <Suspense fallback={<Card className="h-48 animate-pulse bg-[var(--surface-container-low)]" />}>
              <LineItems id={invoice.id} />
            </Suspense>
          </SectionBoundary>

          <SectionBoundary title="Billed transactions">
            <Suspense fallback={<TableSkeleton rows={5} columns={6} />}>
              <BilledTransactions id={invoice.id} />
            </Suspense>
          </SectionBoundary>
        </div>

        <div className="space-y-6">
          <SectionBoundary title="Payment timeline">
            <Suspense fallback={<Card className="h-64 animate-pulse bg-[var(--surface-container-low)]" />}>
              <Timeline id={invoice.id} />
            </Suspense>
          </SectionBoundary>

          <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4">
            <h2 className="headline-md text-[var(--on-surface)]">Billing details</h2>
            <dl className="mt-3 space-y-2 body-sm">
              <div className="flex justify-between gap-4">
                <dt className="label-caps text-[var(--on-surface-variant)]">Period</dt>
                <dd className="text-right text-[var(--on-surface)]">{invoice.periodLabel}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="label-caps text-[var(--on-surface-variant)]">Issued</dt>
                <dd className="text-[var(--on-surface)]">{formatDateLong(invoice.issuedAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="label-caps text-[var(--on-surface-variant)]">Due</dt>
                <dd className="text-[var(--on-surface)]">{formatDateLong(invoice.dueAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="label-caps text-[var(--on-surface-variant)]">Paid</dt>
                <dd className="text-[var(--on-surface)]">
                  {invoice.paidAt ? formatDateLong(invoice.paidAt) : "Not yet"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="label-caps text-[var(--on-surface-variant)]">Method</dt>
                <dd className="text-right text-[var(--on-surface)]">{invoice.paymentMethod ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="label-caps text-[var(--on-surface-variant)]">Source</dt>
                <dd className="text-[var(--on-surface)]">
                  {invoice.source === "ledger" ? "Derived from ledger fees" : "Historical statement"}
                </dd>
              </div>
            </dl>
            <Link href="/settings/merchant" className="body-sm mt-4 inline-block text-[var(--primary)] hover:underline">
              Manage billing settings
            </Link>
          </Card>
        </div>
      </div>
    </main>
  );
}
