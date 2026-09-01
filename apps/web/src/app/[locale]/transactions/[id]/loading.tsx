import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function TransactionDetailLoading() {
  return (
    <main className="mx-auto w-full max-w-container-max p-gutter space-y-6" aria-busy="true">
      <Skeleton className="h-4 w-64 bg-[var(--surface-container-low)]" />
      <div className="flex justify-between items-end gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-72 bg-[var(--surface-container-high)]" />
          <Skeleton className="h-4 w-96 bg-[var(--surface-container-low)]" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 bg-[var(--surface-container-low)]" />
          <Skeleton className="h-9 w-28 bg-[var(--surface-container-low)]" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-5 p-5 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full bg-[var(--surface-container-low)]" />
          ))}
        </Card>
        <div className="lg:col-span-7 space-y-6">
          <Card className="h-36 animate-pulse bg-[var(--surface-container-low)]" />
          <Card className="h-64 animate-pulse bg-[var(--surface-container-low)]" />
        </div>
      </div>
    </main>
  );
}
