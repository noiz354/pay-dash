import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";

export default function BalanceLoading() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6" aria-busy="true">
      <div className="flex justify-between items-end">
        <div>
          <Skeleton className="h-4 w-40 bg-[var(--surface-container-low)]" />
          <Skeleton className="mt-3 h-8 w-64 bg-[var(--surface-container-high)]" />
        </div>
        <Skeleton className="h-9 w-32 bg-[var(--surface-container-low)]" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 h-64 animate-pulse bg-[var(--surface-container-low)]" />
        <Card className="h-64 animate-pulse bg-[var(--surface-container-low)]" />
      </div>
      <TableSkeleton rows={10} columns={4} />
    </main>
  );
}
