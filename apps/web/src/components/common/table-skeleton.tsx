import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/layout/data-table";

// Reusable table skeleton so every ledger surface has a real loading shape
// instead of a layout-shifting spinner.
export function TableSkeleton({ rows = 6, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <DataTable aria-busy="true" aria-label="Loading transactions">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] p-4">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28 bg-[var(--surface-container-low)]" />
          <Skeleton className="h-8 w-32 bg-[var(--surface-container-low)]" />
          <Skeleton className="h-8 w-28 bg-[var(--surface-container-low)]" />
        </div>
        <Skeleton className="h-8 w-64 bg-[var(--surface-container-low)]" />
      </div>
      <div className="divide-y divide-[var(--border-subtle)]">
        <div className="grid gap-4 bg-[var(--surface-container-low)] px-4 py-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}>
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-20 bg-[var(--surface-container-high)]" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid gap-4 px-4 py-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}>
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={c}
                className="h-4 bg-[var(--surface-container-low)]"
                style={{ width: `${c === columns - 1 ? 40 : 60 + ((r + c) % 3) * 12}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </DataTable>
  );
}
