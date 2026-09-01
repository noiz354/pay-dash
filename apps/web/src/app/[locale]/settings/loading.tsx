import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function SettingsLoading() {
  return (
    <main className="mx-auto w-full max-w-container-max space-y-6 p-gutter" aria-busy="true">
      <Skeleton className="h-8 w-48 bg-[var(--surface-container-high)]" />
      <Skeleton className="h-4 w-96 bg-[var(--surface-container-low)]" />
      <Skeleton className="h-10 w-full bg-[var(--surface-container-low)]" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-32 animate-pulse bg-[var(--surface-container-low)]" />
        ))}
      </div>
    </main>
  );
}
