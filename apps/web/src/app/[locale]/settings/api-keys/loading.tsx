import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function SettingsSectionLoading() {
  return (
    <main className="mx-auto w-full max-w-container-max space-y-6 p-gutter" aria-busy="true">
      <Skeleton className="h-4 w-56 bg-[var(--surface-container-low)]" />
      <Skeleton className="h-8 w-72 bg-[var(--surface-container-high)]" />
      <Skeleton className="h-10 w-full bg-[var(--surface-container-low)]" />
      <Card className="h-64 animate-pulse bg-[var(--surface-container-low)]" />
      <Card className="h-48 animate-pulse bg-[var(--surface-container-low)]" />
    </main>
  );
}
