import { Suspense } from "react";
import type { Metadata } from "next";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ExportCsvButton } from "@/components/transactions/export-csv-button";
import { TablePagination } from "@/components/transactions/table-pagination";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { SubscriptionFilters } from "@/components/subscriptions/subscription-filters";
import { SubscriptionRowActions } from "@/components/subscriptions/subscription-row-actions";
import { CreateSubscriptionDialog } from "@/components/subscriptions/create-subscription-dialog";
import { listSubscriptions, subscriptionSummary, type Subscription } from "@/server/data/subscriptions";
import { listCustomers } from "@/server/data/customers";
import {
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONES,
  type SubscriptionStatus,
} from "@/lib/subscription-status";
import { formatMoney, formatDateLong } from "@/lib/format";

// Subscriptions (ADR-0021). The prototype was a pure mockup: three invented
// stat cards (the same "1,248" the reports builder faked, plus a "1,290"
// total that contradicted them), three hard-coded 2023-dated rows with
// third-party avatar URLs, and a config surface — search, Filter, Export,
// Create, ⋮, pagination — in which every control had no handler. The rebuilt
// page runs over the app's own plan store: URL-driven search/status/
// pagination (the customer-directory pattern), derived stat cards, a real
// CSV export endpoint, real row actions, and a real create dialog.
export const metadata: Metadata = {
  title: "Subscriptions — Kinetic Ledger",
  description:
    "Your customers' recurring plans — real data, real filters, a real CSV export and a real create flow.",
};

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

const TONE_CHIP: Record<"success" | "pending" | "failed" | "neutral", string> = {
  success:
    "bg-[var(--status-success-bg)] text-[var(--success-status)] border-[var(--success-status)]/20",
  pending:
    "bg-[var(--pending-status)]/10 text-[var(--pending-status)] border-[var(--pending-status)]/20",
  failed: "bg-[var(--status-error-bg)] text-[var(--failed-status)] border-[var(--failed-status)]/20",
  neutral:
    "bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] border-[var(--outline-variant)]",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
      <div className="mb-2 flex items-start justify-between">
        <h2 className="label-caps tracking-wider text-[var(--on-surface-variant)]">{label}</h2>
        <span className="material-symbols-outlined text-[20px]" style={{ color: tone }} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="mb-1 headline-xl text-[var(--on-surface)]">{value}</div>
      <div className="body-sm text-[var(--on-surface-variant)]">{sub}</div>
    </div>
  );
}

async function SubscriptionsDirectory({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const status = (one(sp.status) as SubscriptionStatus | "ALL") ?? "ALL";
  const page = Number(one(sp.page) ?? 1) || 1;

  const [result, all] = await Promise.all([
    listSubscriptions({ q, status, page, pageSize: 10 }),
    listSubscriptions({ pageSize: 100 }),
  ]);
  const summary = subscriptionSummary(all.rows);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard
          label="Active Plans"
          value={String(summary.active)}
          sub={`MRR ${formatMoney(summary.activeMrr)}`}
          icon="trending_up"
          tone="var(--success-status)"
        />
        <StatCard
          label="Pending Setup"
          value={String(summary.pendingSetup)}
          sub="Awaiting customer confirmation"
          icon="schedule"
          tone="var(--pending-status)"
        />
        <StatCard
          label="Past Due"
          value={String(summary.pastDue)}
          sub={`${formatMoney(summary.pastDueTotal)} outstanding`}
          icon="error"
          tone="var(--failed-status)"
        />
      </div>

      <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] shadow-sm">
        <SubscriptionFilters resultCount={result.total} />

        {result.total === 0 ? (
          <div className="p-10">
            <EmptyState
              icon="subscriptions"
              title={result.isFiltered ? "No plans match these filters" : "No subscription plans yet"}
              description={
                result.isFiltered
                  ? "Widen the search or clear the status filter."
                  : "Create your first recurring plan."
              }
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table className="w-full text-left">
                <TableHeader className="sticky top-0 border-b border-[var(--border-subtle)] bg-[var(--surface-container-low)]">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4 py-3 label-caps text-[var(--on-surface-variant)]">Customer</TableHead>
                    <TableHead className="px-4 py-3 label-caps text-[var(--on-surface-variant)]">Plan</TableHead>
                    <TableHead className="px-4 py-3 label-caps text-[var(--on-surface-variant)]">Status</TableHead>
                    <TableHead className="px-4 py-3 text-right label-caps text-[var(--on-surface-variant)]">Amount (IDR)</TableHead>
                    <TableHead className="px-4 py-3 label-caps text-[var(--on-surface-variant)]">Interval</TableHead>
                    <TableHead className="px-4 py-3 label-caps text-[var(--on-surface-variant)]">Started</TableHead>
                    <TableHead className="px-4 py-3 label-caps text-[var(--on-surface-variant)]">Next billing</TableHead>
                    <TableHead className="px-4 py-3 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-[var(--border-subtle)] body-sm text-[var(--on-surface)]">
                  {result.rows.map((s: Subscription) => (
                    <TableRow key={s.id} className="transition-colors hover:bg-[var(--surface-container-low)]/40">
                      <TableCell className="px-4 py-2">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="bg-[var(--primary-fixed)] font-bold text-[var(--primary-fixed-dim)] text-xs">
                              {initials(s.customerName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <span className="block truncate font-medium text-[var(--on-surface)]">
                              {s.customerName}
                            </span>
                            <span className="block truncate text-xs text-[var(--on-surface-variant)]">
                              {s.customerEmail}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        <span className="font-medium">{s.planName}</span>
                        <span className="block data-mono text-xs text-[var(--on-surface-variant)]">{s.id}</span>
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE_CHIP[SUBSCRIPTION_STATUS_TONES[s.status]]}`}
                        >
                          {SUBSCRIPTION_STATUS_LABELS[s.status]}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right data-mono">
                        {formatMoney(s.amount, s.currency)}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-[var(--on-surface-variant)]">
                        {s.interval === "monthly" ? "Monthly" : "Yearly"}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-[var(--on-surface-variant)]">
                        {formatDateLong(s.startedAt)}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-[var(--on-surface-variant)]">
                        {s.nextBillingAt ? formatDateLong(s.nextBillingAt) : "—"}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right">
                        <SubscriptionRowActions
                          id={s.id}
                          customerId={s.customerId}
                          customerEmail={s.customerEmail}
                          name={s.customerName}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {result.total > 0 ? (
              <div className="border-t border-[var(--border-subtle)] p-2">
                <TablePagination
                  page={result.page}
                  pageCount={result.pageCount}
                  total={result.total}
                  pageSize={result.pageSize}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The create dialog offers real directory customers (ADR-0021), so
  // "View customer" from a created plan always resolves.
  const customers = await listCustomers({ pageSize: 100 });
  const directoryCustomers = customers.rows.map((c) => ({ name: c.name, email: c.email }));

  return (
    <main className="mx-auto w-full max-w-container-max p-gutter space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Subscriptions</h1>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
            Your customers&apos; recurring plans — what you see exports exactly.
          </p>
        </div>
        <div className="flex gap-3">
          <ExportCsvButton
            label="Export"
            endpoint="/api/exports/subscriptions"
            filePrefix="subscriptions"
            className="h-9 border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4"
          />
          <CreateSubscriptionDialog customers={directoryCustomers} />
        </div>
      </div>
      <Suspense fallback={<TableSkeleton rows={6} columns={8} />}>
        <SubscriptionsDirectory searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
