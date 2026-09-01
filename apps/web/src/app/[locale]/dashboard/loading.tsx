import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 bg-[var(--surface-container-high)]" />
          <Skeleton className="h-4 w-64 bg-[var(--surface-container-low)]" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 bg-[var(--surface-container-low)]" />
          <Skeleton className="h-9 w-36 bg-[var(--primary)]/20" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-4 p-5 min-w-0 overflow-hidden">
          <Skeleton className="h-5 w-24 mb-4 bg-[var(--surface-container-high)]" />
          <Skeleton className="h-2 w-full mb-6 bg-[var(--surface-container-high)]" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full bg-[var(--surface-container-low)]" />
            <Skeleton className="h-4 w-full bg-[var(--surface-container-low)]" />
            <Skeleton className="h-16 w-full bg-[var(--surface-container-low)]" />
          </div>
        </Card>
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-32 w-full bg-[var(--surface-container-low)] rounded-xl" />
          <Skeleton className="h-32 w-full bg-[var(--surface-container-low)] rounded-xl" />
          <Skeleton className="h-32 w-full bg-[var(--surface-container-low)] rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-[200px] w-full rounded-lg border bg-white animate-pulse" aria-label="Loading 3D hero" />
      <Card className="p-5">
        <Skeleton className="h-[280px] w-full bg-[var(--surface-container-low)] rounded-lg animate-pulse" aria-label="Loading chart" />
      </Card>
    </main>
  );
}
