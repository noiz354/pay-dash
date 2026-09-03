import { Suspense } from "react";
import type { Metadata } from "next";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { ExportCsvButton } from "@/components/transactions/export-csv-button";
import { TablePagination } from "@/components/transactions/table-pagination";
import { CreateCustomerDialog } from "@/components/customers/create-customer-dialog";
import { CustomerFilters } from "@/components/customers/customer-filters";
import { CustomersTable } from "@/components/customers/customers-table";
import { formatCompactMoney, formatNumber } from "@/lib/format";
import { getCustomerMetrics, listCustomers } from "@/server/data/customers";
import type { CustomerStatus } from "@/lib/customer-status";

// Customer Directory — screens/desktop/customers.
// Search, status filter, sort and pagination are URL state so the view is
// shareable and server-rendered. `?new=1` (dashboard quick action) opens the
// create dialog; `?q=<email>` (transaction detail) pre-filters the list.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Customers — Kinetic Ledger",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

// The original static prototype rows are preserved verbatim below. They are no
// longer rendered as fake data — they are seeded into the customer store (see
// `server/data/customers.ts`) so Acme, Global Logistics and Stark still appear
// in the directory, now clickable, searchable and with real currency on LTV.
const PROTOTYPE_CUSTOMERS = [
  {
    name: "Acme Corporation",
    email: "contact@acmecorp.com",
    ref: "REF-10042",
    added: "Oct 24, 2023",
    status: "Active" as const,
    ltv: ",520.00",
    initials: "AC",
    avatarClass: "bg-[var(--primary-container)] text-[var(--on-primary-container)]",
  },
  {
    name: "Global Logistics Ltd.",
    email: "billing@globallogistics.com",
    ref: "REF-10056",
    added: "Oct 22, 2023",
    status: "Active" as const,
    ltv: ",250.50",
    initials: "GL",
    avatarClass: "bg-[var(--secondary-container)] text-[var(--on-secondary-container)]",
  },
  {
    name: "Stark Industries",
    email: "tony@stark.com",
    ref: "REF-10088",
    added: "Oct 15, 2023",
    status: "Review" as const,
    ltv: ",900.00",
    initials: "ST",
    avatarClass: "bg-[var(--tertiary-fixed)] text-[var(--on-tertiary-fixed)]",
  },
];

/** Kept from the prototype so any existing import keeps compiling. */
function StatusPill({ status }: { status: "Active" | "Review" | string }) {
  if (status === "Active") {
    return (
      <Badge className="rounded-full border-transparent bg-[var(--success-status)]/10 px-2 py-0.5 text-[10px] font-bold label-caps text-[var(--success-status)] hover:bg-[var(--success-status)]/10">
        Active
      </Badge>
    );
  }
  if (status === "Review") {
    return (
      <Badge className="rounded-full border-transparent bg-[var(--pending-status)]/10 px-2 py-0.5 text-[10px] font-bold label-caps text-[var(--pending-status)] hover:bg-[var(--pending-status)]/10">
        Review
      </Badge>
    );
  }
  return (
    <Badge className="rounded-full border-transparent bg-[var(--failed-status)]/10 px-2 py-0.5 text-[10px] font-bold label-caps text-[var(--failed-status)] hover:bg-[var(--failed-status)]/10">
      {status}
    </Badge>
  );
}

/**
 * The prototype's markup, preserved as a reusable static preview (toolbar,
 * table, checkboxes and all). Nothing renders it by default; pass `rows` to
 * reuse the exact original layout without duplicating styles.
 */
function StaticCustomersPreview({ rows = PROTOTYPE_CUSTOMERS }: { rows?: typeof PROTOTYPE_CUSTOMERS }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] shadow-sm">
      <div className="flex flex-col items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] px-4 py-3 sm:flex-row">
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-2 border-[var(--border-subtle)] bg-white px-3 py-1.5 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
          >
            <span className="material-symbols-outlined text-[16px]">filter_list</span>
            Filter
          </Button>
          <div className="mx-2 hidden h-4 w-px bg-[var(--border-subtle)] sm:block" aria-hidden="true" />
          <span className="body-sm text-[var(--on-surface-variant)]">{rows.length} Total</span>
        </div>
        <div className="relative w-full sm:w-64">
          <span
            className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]"
            style={{ fontSize: 16 }}
            aria-hidden="true"
          >
            search
          </span>
          <Input
            placeholder="Search by name or email..."
            className="h-8 w-full border-[var(--border-subtle)] bg-[var(--surface-canvas)] pl-8 pr-3"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table className="w-full text-left">
          <TableHeader className="sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--surface-container-low)]">
            <TableRow className="border-b-0 hover:bg-transparent">
              <TableHead scope="col" className="w-12 px-4 py-3 text-center label-caps font-semibold text-[var(--on-surface-variant)]">
                <Checkbox aria-label="Select all customers" className="border-[var(--outline-variant)]" />
              </TableHead>
              <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Customer</TableHead>
              <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Reference ID</TableHead>
              <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Added</TableHead>
              <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Status</TableHead>
              <TableHead scope="col" className="px-4 py-3 text-right label-caps font-semibold text-[var(--on-surface-variant)]">LTV</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-[var(--border-subtle)] bg-[var(--surface-container-lowest)]">
            {rows.map((c) => (
              <TableRow key={c.ref} className="group transition-colors hover:bg-[var(--surface-canvas)]">
                <TableCell className="px-4 py-3 text-center">
                  <Checkbox aria-label={"Select " + c.name} className="border-[var(--outline-variant)]" />
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 shrink-0 rounded">
                      <AvatarFallback className={"rounded text-xs font-semibold " + c.avatarClass}>
                        {c.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="body-md truncate font-medium text-[var(--on-surface)]">{c.name}</div>
                      <div className="body-sm truncate text-[var(--on-surface-variant)]">{c.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <span className="data-mono text-[var(--on-surface-variant)]">{c.ref}</span>
                </TableCell>
                <TableCell className="px-4 py-3 body-sm whitespace-nowrap text-[var(--on-surface-variant)]">{c.added}</TableCell>
                <TableCell className="px-4 py-3">
                  <StatusPill status={c.status} />
                </TableCell>
                <TableCell className="px-4 py-3 text-right data-mono text-[var(--on-surface)]">{c.ltv}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
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
    sort: (one(sp.sort) as "recent" | "ltv" | "name") ?? "recent",
    page: Number(one(sp.page) ?? 1) || 1,
    pageSize: 10,
  });

  return (
    <CustomersTable
      rows={result.rows}
      isFiltered={result.isFiltered}
      toolbar={<CustomerFilters key="customer-filters" resultCount={result.total} />}
      emptyAction={<CreateCustomerDialog key="customer-empty" triggerLabel="Add your first customer" />}
      footer={
        result.total > 0 ? (
          <TablePagination
            key="customer-pagination"
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

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  // A stable key makes Suspense re-fire on filter changes so the skeleton shows
  // during server round-trips instead of the table freezing in place.
  const sp = await searchParams;
  const key = new URLSearchParams(Object.entries(sp).map(([k, v]) => [k, String(one(v) ?? "")])).toString();

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
