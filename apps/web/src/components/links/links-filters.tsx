"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { LINK_STATUSES, LINK_STATUS_LABELS } from "@/lib/link-status";

// Payment-link toolbar. All filter state lives in the URL (shareable,
// back-button friendly, server-rendered) — the same contract as the balance,
// ledger and batch toolbars. `kind` is owned by the Single/Multiple tabs;
// this toolbar only adds `q` and `status`.
export function LinksFilters({ resultCount }: { resultCount: number }) {
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

  React.useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (query === current) return;
    const t = setTimeout(() => push((p) => (query ? p.set("q", query) : p.delete("q"))), 350);
    return () => clearTimeout(t);
  }, [query, push, searchParams]);

  const status = searchParams.get("status") ?? "all";
  const hasFilters = status !== "all" || (searchParams.get("q") ?? "").length > 0;

  const selectClass = "h-8 border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]";

  return (
    <div className="flex flex-wrap gap-3 justify-between items-center p-4 border-b border-[var(--border-subtle)] bg-[var(--surface)]">
      <div className="flex flex-wrap gap-2 items-center">
        <NativeSelect
          aria-label="Filter links by status"
          value={status}
          onChange={(e) => push((p) => (e.target.value === "all" ? p.delete("status") : p.set("status", e.target.value)))}
          className={selectClass}
        >
          <NativeSelectOption value="all">Status: All</NativeSelectOption>
          {LINK_STATUSES.map((s) => (
            <NativeSelectOption key={s} value={s}>
              {LINK_STATUS_LABELS[s]}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[var(--primary)] hover:bg-[var(--surface-container-low)]"
            onClick={() => {
              setQuery("");
              startTransition(() => {
                const params = new URLSearchParams(searchParams.toString());
                params.delete("q");
                params.delete("status");
                params.delete("page");
                const qs = params.toString();
                router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
              });
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <span className="body-sm text-[var(--on-surface-variant)] flex items-center gap-2" aria-live="polite">
          {isPending ? <Spinner className="size-3.5" /> : null}
          <span className="data-mono text-xs">
            {resultCount.toLocaleString("en-US")} link{resultCount === 1 ? "" : "s"}
          </span>
        </span>
        <div className="relative w-56">
          <span
            className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] text-[16px]"
            aria-hidden="true"
          >
            search
          </span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ID or email…"
            aria-label="Search links"
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
