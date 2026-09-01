import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";

export default function CustomersLoading() {
  return (
    <main className="mx-auto w-full max-w-[var(--container-max)] space-y-6 p-[var(--gutter)]" aria-busy="true">
      <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44 bg-[var(--surface-container-high)]" />
          <Skeleton className="h-4 w-80 bg-[var(--surface-container-low)]" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-28 bg-[var(--surface-container-low)]" />
          <Skeleton className="h-9 w-36 bg-[var(--primary)]/20" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
      </div>
      <TableSkeleton rows={10} columns={7} />
    </main>
  );
}
