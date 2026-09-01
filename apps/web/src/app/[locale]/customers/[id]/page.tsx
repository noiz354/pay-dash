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
import { TableSkeleton } from "@/components/common/table-skeleton";
import { SectionBoundary } from "@/components/common/section-boundary";
import { CustomerHeader } from "@/components/customers/customer-header";
import { EditCustomerDialog } from "@/components/customers/edit-customer-dialog";
import { CustomerLifetimeStats, CustomerPaymentMethods } from "@/components/customers/customer-lifetime-stats";
import { CustomerTransactionsPanel } from "@/components/customers/customer-transactions-panel";
import { getCustomer } from "@/server/data/customers";

// Customer profile — the destination for every directory row, every row action
// and the "View customer" link on a transaction detail page.
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const customer = await getCustomer(id);
  return { title: `${customer?.name ?? id} — Customer — Kinetic Ledger` };
}

export default async function CustomerDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();

  return (
    <main className="mx-auto w-full max-w-[var(--container-max)] space-y-6 p-[var(--gutter)]">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/dashboard">Dashboard</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/customers">Customers</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="data-mono">{customer.referenceId}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <CustomerHeader customer={customer} />

      <div className="flex flex-wrap gap-3">
        <EditCustomerDialog customer={customer} />
      </div>

      <SectionBoundary title="Lifetime stats">
        <CustomerLifetimeStats customer={customer} />
      </SectionBoundary>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionBoundary title="Payments">
            <Suspense fallback={<TableSkeleton rows={5} columns={6} />}>
              <CustomerTransactionsPanel email={customer.email} />
            </Suspense>
          </SectionBoundary>
        </div>
        <div className="space-y-6">
          <SectionBoundary title="Payment methods">
            <CustomerPaymentMethods customer={customer} />
          </SectionBoundary>
          <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4">
            <h2 className="headline-md text-[var(--on-surface)]">Identity</h2>
            <dl className="mt-3 space-y-2 body-sm">
              <div className="flex justify-between gap-4">
                <dt className="label-caps text-[var(--on-surface-variant)]">Customer ID</dt>
                <dd className="data-mono text-[var(--on-surface)]">{customer.id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="label-caps text-[var(--on-surface-variant)]">Reference</dt>
                <dd className="data-mono text-[var(--on-surface)]">{customer.referenceId}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="label-caps text-[var(--on-surface-variant)]">Source</dt>
                <dd className="text-[var(--on-surface)]">
                  {customer.source === "ledger" ? "Created by a payment" : "Added manually"}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </main>
  );
}
