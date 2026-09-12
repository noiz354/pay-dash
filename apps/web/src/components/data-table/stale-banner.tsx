"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";

// Stale data handling — threshold 60s per spec §32
export function StaleBanner({ lastUpdated, onRefresh, thresholdSec = 60 }: { lastUpdated: string; onRefresh: () => void; thresholdSec?: number }) {
  const [age, setAge] = React.useState(() => Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 1000));
  React.useEffect(() => {
    const t = setInterval(() => setAge(Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 1000)), 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);
  if (age <= thresholdSec) return null;
  return (
    <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-container)]/30 px-4 py-2 text-sm">
      <span>
        Data may be outdated — last updated {age}s ago (threshold {thresholdSec}s)
      </span>
      <Button size="sm" variant="outline" onClick={onRefresh} className="h-7 gap-1">
        <span className="material-symbols-outlined text-[16px]" aria-hidden>
          refresh
        </span>
        Refresh
      </Button>
    </div>
  );
}
