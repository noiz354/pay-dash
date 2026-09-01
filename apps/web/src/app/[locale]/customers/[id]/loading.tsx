import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";

export default function CustomerDetailLoading() {
  return (
    <main className="mx-auto w-full max-w-[var(--container-max)] space-y-6 p-[var(--gutter)]" aria-busy="true">
      <Skeleton className="h-4 w-64 bg-[var(--surface-container-low)]" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded bg-[var(--surface-container-high)]" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56 bg-[var(--surface-container-high)]" />
          <Skeleton className="h-4 w-72 bg-[var(--surface-container-low)]" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
      </div>
      <TableSkeleton rows={5} columns={6} />
    </main>
  );
}
