"use client";
import { useEffect, useRef, useState, useCallback } from "react";

/**
 * usePolling hook — Real freshness with polling
 * 
 * Features:
 * - Poll at specified interval (default 20s)
 * - Track last updated timestamp
 * - Respect prefers-reduced-motion (pauses polling)
 * - Pause when tab not visible (Page Visibility API)
 * - Manual refresh trigger
 * - Stale threshold check (>60s)
 */

export interface PollingConfig {
  /** Poll interval in milliseconds (default: 20000 = 20s) */
  interval?: number;
  /** Stale threshold in seconds (default: 60) */
  staleThreshold?: number;
  /** Enable/disable polling (default: true) */
  enabled?: boolean;
  /** Callback to fetch fresh data */
  onRefresh: () => Promise<void> | void;
}

export interface PollingResult {
  /** Last successful update timestamp */
  lastUpdated: Date | null;
  /** Age in seconds since last update */
  ageSeconds: number | null;
  /** Whether data is considered stale (> staleThreshold) */
  isStale: boolean;
  /** Whether currently polling */
  isPolling: boolean;
  /** Manual refresh function */
  refresh: () => Promise<void>;
  /** Start polling */
  start: () => void;
  /** Stop polling */
  stop: () => void;
}

/**
 * Hook for real-time data polling with freshness tracking
 * 
 * @param config - Polling configuration
 * @returns Polling state and controls
 * 
 * @example
 * ```tsx
 * const { lastUpdated, isStale, refresh } = usePolling({
 *   interval: 20000,
 *   staleThreshold: 60,
 *   onRefresh: async () => {
 *     const data = await fetchData();
 *     setData(data);
 *   }
 * });
 * 
 * // In render:
 * {isStale && <StaleBanner ageSeconds={ageSeconds} onRefresh={refresh} />}
 * ```
 */
export function usePolling(config: PollingConfig): PollingResult {
  const { 
    interval = 20000, 
    staleThreshold = 60, 
    enabled = true,
    onRefresh 
  } = config;
  
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isVisibleRef = useRef(true);
  const prefersReducedMotion = useRef(false);

  // Check prefers-reduced-motion
  useEffect(() => {
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      prefersReducedMotion.current = mediaQuery.matches;
      
      const handler = () => {
        prefersReducedMotion.current = mediaQuery.matches;
      };
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, []);

  // Page Visibility API
  useEffect(() => {
    if (typeof document !== "undefined") {
      isVisibleRef.current = !document.hidden;
      const handler = () => {
        isVisibleRef.current = !document.hidden;
      };
      document.addEventListener("visibilitychange", handler);
      return () => document.removeEventListener("visibilitychange", handler);
    }
  }, []);

  // Calculate age
  const ageSeconds = lastUpdated 
    ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000) 
    : null;

  // Check if stale
  const isStale = ageSeconds !== null && ageSeconds > staleThreshold;

  // Refresh function
  const refresh = useCallback(async () => {
    try {
      setIsPolling(true);
      await onRefresh();
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Polling refresh failed:", error);
      // Don't update lastUpdated on failure
    } finally {
      setIsPolling(false);
    }
  }, [onRefresh]);

  // Start polling
  const start = useCallback(() => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Don't start if disabled, reduced motion, or not visible
    if (!enabled || prefersReducedMotion.current || !isVisibleRef.current) {
      return;
    }

    const poll = async () => {
      if (!isVisibleRef.current || prefersReducedMotion.current) {
        return;
      }
      
      await refresh();
      
      // Schedule next poll
      timeoutRef.current = setTimeout(poll, interval);
    };

    // Initial poll after first interval
    timeoutRef.current = setTimeout(poll, interval);
  }, [enabled, interval, refresh]);

  // Stop polling
  const stop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Auto-start on mount
  useEffect(() => {
    if (enabled) {
      start();
      // Set initial timestamp
      setLastUpdated(new Date());
    }
    
    return () => {
      stop();
    };
  }, [enabled, start, stop]);

  // Restart polling when visibility changes
  useEffect(() => {
    if (enabled && isVisibleRef.current && !prefersReducedMotion.current) {
      start();
    } else {
      stop();
    }
  }, [enabled, start, stop]);

  return {
    lastUpdated,
    ageSeconds,
    isStale,
    isPolling,
    refresh,
    start,
    stop,
  };
}

/**
 * Simplified hook for components that just need stale detection
 */
export function useStaleDetection(lastUpdated: Date | null, staleThreshold = 60): {
  isStale: boolean;
  ageSeconds: number | null;
} {
  const ageSeconds = lastUpdated 
    ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000) 
    : null;
  
  const isStale = ageSeconds !== null && ageSeconds > staleThreshold;
  
  return { isStale, ageSeconds };
}
