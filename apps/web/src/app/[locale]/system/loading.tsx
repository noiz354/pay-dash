import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";

export default function SystemLoading() {
  return (
    <main className="mx-auto w-full max-w-container-max p-gutter space-y-6" aria-busy="true" aria-label="Loading system status">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40 bg-[var(--surface-container-high)]" />
          <Skeleton className="h-4 w-96 max-w-full bg-[var(--surface-container-low)]" />
        </div>
        <Skeleton className="h-8 w-44 bg-[var(--surface-container-low)]" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="h-32 animate-pulse bg-[var(--surface-container-low)]" />
        <Card className="h-32 animate-pulse bg-[var(--surface-container-low)]" />
        <Card className="h-32 animate-pulse bg-[var(--surface-container-low)]" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-32 bg-[var(--surface-container-high)]" />
        <TableSkeleton rows={5} columns={4} />
      </div>
    </main>
  );
}
