"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { PAYOUT_STATUSES, PAYOUT_STATUS_LABELS } from "@/lib/payout-status";

/**
 * Batch toolbar with URL-driven state (`q`, `status`, `range`, `sort`) so a
 * filtered payout view is shareable and server-rendered — the same contract the
 * transactions, customers and billing tables use.
 */
export function BatchFilters({ resultCount }: { resultCount: number }) {
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
        <NativeSelect
          size="sm"
          aria-label="Filter batches by status"
          value={status}
          onChange={(e) =>
            push((p) => (e.target.value === "ALL" ? p.delete("status") : p.set("status", e.target.value)))
          }
        >
          <NativeSelectOption value="ALL">Status: All</NativeSelectOption>
          {PAYOUT_STATUSES.map((s) => (
            <NativeSelectOption key={s} value={s}>
              Status: {PAYOUT_STATUS_LABELS[s]}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <NativeSelect
          size="sm"
          aria-label="Filter batches by date range"
          value={range}
          onChange={(e) =>
            push((p) => (e.target.value === "all" ? p.delete("range") : p.set("range", e.target.value)))
          }
        >
          <NativeSelectOption value="all">Range: All time</NativeSelectOption>
          <NativeSelectOption value="30d">Range: Last 30 days</NativeSelectOption>
          <NativeSelectOption value="90d">Range: Last 90 days</NativeSelectOption>
          <NativeSelectOption value="12m">Range: Last 12 months</NativeSelectOption>
        </NativeSelect>

        <NativeSelect
          size="sm"
          aria-label="Sort batches"
          value={sort}
          onChange={(e) =>
            push((p) => (e.target.value === "recent" ? p.delete("sort") : p.set("sort", e.target.value)))
          }
        >
          <NativeSelectOption value="recent">Sort: Newest</NativeSelectOption>
          <NativeSelectOption value="amount">Sort: Largest amount</NativeSelectOption>
          <NativeSelectOption value="recipients">Sort: Most recipients</NativeSelectOption>
        </NativeSelect>

        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-[var(--on-surface-variant)]"
            onClick={() => {
              setQuery("");
              startTransition(() => router.replace(pathname, { scroll: false }));
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <span className="body-sm flex items-center gap-2 text-[var(--on-surface-variant)]" aria-live="polite">
          {isPending ? <Spinner className="size-3.5" /> : null}
          {resultCount} batch{resultCount === 1 ? "" : "es"}
        </span>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search batch name or ID"
          aria-label="Search batches"
          className="h-8 w-56 border-[var(--outline-variant)] bg-[var(--surface)]"
        />
      </div>
    </div>
  );
}
