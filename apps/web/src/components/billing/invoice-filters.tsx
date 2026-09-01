"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

/**
 * Invoice toolbar. The prototype shipped a decorative "Filter" button; this
 * gives it a job with URL-driven state (`q`, `status`, `range`, `sort`) so a
 * filtered statement view is shareable and server-rendered.
 */
export function InvoiceFilters({ resultCount }: { resultCount: number }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = React.useState(urlQuery);

  const push = React.useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete("page");
      const qs = params.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams]
  );

  React.useEffect(() => {
    setQuery((prev) => (prev === urlQuery ? prev : urlQuery));
  }, [urlQuery]);

  React.useEffect(() => {
    if (query === urlQuery) return;
    const t = setTimeout(() => push((p) => (query ? p.set("q", query) : p.delete("q"))), 350);
    return () => clearTimeout(t);
  }, [query, urlQuery, push]);

  const status = searchParams.get("status") ?? "ALL";
  const range = searchParams.get("range") ?? "all";
  const sort = searchParams.get("sort") ?? "recent";
  const hasFilters = status !== "ALL" || range !== "all" || sort !== "recent" || query.length > 0;

  return (
    <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-bright)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onValueChange={(v) => push((p) => (v === "ALL" ? p.delete("status") : p.set("status", String(v))))}
        >
          <SelectTrigger
            size="sm"
            aria-label="Filter invoices by status"
            className="h-8 border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--on-surface)]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Status: All</SelectItem>
            <SelectItem value="PAID">Status: Paid</SelectItem>
            <SelectItem value="PENDING">Status: Pending</SelectItem>
            <SelectItem value="OVERDUE">Status: Overdue</SelectItem>
            <SelectItem value="DRAFT">Status: Accruing</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={range}
          onValueChange={(v) => push((p) => (v === "all" ? p.delete("range") : p.set("range", String(v))))}
        >
          <SelectTrigger
            size="sm"
            aria-label="Filter invoices by period"
            className="h-8 border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--on-surface)]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Period: All time</SelectItem>
            <SelectItem value="3m">Period: Last 3 months</SelectItem>
            <SelectItem value="6m">Period: Last 6 months</SelectItem>
            <SelectItem value="12m">Period: Last 12 months</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={sort}
          onValueChange={(v) => push((p) => (v === "recent" ? p.delete("sort") : p.set("sort", String(v))))}
        >
          <SelectTrigger
            size="sm"
            aria-label="Sort invoices"
            className="h-8 border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--on-surface)]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Sort: Most recent</SelectItem>
            <SelectItem value="amount">Sort: Largest amount</SelectItem>
            <SelectItem value="due">Sort: Due date</SelectItem>
          </SelectContent>
        </Select>

        <span className="body-sm flex items-center gap-2 text-[var(--on-surface-variant)]" aria-live="polite">
          {isPending ? <Spinner className="size-3.5" /> : null}
          <span className="data-mono text-xs">{resultCount.toLocaleString("en-US")} invoices</span>
        </span>

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[var(--primary)] hover:bg-[var(--surface-container-low)]"
            onClick={() => {
              setQuery("");
              startTransition(() => router.replace(pathname, { scroll: false }));
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      <div className="relative w-full lg:w-64">
        <span
          className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]"
          style={{ fontSize: 16 }}
          aria-hidden="true"
        >
          search
        </span>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search invoice ID or period..."
          aria-label="Search invoices"
          className="h-8 w-full border-[var(--border-subtle)] bg-[var(--surface-canvas)] pl-8 pr-8"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
