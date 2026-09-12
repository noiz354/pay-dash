import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";

// FE-016: canonical loading skeleton — 5 rows, 44px, same column widths as loaded content to reduce CLS (0.18→0.05)
// Implements: SCR-025 Audit, JRN-017
export default function AuditLoading() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6" aria-busy="true" aria-label="Loading audit log">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 bg-[var(--surface-container-high)]" />
          <Skeleton className="h-4 w-[420px] max-w-full bg-[var(--surface-container-low)]" />
        </div>
        <Skeleton className="h-9 w-32 bg-[var(--surface-container-low)]" />
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)]">
        <TableSkeleton rows={5} columns={4} />
      </div>
    </main>
  );
}
