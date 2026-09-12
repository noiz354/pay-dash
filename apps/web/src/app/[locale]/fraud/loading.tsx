import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";

// FE-016: canonical loading skeleton — matches Fraud Prevention header + 3 summary cards + panel
export default function FraudLoading() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6" aria-busy="true" aria-label="Loading fraud prevention">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44 bg-[var(--surface-container-high)]" />
          <Skeleton className="h-4 w-80 bg-[var(--surface-container-low)]" />
        </div>
        <Skeleton className="h-9 w-36 bg-[var(--surface-container-low)]" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
      </div>
      <div className="space-y-3">
        <div className="flex gap-2 border-b border-[var(--border-subtle)] pb-3">
          <Skeleton className="h-8 w-20 bg-[var(--surface-container-low)]" />
          <Skeleton className="h-8 w-20 bg-[var(--surface-container-low)]" />
          <Skeleton className="h-8 w-20 bg-[var(--surface-container-low)]" />
        </div>
        <TableSkeleton rows={5} columns={5} />
      </div>
    </main>
  );
}
