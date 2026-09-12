"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";

/**
 * StaleBanner — CMP-019
 * Shows when data may be outdated (>60s since last update)
 * Provides manual refresh button
 * Respects prefers-reduced-motion
 */

export interface StaleBannerProps {
  /** Age in seconds since last update */
  ageSeconds: number;
  /** Callback to refresh data */
  onRefresh: () => void;
  /** Custom message (optional) */
  message?: string;
}

/**
 * Format seconds to human-readable string
 * e.g., 73 -> "73s ago", 125 -> "2m 5s ago"
 */
function formatAge(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s ago` : `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m ago` : `${hours}h ago`;
}

export function StaleBanner({ ageSeconds, onRefresh, message }: StaleBannerProps) {
  // Check if reduced motion is preferred
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setPrefersReducedMotion(mediaQuery.matches);
      
      const handler = () => {
        setPrefersReducedMotion(mediaQuery.matches);
      };
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, []);

  // Don't show pulse animation if reduced motion
  const showPulse = !prefersReducedMotion;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--warning-container)] bg-[var(--warning-container)]/50 px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <span
          className="material-symbols-outlined text-[var(--warning)]"
          aria-hidden="true"
        >
          schedule
        </span>
        <span className="body-sm text-[var(--on-surface)]">
          {message || `Data may be outdated — last updated ${formatAge(ageSeconds)}`}
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={ageSeconds < 60}
        className="h-8 gap-2 border-[var(--warning)] text-[var(--warning)] hover:bg-[var(--warning-container)]/10"
        aria-label="Refresh data"
      >
        <span
          className={`material-symbols-outlined text-[16px] ${showPulse ? "animate-pulse" : ""}`}
          aria-hidden="true"
        >
          refresh
        </span>
        <span className="body-sm font-medium">Refresh</span>
      </Button>
    </div>
  );
}

/**
 * StaleBanner with polling integration
 * Use this when you have a polling hook that provides lastUpdated
 */
export interface StaleBannerWithPollingProps {
  /** Last updated timestamp from polling */
  lastUpdated: Date | null;
  /** Callback to refresh data */
  onRefresh: () => void;
  /** Stale threshold in seconds (default: 60) */
  staleThreshold?: number;
  /** Custom message (optional) */
  message?: string;
}

export function StaleBannerWithPolling({
  lastUpdated,
  onRefresh,
  staleThreshold = 60,
  message,
}: StaleBannerWithPollingProps) {
  const ageSeconds = lastUpdated 
    ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000) 
    : null;

  if (ageSeconds === null || ageSeconds <= staleThreshold) {
    return null;
  }

  return (
    <StaleBanner
      ageSeconds={ageSeconds}
      onRefresh={onRefresh}
      message={message}
    />
  );
}
