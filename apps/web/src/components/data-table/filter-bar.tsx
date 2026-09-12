"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Filter system: button + active count + chips + clear single + clear all
export type FilterChip = { key: string; label: string; value: string };

export function FilterBar({
  chips,
  onClearChip,
  onClearAll,
  onOpen,
  activeCount,
  className,
}: {
  chips: FilterChip[];
  onClearChip: (key: string) => void;
  onClearAll: () => void;
  onOpen?: () => void;
  activeCount: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {onOpen ? (
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onOpen} aria-label="Open filters">
          <span className="material-symbols-outlined text-[18px]" aria-hidden>
            tune
          </span>
          Filters {activeCount > 0 ? `(${activeCount})` : ""}
        </Button>
      ) : null}
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="Active filters">
          {chips.map((chip) => (
            <span key={`${chip.key}:${chip.value}`} role="listitem" className="inline-flex items-center gap-1 rounded-full border border-[var(--outline-variant)] bg-[var(--surface-container-high)] px-2.5 py-1 text-xs">
              {chip.label}
              <button
                type="button"
                aria-label={`Clear filter ${chip.label}`}
                onClick={() => onClearChip(chip.key)}
                className="ml-1 rounded-full p-0.5 hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                <span className="material-symbols-outlined text-[14px]" aria-hidden>
                  close
                </span>
              </button>
            </span>
          ))}
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearAll}>
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// Filter sheet for mobile/desktop panel (simplified)
export function FilterSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Filters">
      <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close filters" />
      <div className="absolute right-0 top-0 h-full w-[340px] max-w-[85vw] overflow-auto bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Filters</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-2 hover:bg-[var(--surface-container-high)]">
            <span className="material-symbols-outlined" aria-hidden>
              close
            </span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
