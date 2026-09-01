import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";

export default function PayoutsLoading() {
  return (
    <main className="mx-auto w-full max-w-container-max space-y-6 p-gutter" aria-busy="true">
      <Skeleton className="h-4 w-40 bg-[var(--surface-container-low)]" />
      <Skeleton className="h-8 w-56 bg-[var(--surface-container-high)]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-28 animate-pulse bg-[var(--surface-container-low)]" />
        ))}
      </div>
      <TableSkeleton rows={8} columns={6} />
    </main>
  );
}
