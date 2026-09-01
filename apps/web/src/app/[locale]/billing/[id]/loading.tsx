import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";

export default function InvoiceDetailLoading() {
  return (
    <main className="mx-auto w-full max-w-container-max space-y-6 p-gutter" aria-busy="true">
      <Skeleton className="h-4 w-64 bg-[var(--surface-container-low)]" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72 bg-[var(--surface-container-high)]" />
          <Skeleton className="h-4 w-96 bg-[var(--surface-container-low)]" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-48 bg-[var(--surface-container-low)]" />
          <Skeleton className="h-10 w-32 bg-[var(--primary)]/20" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
        <Card className="h-24 animate-pulse bg-[var(--surface-container-low)]" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="h-48 animate-pulse bg-[var(--surface-container-low)]" />
          <TableSkeleton rows={5} columns={6} />
        </div>
        <Card className="h-64 animate-pulse bg-[var(--surface-container-low)]" />
      </div>
    </main>
  );
}
