"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { CanonicalDataTable, type Column } from "@/components/data-table/canonical-data-table";
import { SearchInput } from "@/components/data-table/search-input";
import { FilterBar } from "@/components/data-table/filter-bar";
import { BulkBar } from "@/components/data-table/bulk-bar";
import { StaleBanner } from "@/components/data-table/stale-banner";
import { Button } from "@/components/ui/button";
import { CustomerStatusPill } from "./customer-status-pill";
import { CustomerRowActions } from "./customer-row-actions";
import { formatDateLong, formatMoney, formatNumber } from "@/lib/format";
import { trackEvent } from "@/lib/analytics-events";
import { activeFilterCount, parseTableUrlState, toFilterChips } from "@/lib/table-url-state";
import type { Customer } from "@/server/data/customers";

// FE-012 — Customers on the canonical DataTable (CMP-005).
//
// Rewritten in Wave 4: the first attempt was authored against APIs that do not
// exist in this repo (`formatIDR`, `Customer.ref`, `Customer.transactionCount`,
// a `FilterBar` that takes children, a `SearchInput` with `onClear`/`debounce`),
// so the screen could not compile and `/customers` was effectively unshipped.
// This version uses the same primitives as `canonical-payouts-table.tsx`, which
// is the reference implementation for the pattern.
//
// URL state is the source of truth (CMP-004/FE-010): q, status, sort,
// direction, page and pageSize all round-trip, so refresh/back/share preserve
// the view and the "detail → back" journey restores the exact list.

const CUSTOMER_STATUS_OPTIONS = ["ALL", "ACTIVE", "REVIEW", "BLOCKED", "NEW"] as const;
const CUSTOMER_SORT_OPTIONS = ["recent", "name", "ltv", "added"] as const;

const PARSE_OPTS = {
  allowedStatuses: [...CUSTOMER_STATUS_OPTIONS],
  allowedSorts: [...CUSTOMER_SORT_OPTIONS],
  defaultSort: "recent",
  defaultDirection: "desc" as const,
};

/** Seconds after which the list is declared stale (CMP-008). */
const STALE_AFTER_SECONDS = 60;

