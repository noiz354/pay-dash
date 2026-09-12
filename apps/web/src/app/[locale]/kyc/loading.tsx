import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function KycLoading() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6" aria-busy="true" aria-label="Loading KYC">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56 bg-[var(--surface-container-high)]" />
        <Skeleton className="h-4 w-[520px] max-w-full bg-[var(--surface-container-low)]" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <Card className="p-6 space-y-4 bg-[var(--surface-container-lowest)] border-[var(--border-subtle)]">
            <Skeleton className="h-5 w-32 bg-[var(--surface-container-low)]" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-4 items-center">
                  <Skeleton className="h-6 w-6 rounded-full bg-[var(--surface-container-low)]" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32 bg-[var(--surface-container-low)]" />
                    <Skeleton className="h-3 w-full bg-[var(--surface-container-low)]" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="h-48 animate-pulse bg-[var(--surface-container-low)]" />
        </div>
        <div className="lg:col-span-4">
          <Card className="h-64 animate-pulse bg-[var(--surface-container-low)]" />
        </div>
      </div>
    </main>
  );
}
