"use client";
import * as React from "react";
import { useSearchParams, usePathname, useRouter } from "@/i18n/navigation";
import { useRouter as useNextRouter } from "next/navigation";
import { CanonicalDataTable, type Column } from "@/components/data-table/canonical-data-table";
import { SearchInput } from "@/components/data-table/search-input";
import { FilterBar, FilterSheet, type FilterChip } from "@/components/data-table/filter-bar";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/transactions/status-pill";
import { formatDateTime, formatMoney } from "@/lib/format";
import { track } from "@/lib/analytics";
import { parseTableUrlState, activeFilterCount, toFilterChips } from "@/lib/table-url-state";
import type { Transaction } from "@/server/data/transactions";
import Link from "next/link";

export function CanonicalTransactionsTable({
  rows,
  total,
  page,
  pageCount,
  pageSize,
  isFiltered,
}: {
  rows: Transaction[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  isFiltered: boolean;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const nextRouter = useNextRouter();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  // Parse URL state for chips and current filters
  const state = React.useMemo(() => parseTableUrlState(searchParams.toString()), [searchParams]);
  const chips = React.useMemo(() => toFilterChips(state), [state]);
  const count = activeFilterCount(state);

  // Search
  const q = searchParams.get("q") ?? "";
  const onSearch = React.useCallback(
    (v: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (v) params.set("q", v);
      else params.delete("q");
      params.delete("page");
      const qs = params.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
      track(v ? "search_completed" : "search_cleared", { journey_id: "JRN-002", screen_id: "SCR-005", query_length: v.length, result_count: total });
      if (v) track("search_started", { journey_id: "JRN-002", screen_id: "SCR-005", query_length: v.length });
    },
    [searchParams, pathname, router, total]
  );

  const onClearChip = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    params.delete("page");
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    track("filter_cleared", { journey_id: "JRN-002", filterKey: key });
  };
  const onClearAll = () => {
    startTransition(() => router.replace(pathname, { scroll: false }));
    track("filter_cleared", { journey_id: "JRN-002", filterKey: "all" });
  };

  const onSort = (sort: string, direction: "asc" | "desc") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", sort);
    params.set("direction", direction);
    params.delete("page");
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    track("sort_changed", { journey_id: "JRN-002", sort, direction });
  };

  const onPageChange = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    track("page_changed", { journey_id: "JRN-002", page: next });
    // Clear selection on page change (page scope)
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

  // Bulk export selected
  const exportSelected = async () => {
    if (selected.length === 0) return;
    track("bulk_action_started", { journey_id: "JRN-002", action: "export", count: selected.length });
    const selectedRows = rows.filter((r) => selected.includes(r.id));
    const header = "referenceId,amount,customerName,status\n";
    const body = selectedRows.map((r) => `${r.referenceId},${r.amount},"${r.customerName}",${r.status}`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-selected-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    track("bulk_action_completed", { journey_id: "JRN-002", action: "export", count: selected.length, success: selected.length, failed: 0 });
  };

  const columns: Column<Transaction>[] = [
    {
      id: "referenceId",
      header: "Reference ID",
      accessor: (r) => <Link href={`/transactions/${r.id}`} className="text-[var(--primary)] hover:underline data-mono">{r.referenceId}</Link>,
      sortable: true,
      sortKey: "date",
      priority: 0,
    },
    {
      id: "date",
      header: "Date & Time",
      accessor: (r) => <span className="text-[var(--on-surface-variant)] whitespace-nowrap">{formatDateTime(r.createdAt)}</span>,
      sortable: true,
      sortKey: "date",
      priority: 0,
    },
    {
      id: "customer",
      header: "Customer",
      accessor: (r) => (
        <span>
          <span className="block truncate max-w-[180px]">{r.customerName}</span>
          <span className="block truncate max-w-[180px] text-xs text-[var(--on-surface-variant)]">{r.customerEmail}</span>
        </span>
      ),
      priority: 0,
    },
    {
      id: "amount",
      header: "Amount",
      accessor: (r) => <span className="data-mono text-right block">{formatMoney(r.amount, r.currency)}</span>,
      sortable: true,
      sortKey: "amount",
      className: "text-right",
      priority: 0,
    },
    {
      id: "status",
      header: "Status",
      accessor: (r) => <StatusPill status={r.status} />,
      sortable: true,
      sortKey: "status",
      priority: 0,
      className: "text-right",
    },
  ];

  const sort = searchParams.get("sort") ?? "date";
  const direction = (searchParams.get("direction") as "asc" | "desc") ?? "desc";

  return (
    <div className="space-y-3">
      {/* Toolbar: Search + Filters + result count + stale handling placeholder */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-1">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <SearchInput value={q} onChange={onSearch} placeholder="Search reference, customer, email…" ariaLabel="Search transactions" className="w-[280px]" loading={isPending} />
          <FilterBar chips={chips} onClearChip={onClearChip} onClearAll={onClearAll} onOpen={() => setFilterOpen(true)} activeCount={count} />
          <span className="text-xs text-[var(--on-surface-variant)] ml-2" aria-live="polite">
            {total} results {isPending ? "· updating…" : ""}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => nextRouter.refresh()} aria-label="Refresh" className="h-8 gap-1.5">
            <span className="material-symbols-outlined text-[16px]" aria-hidden>
              refresh
            </span>
            Refresh
          </Button>
        </div>
      </div>

      {/* Stale banner placeholder — threshold 60s */}
      {/* For demo, show if data older than 60s: here we could track last fetch time */}

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
            <Button size="sm" variant="outline" onClick={exportSelected} className="h-8 gap-1.5">
              <span className="material-symbols-outlined text-[16px]" aria-hidden>
                download
              </span>
              Export {selected.length}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])} className="h-8">
              Clear
            </Button>
          </>
        }
        isFiltered={isFiltered}
        emptyTitle="No transactions yet"
        emptyDescription="Once a payment is processed it will appear here within seconds."
        filteredEmptyTitle={`No transactions match these filters`}
        filteredEmptyDescription="Try widening the date range or clearing the status and channel filters."
        caption="Transactions. Activate a row to open details."
        cardRenderer={(r) => (
          <div className="space-y-2">
            <div className="flex justify-between items-start">
              <span className="data-mono text-sm font-medium">{r.referenceId}</span>
              <StatusPill status={r.status} />
            </div>
            <div className="text-sm">
              {r.customerName} · {formatMoney(r.amount, r.currency)}
            </div>
            <div className="text-xs text-[var(--on-surface-variant)]">{formatDateTime(r.createdAt)}</div>
            <Link href={`/transactions/${r.id}`} className="text-xs text-[var(--primary)] hover:underline">
              View details →
            </Link>
          </div>
        )}
      />

      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="space-y-4">
          <div className="text-sm font-medium">Filters</div>
          <div className="space-y-3">
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
                className="mt-1 w-full rounded border border-[var(--outline-variant)] p-2 text-sm"
              >
                <option value="ALL">All</option>
                <option value="SUCCEEDED">Succeeded</option>
                <option value="FAILED">Failed</option>
                <option value="PENDING">Pending</option>
                <option value="PROCESSING">Processing</option>
                <option value="REFUNDED">Refunded</option>
              </select>
            </label>
            <label className="block text-sm">
              Channel
              <select
                value={searchParams.get("channel") ?? "ALL"}
                onChange={(e) => {
                  const v = e.target.value;
                  const params = new URLSearchParams(searchParams.toString());
                  if (v === "ALL") params.delete("channel");
                  else params.set("channel", v);
                  params.delete("page");
                  const qs = params.toString();
                  startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
                  track("filter_applied", { filterKey: "channel", value: v });
                }}
                className="mt-1 w-full rounded border border-[var(--outline-variant)] p-2 text-sm"
              >
                <option value="ALL">All</option>
                <option value="CARD">Card</option>
                <option value="ACH">ACH</option>
                <option value="VA">VA</option>
                <option value="QRIS">QRIS</option>
                <option value="EWALLET">E-wallet</option>
              </select>
            </label>
            <label className="block text-sm">
              Date range
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
                className="mt-1 w-full rounded border border-[var(--outline-variant)] p-2 text-sm"
              >
                <option value="all">All time</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </label>
          </div>
          <Button variant="outline" className="w-full" onClick={onClearAll}>
            Clear all filters
          </Button>
        </div>
      </FilterSheet>
    </div>
  );
}
