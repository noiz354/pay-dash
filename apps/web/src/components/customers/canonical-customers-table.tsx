"use client";
import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CanonicalDataTable, type Column, type DataTableProps } from "@/components/data-table/canonical-data-table";
import { FilterBar } from "@/components/data-table/filter-bar";
import { SearchInput } from "@/components/data-table/search-input";
import { BulkBar } from "@/components/data-table/bulk-bar";
import { StaleBanner } from "@/components/data-table/stale-banner";
import { parseTableUrlState, serializeTableUrlState, toFilterChips, activeFilterCount } from "@/lib/table-url-state";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { CustomerRowActions } from "./customer-row-actions";
import { CustomerStatusPill } from "./customer-status-pill";
import { formatIDR } from "@/lib/format";
import type { Customer } from "@/server/data/customers";

// Canonical Customers Table — CMP-005 integration for Customers (FE-012)
// Supports: search, filter (status), sort, pagination, URL state, bulk export, mobile cards

type CustomerTableProps = {
  data: Customer[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  isFiltered: boolean;
  lastUpdated?: Date;
};

const CUSTOMER_STATUSES = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "REVIEW", label: "Review" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "BLOCKED", label: "Blocked" },
] as const;

const CUSTOMER_SORTS = [
  { value: "recent", label: "Recent" },
  { value: "name", label: "Name" },
  { value: "ltv", label: "Lifetime Value" },
  { value: "added", label: "Date Added" },
] as const;

