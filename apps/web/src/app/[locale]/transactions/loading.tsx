import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";

export default function TransactionsLoading() {
  return (
    <main className="mx-auto w-full max-w-container-max p-gutter space-y-6" aria-busy="true">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 pt-2">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56 bg-[var(--surface-container-high)]" />
          <Skeleton className="h-4 w-72 bg-[var(--surface-container-low)]" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-32 bg-[var(--surface-container-low)]" />
          <Skeleton className="h-9 w-36 bg-[var(--primary)]/20" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
      </div>
      <TableSkeleton rows={10} columns={7} />
    </main>
  );
}
