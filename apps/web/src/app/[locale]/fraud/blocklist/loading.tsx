import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";

export default function BlocklistLoading() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6" aria-busy="true" aria-label="Loading blocklist">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 bg-[var(--surface-container-high)]" />
          <Skeleton className="h-4 w-96 max-w-full bg-[var(--surface-container-low)]" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-28 bg-[var(--surface-container-low)]" />
          <Skeleton className="h-9 w-24 bg-[var(--surface-container-low)]" />
        </div>
      </div>
      <TableSkeleton rows={5} columns={5} />
    </main>
  );
}