export function CanonicalCustomersTable({
  data,
  total,
  page,
  pageCount,
  pageSize,
  isFiltered,
  lastUpdated,
}: CustomerTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Parse URL state
  const urlState = parseTableUrlState(searchParams.toString(), {
    allowedStatuses: CUSTOMER_STATUSES.map(s => s.value),
    allowedSorts: CUSTOMER_SORTS.map(s => s.value),
    defaultSort: "recent",
    defaultDirection: "desc",
  });

  // Sync with URL
  const [state, setState] = React.useState(urlState);
  
  React.useEffect(() => {
    setState(parseTableUrlState(searchParams.toString(), {
      allowedStatuses: CUSTOMER_STATUSES.map(s => s.value),
      allowedSorts: CUSTOMER_SORTS.map(s => s.value),
      defaultSort: "recent",
      defaultDirection: "desc",
    }));
  }, [searchParams]);

  // Debounced search
  const [searchValue, setSearchValue] = React.useState(state.q);
  const debouncedSearch = useDebouncedValue(searchValue, 250);
  
  React.useEffect(() => {
    if (debouncedSearch !== state.q) {
      updateUrl({ q: debouncedSearch, page: 1 });
    }
  }, [debouncedSearch]);

  // Selection state (page-scoped)
  const [selectedKeys, setSelectedKeys] = React.useState<string[]>([]);

  // Update URL helper
  const updateUrl = React.useCallback((updates: Partial<typeof state>) => {
    const newState = { ...state, ...updates };
    const query = serializeTableUrlState(newState, {
      allowedStatuses: CUSTOMER_STATUSES.map(s => s.value),
      allowedSorts: CUSTOMER_SORTS.map(s => s.value),
    });
    router.replace(`${pathname}${query}`, { scroll: false });
  }, [pathname, state, router]);

  // Handle sort
  const handleSort = React.useCallback((sort: string, direction: "asc" | "desc") => {
    updateUrl({ sort, direction, page: 1 });
  }, [updateUrl]);

  // Handle page change
  const handlePageChange = React.useCallback((newPage: number) => {
    updateUrl({ page: newPage });
  }, [updateUrl]);

  // Handle page size change
  const handlePageSizeChange = React.useCallback((size: number) => {
    updateUrl({ pageSize: size, page: 1 });
  }, [updateUrl]);

  // Handle filter change
  const handleFilterChange = React.useCallback((key: string, value: string) => {
    const newState = { ...state, [key]: value, page: 1 };
    if (key === "status" && value === "ALL") {
      delete newState.status;
    }
    updateUrl(newState);
  }, [state, updateUrl]);

  // Handle clear all filters
  const handleClearAll = React.useCallback(() => {
    updateUrl({ q: "", status: "ALL", page: 1 });
    setSearchValue("");
  }, [updateUrl]);

  // Handle clear single filter
  const handleClearFilter = React.useCallback((key: string) => {
    if (key === "q") {
      setSearchValue("");
      updateUrl({ q: "", page: 1 });
    } else {
      updateUrl({ [key]: "ALL", page: 1 });
    }
  }, [updateUrl]);

  // Columns definition
  const columns: Column<Customer>[] = [
    {
      id: "customer",
      header: "Customer",
      accessor: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-[var(--surface-container-low)] flex items-center justify-center">
            <span className="text-xs font-semibold text-[var(--on-surface-variant)]">
              {row.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <div className="body-md truncate font-medium text-[var(--on-surface)]">{row.name}</div>
            <div className="body-sm truncate text-[var(--on-surface-variant)]">{row.email}</div>
          </div>
        </div>
      ),
      sortable: true,
      sortKey: "name",
      priority: 0,
    },
    {
      id: "ref",
      header: "Reference",
      accessor: (row) => <span className="data-mono text-[var(--on-surface-variant)]">{row.ref}</span>,
      sortable: true,
      sortKey: "ref",
      priority: 0,
    },
    {
      id: "status",
      header: "Status",
      accessor: (row) => <CustomerStatusPill status={row.status} />,
      sortable: true,
      sortKey: "status",
      priority: 0,
    },
    {
      id: "added",
      header: "Added",
      accessor: (row) => (
        <span className="body-sm text-[var(--on-surface-variant)]">{new Date(row.createdAt).toLocaleDateString("id-ID")}</span>
      ),
      sortable: true,
      sortKey: "added",
      priority: 1,
    },
    {
      id: "ltv",
      header: "LTV",
      accessor: (row) => (
        <span className="text-right data-mono tabular-nums text-[var(--on-surface)]">
          {formatIDR(row.lifetimeValue)}
        </span>
      ),
      sortable: true,
      sortKey: "ltv",
      priority: 1,
      className: "text-right",
    },
    {
      id: "transactions",
      header: "Transactions",
      accessor: (row) => (
        <span className="text-right data-mono text-[var(--on-surface-variant)]">
          {row.transactionCount}
        </span>
      ),
      sortable: true,
      sortKey: "transactions",
      priority: 2,
      className: "text-right",
    },
  ];

  // Card renderer for mobile
  const cardRenderer = (row: Customer) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded bg-[var(--surface-container-low)] flex items-center justify-center shrink-0">
          <span className="text-sm font-semibold text-[var(--on-surface-variant)]">
            {row.name.slice(0, 2).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="body-md font-medium text-[var(--on-surface)] truncate">{row.name}</div>
          <div className="body-sm text-[var(--on-surface-variant)] truncate">{row.email}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 body-sm">
        <span className="data-mono text-[var(--on-surface-variant)]">Ref: {row.ref}</span>
        <CustomerStatusPill status={row.status} />
      </div>
      <div className="flex justify-between body-sm">
        <span className="text-[var(--on-surface-variant)]">Added: {new Date(row.createdAt).toLocaleDateString("id-ID")}</span>
        <span className="data-mono text-[var(--on-surface)]">LTV: {formatIDR(row.lifetimeValue)}</span>
      </div>
    </div>
  );

  // Filter chips
  const chips = toFilterChips(state);

  // Bulk actions (only export for customers)
  const bulkActions = selectedKeys.length > 0 ? (
    <BulkBar
      count={selectedKeys.length}
      actions={[
        <button
          key="export"
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded hover:bg-[var(--surface-container-low)]"
          onClick={() => {
            // Export selected customers
            const ids = selectedKeys.join(",");
            window.location.href = `/api/exports/customers?ids=${ids}`;
          }}
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          Export Selected
        </button>,
      ]}
    />
  ) : null;

  // Calculate last updated age
  const lastUpdatedAge = lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000) : null;

  return (
    <div className="space-y-4">
      {/* Stale Banner */}
      {lastUpdatedAge !== null && lastUpdatedAge > 60 && (
        <StaleBanner
          ageSeconds={lastUpdatedAge}
          onRefresh={() => window.location.reload()}
        />
      )}

      {/* Filter Bar */}
      <FilterBar
        chips={chips}
        activeCount={activeFilterCount(state)}
        onClearAll={handleClearAll}
        onClearFilter={handleClearFilter}
      >
        <SearchInput
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onClear={() => {
            setSearchValue("");
            updateUrl({ q: "", page: 1 });
          }}
          placeholder="Search customers by name or email..."
          debounce={250}
        />
        <select
          value={state.status}
          onChange={(e) => handleFilterChange("status", e.target.value)}
          aria-label="Filter by status"
          className="h-9 rounded border border-[var(--outline-variant)] bg-white px-3 text-sm"
        >
          {CUSTOMER_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={state.sort}
          onChange={(e) => handleSort(e.target.value, state.direction === "asc" ? "desc" : "asc")}
          aria-label="Sort by"
          className="h-9 rounded border border-[var(--outline-variant)] bg-white px-3 text-sm"
        >
          {CUSTOMER_SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </FilterBar>

      {/* Data Table */}
      <CanonicalDataTable
        columns={columns}
        rows={data}
        rowKey={(row) => row.id}
        sort={state.sort}
        direction={state.direction}
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        onSort={handleSort}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        selectedKeys={selectedKeys}
        onSelectionChange={setSelectedKeys}
        selectable={true}
        bulkActions={bulkActions}
        isFiltered={isFiltered}
        emptyTitle="No customers yet"
        emptyDescription="Create your first customer to start tracking payments and lifetime value."
        filteredEmptyTitle="No customers match your filters"
        filteredEmptyDescription="Try adjusting your search or filters to find what you're looking for."
        cardRenderer={cardRenderer}
        caption="Customers directory"
        loading={false}
      />
    </div>
  );
}
