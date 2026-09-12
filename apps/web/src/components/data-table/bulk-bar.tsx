"use client";
import { Button } from "@/components/ui/button";

// Bulk bar — contextual when selection >0, permission-aware (caller filters actions)
export function BulkBar({
  count,
  actions,
  onClear,
  scopeLabel = "page scope",
}: {
  count: number;
  actions: Array<{ label: string; icon?: string; onClick: () => void; variant?: "default" | "outline" | "destructive"; disabled?: boolean }>;
  onClear: () => void;
  scopeLabel?: string;
}) {
  if (count === 0) return null;
  return (
    <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center justify-between gap-3 border-b bg-[var(--primary)]/5 px-4 py-3">
      <span className="text-sm font-medium">
        {count} selected — {scopeLabel}
      </span>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a.label} size="sm" variant={a.variant ?? "outline"} onClick={a.onClick} disabled={a.disabled} className="h-8 gap-1.5">
            {a.icon ? (
              <span className="material-symbols-outlined text-[16px]" aria-hidden>
                {a.icon}
              </span>
            ) : null}
            {a.label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={onClear} className="h-8">
          Clear
        </Button>
      </div>
    </div>
  );
}
