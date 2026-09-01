"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

/**
 * Customer directory toolbar — the prototype's decorative "Filter" button and
 * unwired search input, now backed by URL state (`q`, `status`, `sort`).
 * A `?q=` arriving from a transaction detail page pre-fills the search box.
 */
export function CustomerFilters({ resultCount }: { resultCount: number }) {
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
      params.delete("page"); // any filter change resets pagination
      const qs = params.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams]
  );

  // Keep the box in sync when the URL changes underneath us (deep link, back).
  React.useEffect(() => {
    setQuery((prev) => (prev === urlQuery ? prev : urlQuery));
  }, [urlQuery]);

  // Debounced free-text search.
  React.useEffect(() => {
    if (query === urlQuery) return;
    const t = setTimeout(() => push((p) => (query ? p.set("q", query) : p.delete("q"))), 350);
    return () => clearTimeout(t);
  }, [query, urlQuery, push]);

  const status = searchParams.get("status") ?? "ALL";
  const sort = searchParams.get("sort") ?? "recent";
  const hasFilters = status !== "ALL" || sort !== "recent" || query.length > 0;

  return (
    <div className="flex flex-col items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] px-4 py-3 sm:flex-row">
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <Select
          value={status}
          onValueChange={(v) => push((p) => (v === "ALL" ? p.delete("status") : p.set("status", String(v))))}
        >
          <SelectTrigger
            size="sm"
            aria-label="Filter customers by status"
            className="h-8 border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--on-surface)]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Status: All</SelectItem>
            <SelectItem value="ACTIVE">Status: Active</SelectItem>
            <SelectItem value="REVIEW">Status: Review</SelectItem>
            <SelectItem value="NEW">Status: New</SelectItem>
            <SelectItem value="BLOCKED">Status: Archived</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={sort}
          onValueChange={(v) => push((p) => (v === "recent" ? p.delete("sort") : p.set("sort", String(v))))}
        >
          <SelectTrigger
            size="sm"
            aria-label="Sort customers"
            className="h-8 border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--on-surface)]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Sort: Most recent</SelectItem>
            <SelectItem value="ltv">Sort: Highest LTV</SelectItem>
            <SelectItem value="name">Sort: Name A–Z</SelectItem>
          </SelectContent>
        </Select>

        <div className="mx-1 hidden h-4 w-px bg-[var(--border-subtle)] sm:block" aria-hidden="true" />
        <span className="body-sm flex items-center gap-2 text-[var(--on-surface-variant)]" aria-live="polite">
          {isPending ? <Spinner className="size-3.5" /> : null}
          <span className="data-mono text-xs">{resultCount.toLocaleString("en-US")} Total</span>
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

      <div className="relative w-full sm:w-64">
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
          placeholder="Search by name or email..."
          aria-label="Search customers"
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
