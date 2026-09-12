"use client";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Spec: 250ms debounce, clear, loading, no results, keyboard focus, URL sync (parent handles URL)
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  ariaLabel = "Search",
  loading = false,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  loading?: boolean;
  className?: string;
}) {
  const [local, setLocal] = React.useState(value);
  React.useEffect(() => setLocal(value), [value]);

  // 250ms debounce per spec
  React.useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => onChange(local), 250);
    return () => clearTimeout(t);
  }, [local, value, onChange]);

  return (
    <div className={cn("relative", className)}>
      <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-[var(--on-surface-variant)]" aria-hidden>
        search
      </span>
      <Input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-8 pl-8 pr-8"
        onKeyDown={(e) => {
          if (e.key === "/" && (e.metaKey || e.ctrlKey)) return;
          if (e.key === "Escape") setLocal("");
        }}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {loading ? <span className="size-3.5 animate-spin rounded-full border-2 border-[var(--outline-variant)] border-t-[var(--primary)]" aria-hidden /> : null}
        {local ? (
          <button type="button" aria-label="Clear search" onClick={() => setLocal("")} className="rounded p-0.5 hover:bg-[var(--surface-container-high)]">
            <span className="material-symbols-outlined text-[16px]" aria-hidden>
              close
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
