"use client";
import * as React from "react";
import { useSearchParams, usePathname, useRouter } from "@/i18n/navigation";
import { CanonicalDataTable, type Column } from "@/components/data-table/canonical-data-table";
import { SearchInput } from "@/components/data-table/search-input";
import { FilterBar, FilterSheet } from "@/components/data-table/filter-bar";
import { Button } from "@/components/ui/button";
import { PayoutStatusPill } from "@/components/payouts/payout-status-pill";
import { formatDateLong, formatMoney, formatNumber } from "@/lib/format";
import { track } from "@/lib/analytics";
import { parseTableUrlState, activeFilterCount, toFilterChips } from "@/lib/table-url-state";
import type { BatchSummary } from "@/server/data/payouts";
import Link from "next/link";
import { approveBatchAction, cancelBatchAction } from "@/server/actions/payouts";
import { toast } from "sonner";
import { CsvImport } from "@/components/data-table/csv-import";
import { createBatchAction } from "@/server/actions/payouts";

export function CanonicalPayoutsTable({
  rows,
  total,
  page,
  pageCount,
  pageSize,
  isFiltered,
}: {
  rows: BatchSummary[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  isFiltered: boolean;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [csvOpen, setCsvOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const [bulkPending, setBulkPending] = React.useState(false);

  const state = React.useMemo(() => parseTableUrlState(searchParams.toString(), { allowedSorts: ["recent", "amount", "recipients"], defaultSort: "recent" }), [searchParams]);
  const chips = React.useMemo(() => toFilterChips(state), [state]);
  const count = activeFilterCount(state);

  const onSearch = React.useCallback(
    (v: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (v) params.set("q", v);
      else params.delete("q");
      params.delete("page");
      const qs = params.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
      track(v ? "search_completed" : "search_cleared", { journey_id: "JRN-006", screen_id: "SCR-013", query_length: v.length, result_count: total });
    },
    [searchParams, pathname, router, total]
  );

  const onClearChip = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    params.delete("page");
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    track("filter_cleared", { journey_id: "JRN-006", filterKey: key });
  };
  const onClearAll = () => {
    startTransition(() => router.replace(pathname, { scroll: false }));
    track("filter_cleared", { journey_id: "JRN-006", filterKey: "all" });
  };
  const onSort = (sort: string, direction: "asc" | "desc") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", sort);
    params.set("direction", direction);
    params.delete("page");
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    track("sort_changed", { journey_id: "JRN-006", sort, direction });
  };
  const onPageChange = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    track("page_changed", { journey_id: "JRN-006", page: next });
    setSelected([]);
  };
  const onPageSizeChange = (size: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (size === 10) params.delete("pageSize");
    else params.set("pageSize", String(size));
    params.delete("page");
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    setSelected([]);
  };

  // Bulk actions with permission-aware handling + partial failure
  const bulkApprove = async () => {
    if (selected.length === 0) return;
    setBulkPending(true);
    track("bulk_action_started", { journey_id: "JRN-006", action: "approve", count: selected.length });
    let success = 0;
    let failed = 0;
    const reasons: string[] = [];
    for (const id of selected) {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("confirm", "on");
      const res = await approveBatchAction(undefined, fd);
      if (res.status === "success") success++;
      else {
        failed++;
        reasons.push(`${id}: ${res.message}`);
      }
    }
    setBulkPending(false);
    if (failed === 0) toast.success(`${success} batch${success === 1 ? "" : "es"} approved`);
    else if (success === 0) toast.error(`All ${failed} failed`, { description: reasons[0] });
    else toast.warning(`${success} approved, ${failed} failed`, { description: reasons.join("; ") });
    track("bulk_action_completed", { journey_id: "JRN-006", action: "approve", success, failed });
    if (success > 0) {
      setSelected([]);
      // Keep URL state, just refresh
      router.refresh();
    }
  };

  const bulkCancel = async () => {
    if (selected.length === 0) return;
    if (!confirm(`Cancel ${selected.length} batch${selected.length === 1 ? "" : "es"}? This is reversible only by recreating.`)) return;
    setBulkPending(true);
    track("bulk_action_started", { journey_id: "JRN-006", action: "cancel", count: selected.length });
    let success = 0;
    let failed = 0;
    for (const id of selected) {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("confirm", "on");
      const res = await cancelBatchAction(undefined, fd);
      if (res.status === "success") success++;
      else failed++;
    }
    setBulkPending(false);
    toast[failed ? "warning" : "success"](`${success} cancelled, ${failed} failed`);
    track("bulk_action_completed", { journey_id: "JRN-006", action: "cancel", success, failed });
    if (success > 0) {
      setSelected([]);
      router.refresh();
    }
  };

  const exportSelected = () => {
    if (selected.length === 0) return;
    track("export_started", { journey_id: "JRN-006", count: selected.length });
    const selectedRows = rows.filter((r) => selected.includes(r.id));
    const header = "id,name,status,recipients,amount\n";
    const body = selectedRows.map((r) => `${r.id},"${r.name}",${r.status},${r.recipientCount},${r.totalAmount}`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payouts-selected-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    track("export_completed", { journey_id: "JRN-006", count: selected.length });
  };

  const columns: Column<BatchSummary>[] = [
    {
      id: "name",
      header: "Batch",
      accessor: (r) => (
        <Link href={`/payouts/${r.id}`} className="hover:underline">
          <div className="font-medium text-[var(--on-surface)]">{r.name}</div>
          <div className="text-xs data-mono text-[var(--on-surface-variant)]">
            {r.id} · {r.source}
          </div>
        </Link>
      ),
      priority: 0,
    },
    {
      id: "status",
      header: "Status",
      accessor: (r) => (
        <div>
          <PayoutStatusPill status={r.status} />
          {r.failedCount > 0 ? <div className="text-xs text-[var(--failed-status)] mt-1">{r.failedCount} need attention</div> : null}
        </div>
      ),
      priority: 0,
    },
    {
      id: "recipients",
      header: "Recipients",
      accessor: (r) => (
        <div>
          <div className="data-mono text-sm">
            {formatNumber(r.paidCount)} / {formatNumber(r.recipientCount)}
          </div>
          <div className="mt-1 h-1.5 w-20 rounded-full bg-[var(--surface-container-high)]">
            <div className="h-full rounded-full bg-[var(--success-status)]" style={{ width: `${r.recipientCount ? Math.round((r.paidCount / r.recipientCount) * 100) : 0}%` }} />
          </div>
        </div>
      ),
      sortable: true,
      sortKey: "recipients",
      priority: 1,
    },
    {
      id: "amount",
      header: "Amount",
      accessor: (r) => <span className="data-mono">{formatMoney(r.totalAmount, r.currency)}</span>,
      sortable: true,
      sortKey: "amount",
      className: "text-right",
      priority: 0,
    },
    {
      id: "createdAt",
      header: "Created",
      accessor: (r) => <span className="text-xs text-[var(--on-surface-variant)]">{formatDateLong(r.createdAt)}</span>,
      sortable: true,
      sortKey: "recent",
      priority: 1,
    },
  ];

  const sort = searchParams.get("sort") ?? "recent";
  const direction = (searchParams.get("direction") as "asc" | "desc") ?? "desc";
  const q = searchParams.get("q") ?? "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <SearchInput value={q} onChange={onSearch} placeholder="Search batch, reference…" ariaLabel="Search payouts" className="w-[280px]" loading={isPending} />
          <FilterBar chips={chips} onClearChip={onClearChip} onClearAll={onClearAll} onOpen={() => setFilterOpen(true)} activeCount={count} />
          <span className="text-xs text-[var(--on-surface-variant)]" aria-live="polite">
            {total} batches {isPending ? "· updating…" : ""}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCsvOpen((v) => !v)} className="h-8 gap-1.5">
            <span className="material-symbols-outlined text-[16px]" aria-hidden>
              upload_file
            </span>
            CSV Import
          </Button>
          <Link href="/payouts/bulk" className="inline-flex items-center rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-sm hover:bg-[var(--surface-container-low)]">
            Bulk workspace
          </Link>
        </div>
      </div>

      {csvOpen ? (
        <div className="rounded-lg border p-4 bg-[var(--surface-container-lowest)]">
          <h3 className="font-medium mb-3">CSV Import — invalid rows preserved</h3>
          <CsvImport
            onSubmit={async (valid) => {
              const fd = new FormData();
              fd.set("name", `CSV import ${new Date().toISOString().slice(0, 10)}`);
              fd.set("source", "CSV upload");
              fd.set("csv", valid.map((r) => `${r.name},${r.bank},${r.accountNumber},${r.amount},${r.reference}`).join("\n"));
              const res = await createBatchAction(undefined, fd);
              if (res.status === "success") {
                toast.success(res.message);
                router.refresh();
                return { succeeded: valid.length, failed: 0 };
              } else {
                toast.error(res.message);
                return { succeeded: 0, failed: valid.length, failedRows: valid.map((r) => ({ line: r.line, raw: `${r.name},${r.bank},${r.accountNumber},${r.amount}`, reason: res.message })) as any };
              }
            }}
          />
        </div>
      ) : null}

      <CanonicalDataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        sort={sort}
        direction={direction}
        onSort={onSort}
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        selectable
        bulkActions={
          <>
            <Button size="sm" variant="outline" onClick={bulkApprove} disabled={bulkPending} className="h-8 gap-1.5">
              Approve {selected.length}
            </Button>
            <Button size="sm" variant="outline" onClick={bulkCancel} disabled={bulkPending} className="h-8 gap-1.5">
              Cancel
            </Button>
            <Button size="sm" variant="outline" onClick={exportSelected} className="h-8 gap-1.5">
              Export {selected.length}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])} className="h-8">
              Clear
            </Button>
          </>
        }
        isFiltered={isFiltered}
        emptyTitle="No payouts yet"
        emptyDescription="Create your first payout — batch history will appear here."
        filteredEmptyTitle="No batches match these filters"
        filteredEmptyDescription="Try clearing status or search to see more."
        caption="Payout batches. Activate a row to open details."
        cardRenderer={(r) => (
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-medium text-sm truncate pr-2">{r.name}</span>
              <PayoutStatusPill status={r.status} />
            </div>
            <div className="text-xs data-mono">
              {formatNumber(r.paidCount)}/{formatNumber(r.recipientCount)} · {formatMoney(r.totalAmount, r.currency)}
            </div>
            <div className="text-xs text-[var(--on-surface-variant)]">{formatDateLong(r.createdAt)}</div>
            <Link href={`/payouts/${r.id}`} className="text-xs text-[var(--primary)] hover:underline">
              View batch →
            </Link>
          </div>
        )}
      />

      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="space-y-4">
          <label className="block text-sm">
            Status
            <select
              value={searchParams.get("status") ?? "ALL"}
              onChange={(e) => {
                const v = e.target.value;
                const params = new URLSearchParams(searchParams.toString());
                if (v === "ALL") params.delete("status");
                else params.set("status", v);
                params.delete("page");
                const qs = params.toString();
                startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
                track("filter_applied", { filterKey: "status", value: v });
              }}
              className="mt-1 w-full rounded border p-2 text-sm"
            >
              <option value="ALL">All</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="PROCESSING">Processing</option>
              <option value="PAID">Paid</option>
              <option value="PARTIAL">Partial</option>
              <option value="FAILED">Failed</option>
            </select>
          </label>
          <label className="block text-sm">
            Range
            <select
              value={searchParams.get("range") ?? "all"}
              onChange={(e) => {
                const v = e.target.value;
                const params = new URLSearchParams(searchParams.toString());
                if (v === "all") params.delete("range");
                else params.set("range", v);
                params.delete("page");
                const qs = params.toString();
                startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
                track("filter_applied", { filterKey: "range", value: v });
              }}
              className="mt-1 w-full rounded border p-2 text-sm"
            >
              <option value="all">All time</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="12m">Last 12 months</option>
            </select>
          </label>
          <Button variant="outline" className="w-full" onClick={onClearAll}>
            Clear all
          </Button>
        </div>
      </FilterSheet>
    </div>
  );
}
