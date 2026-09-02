"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS_LABELS } from "@/lib/subscription-status";

/**
 * Subscriptions toolbar (ADR-0021) — the prototype's decorative "Filter"
 * button and unwired search input, now backed by URL state (`q`, `status`),
 * mirroring the customer directory pattern.
 */
export function SubscriptionFilters({ resultCount }: { resultCount: number }) {
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

  React.useEffect(() => {
    setQuery((prev) => (prev === urlQuery ? prev : urlQuery));
  }, [urlQuery]);

  React.useEffect(() => {
    if (query === urlQuery) return;
    const t = setTimeout(() => push((p) => (query ? p.set("q", query) : p.delete("q"))), 350);
    return () => clearTimeout(t);
  }, [query, urlQuery, push]);

  const status = searchParams.get("status") ?? "ALL";
  const hasFilters = status !== "ALL" || urlQuery.length > 0;

  return (
    <div className="flex flex-col items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] px-4 py-3 sm:flex-row">
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <div className="relative w-full sm:w-64">
          <span
            className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] text-[18px]"
            aria-hidden="true"
          >
            {isPending ? <Spinner className="size-4" /> : "search"}
          </span>
          <Input
            placeholder="Search plan, customer, ID…"
            aria-label="Search subscriptions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] pl-9 pr-4 body-sm"
          />
        </div>
        <NativeSelect
          value={status}
          onChange={(e) =>
            push((p) => (e.target.value === "ALL" ? p.delete("status") : p.set("status", e.target.value)))
          }
          aria-label="Filter subscriptions by status"
          className="h-9 w-full border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-[var(--on-surface)] sm:w-44"
        >
          <NativeSelectOption value="ALL">All statuses</NativeSelectOption>
          {SUBSCRIPTION_STATUSES.map((s) => (
            <NativeSelectOption key={s} value={s}>
              {SUBSCRIPTION_STATUS_LABELS[s]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {hasFilters ? (
          <button
            className="body-sm text-[var(--primary)] hover:underline"
            onClick={() => push((p) => void (p.delete("q"), p.delete("status")))}
          >
            Clear ({resultCount})
          </button>
        ) : (
          <span className="body-sm text-[var(--on-surface-variant)]">{resultCount} plans</span>
        )}
      </div>
    </div>
  );
}
