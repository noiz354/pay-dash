import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";

export default function ReportsBuilderLoading() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6" aria-busy="true" aria-label="Loading reports builder">
      <div className="space-y-2">
        <Skeleton className="h-7 w-60 bg-[var(--surface-container-high)]" />
        <Skeleton className="h-4 w-[480px] max-w-full bg-[var(--surface-container-low)]" />
      </div>
      <Card className="p-6 space-y-4 bg-[var(--surface-container-lowest)] border-[var(--border-subtle)]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-10 w-full bg-[var(--surface-container-low)]" />
          <Skeleton className="h-10 w-full bg-[var(--surface-container-low)]" />
          <Skeleton className="h-10 w-full bg-[var(--surface-container-low)]" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-24 bg-[var(--surface-container-low)]" />
          <Skeleton className="h-9 w-24 bg-[var(--surface-container-low)]" />
        </div>
      </Card>
      <TableSkeleton rows={5} columns={6} />
    </main>
  );
}
