import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";

export default function BillingLoading() {
  return (
    <main className="mx-auto max-w-container-max space-y-6 p-gutter" aria-busy="true">
      <Skeleton className="h-4 w-56 bg-[var(--surface-container-low)]" />
      <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64 bg-[var(--surface-container-high)]" />
          <Skeleton className="h-4 w-96 bg-[var(--surface-container-low)]" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="h-28 min-w-[200px] animate-pulse bg-[var(--surface-container-low)]" />
          <Card className="h-28 min-w-[240px] animate-pulse bg-[var(--surface-container-low)]" />
          <Card className="h-28 min-w-[220px] animate-pulse bg-[var(--surface-container-low)]" />
          <Card className="h-28 min-w-[200px] animate-pulse bg-[var(--surface-container-low)]" />
        </div>
      </div>
      <TableSkeleton rows={8} columns={5} />
    </main>
  );
}
