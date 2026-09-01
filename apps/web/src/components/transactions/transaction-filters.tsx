"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

// Ledger toolbar. All filter state lives in the URL (shareable, back-button
// friendly, server-rendered) and every change is wrapped in a transition so the
// table can show a pending/blurred state instead of freezing.
export function TransactionFilters({ resultCount }: { resultCount: number }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [query, setQuery] = React.useState(searchParams.get("q") ?? "");

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

  // Debounced free-text search.
  React.useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (query === current) return;
    const t = setTimeout(() => push((p) => (query ? p.set("q", query) : p.delete("q"))), 350);
    return () => clearTimeout(t);
  }, [query, push, searchParams]);

  const status = searchParams.get("status") ?? "ALL";
  const range = searchParams.get("range") ?? "all";
  const channel = searchParams.get("channel") ?? "ALL";
  const hasFilters = status !== "ALL" || range !== "all" || channel !== "ALL" || query.length > 0;

  return (
    <div className="flex flex-wrap gap-4 justify-between items-center p-4 border-b border-[var(--border-subtle)] bg-[var(--surface)]">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={status} onValueChange={(v) => push((p) => (v === "ALL" ? p.delete("status") : p.set("status", String(v))))}>
          <SelectTrigger size="sm" className="h-8 border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Status: All</SelectItem>
            <SelectItem value="SUCCEEDED">Status: Succeeded</SelectItem>
            <SelectItem value="PROCESSING">Status: Processing</SelectItem>
            <SelectItem value="PENDING">Status: Pending</SelectItem>
            <SelectItem value="FAILED">Status: Failed</SelectItem>
            <SelectItem value="REFUNDED">Status: Refunded</SelectItem>
          </SelectContent>
        </Select>

        <Select value={range} onValueChange={(v) => push((p) => (v === "all" ? p.delete("range") : p.set("range", String(v))))}>
          <SelectTrigger size="sm" className="h-8 border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Date: All time</SelectItem>
            <SelectItem value="7d">Date: Last 7 days</SelectItem>
            <SelectItem value="30d">Date: Last 30 days</SelectItem>
            <SelectItem value="90d">Date: Last 90 days</SelectItem>
          </SelectContent>
        </Select>

        <Select value={channel} onValueChange={(v) => push((p) => (v === "ALL" ? p.delete("channel") : p.set("channel", String(v))))}>
          <SelectTrigger size="sm" className="h-8 border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Channel: All</SelectItem>
            <SelectItem value="CARD">Channel: Card</SelectItem>
            <SelectItem value="ACH">Channel: ACH</SelectItem>
            <SelectItem value="VA">Channel: Virtual account</SelectItem>
            <SelectItem value="QRIS">Channel: QRIS</SelectItem>
            <SelectItem value="EWALLET">Channel: E-wallet</SelectItem>
          </SelectContent>
        </Select>

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

      <div className="flex items-center gap-3">
        <span className="body-sm text-[var(--on-surface-variant)] flex items-center gap-2" aria-live="polite">
          {isPending ? <Spinner className="size-3.5" /> : null}
          <span className="data-mono text-xs">{resultCount.toLocaleString("en-US")} results</span>
        </span>
        <div className="relative w-64">
          <span
            className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] text-[16px]"
            aria-hidden="true"
          >
            search
          </span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter this view…"
            aria-label="Search transactions"
            className="h-8 w-full pl-8 pr-8 bg-[var(--surface-canvas)] border-[var(--outline-variant)] text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]"
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
    </div>
  );
}
