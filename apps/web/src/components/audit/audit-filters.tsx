"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUDIT_CATEGORIES, AUDIT_RANGES, AUDIT_STATUSES } from "@/lib/audit-options";

/**
 * Audit log toolbar (ADR-0026) — the prototype's uncontrolled search, range,
 * category and status controls, now backed by URL state (`q`, `category`,
 * `status`, `range`). ⌘K focuses the search box (the prototype's hint had no
 * handler).
 */
export function AuditFilters({
  resultCount,
}: {
  resultCount: number;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = React.useState(urlQuery);
  const searchRef = React.useRef<HTMLInputElement>(null);

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

  // ⌘K / Ctrl+K focuses the search box.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const category = searchParams.get("category") ?? "ALL";
  const status = searchParams.get("status") ?? "ALL";
  const range = searchParams.get("range") ?? "all";
  const hasFilters = category !== "ALL" || status !== "ALL" || range !== "all" || query.length > 0;

  return (
    <div className="flex flex-col items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] px-4 py-3 lg:flex-row">
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <Select
          value={category}
          onValueChange={(v) =>
            push((p) => (v === "ALL" ? p.delete("category") : p.set("category", String(v))))
          }
        >
          <SelectTrigger
            size="sm"
            aria-label="Filter events by category"
            className="h-8 border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--on-surface)]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Category: All</SelectItem>
            {AUDIT_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                Category: {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(v) => push((p) => (v === "ALL" ? p.delete("status") : p.set("status", String(v))))}
        >
          <SelectTrigger
            size="sm"
            aria-label="Filter events by status"
            className="h-8 border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--on-surface)]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Status: All</SelectItem>
            {AUDIT_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                Status: {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={range}
          onValueChange={(v) => push((p) => (v === "all" ? p.delete("range") : p.set("range", String(v))))}
        >
          <SelectTrigger
            size="sm"
            aria-label="Filter events by date range"
            className="h-8 border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--on-surface)]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUDIT_RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="mx-1 hidden h-4 w-px bg-[var(--border-subtle)] sm:block" aria-hidden="true" />
        <span className="body-sm flex items-center gap-2 text-[var(--on-surface-variant)]" aria-live="polite">
          {isPending ? <Spinner className="size-3.5" /> : null}
          <span className="data-mono text-xs">
            {resultCount.toLocaleString("en-US")} event{resultCount === 1 ? "" : "s"}
          </span>
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

      <div className="relative w-full sm:w-72">
        <span
          className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]"
          style={{ fontSize: 16 }}
          aria-hidden="true"
        >
          search
        </span>
        <Input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search actions, resources, details..."
          aria-label="Search audit events"
          className="h-8 w-full border-[var(--border-subtle)] bg-[var(--surface-canvas)] pl-8 pr-12"
        />
        <span
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-[var(--outline-variant)] px-1 py-0.5 font-data-mono text-[10px] leading-none text-[var(--outline-variant)]"
          aria-hidden="true"
        >
          ⌘K
        </span>
      </div>
    </div>
  );
}
