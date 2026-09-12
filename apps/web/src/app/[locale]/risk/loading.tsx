import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function RiskLoading() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6" aria-busy="true" aria-label="Loading risk and velocity">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56 bg-[var(--surface-container-high)]" />
          <Skeleton className="h-4 w-80 bg-[var(--surface-container-low)]" />
        </div>
        <Skeleton className="h-8 w-32 bg-[var(--surface-container-low)]" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="space-y-6 lg:col-span-8">
          <Card className="h-40 animate-pulse bg-[var(--surface-container-low)]" />
          <Card className="h-64 animate-pulse bg-[var(--surface-container-low)]" />
        </div>
        <div className="lg:col-span-4">
          <Card className="h-96 animate-pulse bg-[var(--surface-container-low)]" />
        </div>
      </div>
    </main>
  );
}
