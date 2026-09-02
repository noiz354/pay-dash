import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import { ExportCsvButton } from "@/components/transactions/export-csv-button";
import { TablePagination } from "@/components/transactions/table-pagination";
import { AuditFilters } from "@/components/audit/audit-filters";
import {
  AUDIT_CATEGORIES,
  AUDIT_STATUSES,
  isAuditCategory,
  isAuditRange,
  isAuditStatus,
} from "@/lib/audit-options";
import { formatDateTime } from "@/lib/format";
import { auditSummary, listAuditEvents, type AuditStatus } from "@/server/data/audit";

// Detailed Audit Log (ADR-0026). The prototype printed five hard-coded rows
// (all dated 2023-10-24, off-world @org.com actors, "1 of 12,042 events"),
// with a User column and an IP column no store can fill. Every row below is
// derived from the event timelines the app's stores already own — ledger
// transactions, payout batches, the webhook callback log, and configuration
// changes — and every control is real URL state.
export const metadata: Metadata = {
  title: "Detailed Audit Log — Kinetic Ledger",
  description:
    "The event history the app actually owns — payments, payouts, webhooks and configuration — derived from the stores that record them.",
};

const STATUS_TONE: Record<AuditStatus, string> = {
  SUCCESS:
    "bg-[var(--success-status)]/10 text-[var(--success-status)] border-[var(--success-status)]/20",
  FAILED: "bg-[var(--failed-status)]/10 text-[var(--failed-status)] border-[var(--failed-status)]/20",
  WARNING: "bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20",
  INFO: "bg-[var(--surface-variant)]/50 text-[var(--on-surface-variant)] border-[var(--border-subtle)]",
};

const CATEGORY_LABEL = Object.fromEntries(AUDIT_CATEGORIES.map((c) => [c.value, c.label]));

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rawCategory = String(sp.category ?? "ALL");
  const rawStatus = String(sp.status ?? "ALL");
  const rawRange = String(sp.range ?? "all");
  const pageParam = Number(sp.page ?? 1);

  const [result, summary] = await Promise.all([
    listAuditEvents({
      q: String(sp.q ?? ""),
      category: isAuditCategory(rawCategory) ? rawCategory : "ALL",
      status: isAuditStatus(rawStatus) ? rawStatus : "ALL",
      range: isAuditRange(rawRange) ? rawRange : "all",
      page: Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1,
      pageSize: 10,
    }),
    auditSummary(),
  ]);

  return (
    <main className="mx-auto max-w-container-max p-gutter">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Detailed Audit Log</h1>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
            Every event the app&apos;s stores record — {summary.total.toLocaleString("en-US")} in
            total. There is no user or IP column because no store holds one.
          </p>
        </div>
        <ExportCsvButton endpoint="/api/exports/audit" filePrefix="audit" className="shrink-0" />
      </div>

      {/* Table card — filter bar, rows, pagination */}
      <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] shadow-sm">
        <AuditFilters resultCount={result.total} />

        {result.total === 0 ? (
          <EmptyState
            className="m-4 rounded-lg"
            icon="history"
            title="No events match these filters"
            description="Try a wider date range or clear the search."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left" aria-label="Detailed audit log">
                <thead className="sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--surface-container-low)]">
                  <tr>
                    <th scope="col" className="w-44 px-4 py-3 label-caps font-normal text-[var(--on-surface-variant)]">
                      Timestamp
                    </th>
                    <th scope="col" className="w-32 px-3 py-3 label-caps font-normal text-[var(--on-surface-variant)]">
                      Category
                    </th>
                    <th scope="col" className="min-w-[280px] px-3 py-3 label-caps font-normal text-[var(--on-surface-variant)]">
                      Action &amp; Resource
                    </th>
                    <th scope="col" className="w-28 px-4 py-3 text-right label-caps font-normal text-[var(--on-surface-variant)]">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {result.rows.map((event) => (
                    <tr key={event.id} className="hover:bg-[var(--surface-canvas)] transition-colors">
                      <td className="px-4 py-3 align-top data-mono text-[var(--on-surface-variant)]">
                        {formatDateTime(event.at)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className="inline-block rounded-full border border-[var(--border-subtle)] bg-[var(--surface-container)] px-2 py-0.5 text-[11px] font-medium text-[var(--on-surface-variant)]">
                          {CATEGORY_LABEL[event.category]}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              "body-sm font-semibold " +
                              (event.status === "FAILED"
                                ? "text-[var(--failed-status)]"
                                : "text-[var(--on-surface)]")
                            }
                          >
                            {event.action}
                          </span>
                          <span className="shrink-0 rounded bg-[var(--surface-variant)]/40 px-1.5 py-0.5 data-mono text-[11px] text-[var(--on-surface-variant)]">
                            {event.resource}
                          </span>
                        </div>
                        <div className="body-sm mt-0.5 truncate text-[var(--on-surface-variant)]">
                          {event.detail}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex justify-end">
                          <Badge
                            variant="secondary"
                            className={
                              "rounded-full border px-2 py-0.5 text-[11px] font-medium " +
                              STATUS_TONE[event.status]
                            }
                          >
                            {AUDIT_STATUSES.find((s) => s.value === event.status)?.label ?? event.status}
                          </Badge>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={result.page}
              pageCount={result.pageCount}
              total={result.total}
              pageSize={result.pageSize}
            />
          </>
        )}
      </div>
    </main>
  );
}
