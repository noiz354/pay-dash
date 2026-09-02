import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";

export default function WebhooksLoading() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6" aria-busy="true">
      <div className="flex justify-between items-end">
        <div>
          <Skeleton className="h-9 w-56 bg-[var(--surface-container-high)]" />
          <Skeleton className="mt-2 h-4 w-96 bg-[var(--surface-container-low)]" />
        </div>
        <Skeleton className="h-9 w-44 bg-[var(--surface-container-low)]" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl bg-[var(--surface-container-low)]" />
      <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)]">
        <div className="h-14 border-b border-[var(--border-subtle)] bg-[var(--surface-canvas)]" />
        <TableSkeleton rows={8} columns={4} />
      </div>
    </main>
  );
}
