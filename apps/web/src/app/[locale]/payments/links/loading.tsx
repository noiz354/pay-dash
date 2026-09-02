import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";

export default function PaymentLinksLoading() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6" aria-busy="true">
      <div className="flex justify-between items-end">
        <div>
          <Skeleton className="h-9 w-64 bg-[var(--surface-container-high)]" />
          <Skeleton className="mt-2 h-4 w-96 bg-[var(--surface-container-low)]" />
        </div>
        <Skeleton className="h-9 w-32 bg-[var(--surface-container-low)]" />
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)]">
        <div className="h-14 border-b border-[var(--border-subtle)] bg-[var(--surface-canvas)]" />
        <TableSkeleton rows={8} columns={6} />
      </div>
    </main>
  );
}