export type CanonicalCustomersTableProps = {
  data: Customer[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  isFiltered: boolean;
  /** ISO instant the server read this page — the freshness anchor. */
  lastUpdated?: string;
  /** Export requires `customer.read`; the caller gates it from the session. */
  canExport?: boolean;
};

export function CanonicalCustomersTable({
  data,
  total,
  page,
  pageCount,
  pageSize,
  isFiltered,
  lastUpdated,
  canExport = true,
}: CanonicalCustomersTableProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const state = React.useMemo(() => parseTableUrlState(searchParams.toString(), PARSE_OPTS), [searchParams]);
  const [selected, setSelected] = React.useState<string[]>([]);

  // SearchInput owns its own 250ms debounce; we mirror the committed value so
  // the box does not reset when the URL round-trips.
  const [searchValue, setSearchValue] = React.useState(state.q);
  React.useEffect(() => setSearchValue(state.q), [state.q]);

  const pushState = React.useCallback(
    (patch: Partial<typeof state>) => {
      const next = { ...state, ...patch };
      const query = new URLSearchParams();
      if (next.page && next.page !== 1) query.set("page", String(next.page));
      if (next.pageSize && next.pageSize !== 10) query.set("pageSize", String(next.pageSize));
      if (next.q) query.set("q", next.q);
      if (next.status && next.status !== "ALL") query.set("status", next.status);
      if (next.sort && next.sort !== PARSE_OPTS.defaultSort) query.set("sort", next.sort);
      if (next.direction && next.direction !== "desc") query.set("direction", next.direction);
      const qs = query.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, state],
  );

  const onSearch = React.useCallback(
    (value: string) => {
      pushState({ q: value, page: 1 });
      // ANA-009: query_length and result_count only — never the query, which may
      // contain a customer's email (PII).
      trackEvent("search_performed", { query_length: value.trim().length, result_count: total, scr: "SCR-009" });
    },
    [pushState, total],
  );

  const onStatusChange = React.useCallback(
    (value: string) => {
      pushState({ status: value, page: 1 });
      trackEvent("filter_applied", { filter_key: "status", result_count: total, scr: "SCR-009" });
    },
    [pushState, total],
  );

  const onSort = React.useCallback(
    (sortKey: string, direction: "asc" | "desc") => {
      pushState({ sort: sortKey, direction, page: 1 });
      trackEvent("filter_applied", { filter_key: `sort:${sortKey}`, result_count: total, scr: "SCR-009" });
    },
    [pushState, total],
  );

  const clearChip = React.useCallback(
    (key: string) => {
      if (key === "q") {
        setSearchValue("");
        pushState({ q: "", page: 1 });
      } else if (key === "status") {
        pushState({ status: "ALL", page: 1 });
      } else {
        pushState({ page: 1 });
      }
      trackEvent("filter_cleared", { filter_key: key, result_count: total, scr: "SCR-009" });
    },
    [pushState, total],
  );

  const clearAll = React.useCallback(() => {
    setSearchValue("");
    pushState({ q: "", status: "ALL", sort: PARSE_OPTS.defaultSort, direction: "desc", page: 1 });
    trackEvent("filter_cleared", { filter_key: "all", result_count: total, scr: "SCR-009" });
  }, [pushState, total]);

  // Columns are memoised so typing in the search box does not rebuild them
  // (spec §25 memoization requirement; keeps INP inside budget).
  const columns = React.useMemo<Column<Customer>[]>(
    () => [
      {
        id: "customer",
        header: "Customer",
        sortable: true,
        sortKey: "name",
        priority: 0,
        accessor: (row) => (
          <Link href={`/customers/${row.id}`} className="group block min-w-0 focus-visible:outline-none">
            <span className="block truncate text-sm font-medium text-[var(--on-surface)] group-hover:underline group-focus-visible:underline">
              {row.name}
            </span>
            <span className="block truncate text-xs text-[var(--on-surface-variant)]">{row.email}</span>
          </Link>
        ),
      },
      {
        id: "reference",
        header: "Reference",
        priority: 2,
        accessor: (row) => <span className="data-mono text-xs text-[var(--on-surface-variant)]">{row.referenceId}</span>,
      },
      {
        id: "status",
        header: "Status",
        priority: 0,
        accessor: (row) => <CustomerStatusPill status={row.status} />,
      },
      {
        id: "payments",
        header: "Payments",
        sortable: false,
        priority: 1,
        accessor: (row) => (
          <span className="data-mono text-sm text-[var(--on-surface)]" title={`${row.succeededCount} succeeded, ${row.failedCount} failed`}>
            {formatNumber(row.paymentCount)}
          </span>
        ),
      },
      {
        id: "ltv",
        header: "Lifetime value",
        sortable: true,
        sortKey: "ltv",
        priority: 1,
        className: "text-right",
        accessor: (row) => <span className="data-mono text-sm text-[var(--on-surface)]">{formatMoney(row.lifetimeValue, row.currency)}</span>,
      },
      {
        id: "added",
        header: "Added",
        sortable: true,
        sortKey: "added",
        priority: 2,
        accessor: (row) => <span className="text-xs text-[var(--on-surface-variant)]">{formatDateLong(row.createdAt)}</span>,
      },
      {
        id: "last_seen",
        header: "Last activity",
        sortable: true,
        sortKey: "recent",
        priority: 2,
        accessor: (row) => <span className="text-xs text-[var(--on-surface-variant)]">{row.lastSeenAt ? formatDateLong(row.lastSeenAt) : "—"}</span>,
      },
      {
        id: "actions",
        header: "",
        priority: 0,
        className: "text-right",
        accessor: (row) => <CustomerRowActions id={row.id} name={row.name} email={row.email} status={row.status} />,
      },
    ],
    [],
  );

  const bulkActions = React.useMemo(() => {
    if (!canExport) return undefined;
    return (
      <BulkBar
        count={selected.length}
        scopeLabel="page scope"
        onClear={() => setSelected([])}
        actions={[
          {
            label: "Export selected",
            icon: "download",
            onClick: () => {
              // The export route re-checks `customer.read` server-side (BE-004);
              // hiding the button is a courtesy, not the control.
              const ids = selected.join(",");
              window.location.href = `/api/exports/customers?ids=${encodeURIComponent(ids)}`;
            },
          },
        ]}
      />
    );
  }, [canExport, selected]);

  // Freshness: derive the age from the server's own read timestamp, and tick it
  // locally so the banner appears without a refetch. `now` state keeps the
  // re-render scoped to this component.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!lastUpdated) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [lastUpdated]);
  const ageSeconds = lastUpdated ? Math.max(0, Math.floor((now - new Date(lastUpdated).getTime()) / 1000)) : null;

  return (
    <div className="space-y-3" data-testid="canonical-customers-table">
      {ageSeconds !== null && ageSeconds > STALE_AFTER_SECONDS ? (
        <StaleBanner
          ageSeconds={ageSeconds}
          onRefresh={() => {
            trackEvent("stale_refreshed", { age_sec: ageSeconds, scr: "SCR-009" });
            router.refresh();
          }}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={searchValue}
          onChange={(value) => {
            setSearchValue(value);
            onSearch(value);
          }}
          placeholder="Search by name, email or reference…"
          ariaLabel="Search customers"
          className="w-full sm:w-72"
        />
        <label className="flex items-center gap-2 text-sm text-[var(--on-surface-variant)]">
          <span className="sr-only sm:not-sr-only">Status</span>
          <select
            value={state.status}
            onChange={(e) => onStatusChange(e.target.value)}
            aria-label="Filter by status"
            className="h-9 rounded-md border border-[var(--outline-variant)] bg-[var(--surface)] px-2 text-sm text-[var(--on-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            {CUSTOMER_STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value === "ALL" ? "All statuses" : value.charAt(0) + value.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <FilterBar chips={toFilterChips(state)} activeCount={activeFilterCount(state)} onClearChip={clearChip} onClearAll={clearAll} />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)]">
        {bulkActions}
        <CanonicalDataTable<Customer>
          columns={columns}
          rows={data}
          rowKey={(row) => row.id}
          caption="Customers directory"
          sort={state.sort}
          direction={state.direction}
          onSort={onSort}
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={pageSize}
          onPageChange={(next) => pushState({ page: next })}
          selectable={canExport}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          isFiltered={isFiltered}
          emptyTitle="No customers yet"
          emptyDescription="Customers appear here as soon as a payment succeeds. You can also add one manually."
          emptyAction={
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              render={<Link href="/customers?new=1" />}
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden>
                person_add
              </span>
              Add customer
            </Button>
          }
          filteredEmptyTitle="No customers match those filters"
          filteredEmptyDescription="Try a different search term, or clear the filters to see the whole directory."
          cardRenderer={(row) => (
            <div className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/customers/${row.id}`} className="min-w-0 group">
                  <span className="block truncate text-sm font-medium text-[var(--on-surface)] group-hover:underline">{row.name}</span>
                  <span className="block truncate text-xs text-[var(--on-surface-variant)]">{row.email}</span>
                </Link>
                <CustomerStatusPill status={row.status} />
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="data-mono text-[var(--on-surface-variant)]">{row.referenceId}</span>
                <span className="data-mono font-medium text-[var(--on-surface)]">{formatMoney(row.lifetimeValue, row.currency)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-[var(--on-surface-variant)]">
                <span>{formatNumber(row.paymentCount)} payments</span>
                <span>Added {formatDateLong(row.createdAt)}</span>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
}

export default CanonicalCustomersTable;
