"use client";
import * as React from "react";

// Wave 4 §2/§8 — freshness backbone.
//
// Rewritten. The previous version had three defects that made "real freshness"
// unverifiable:
//
//   1. It gated polling on `prefers-reduced-motion`. A motion preference is about
//      animation, not data currency — disabling polling there served *stale*
//      financial data to users with vestibular disorders. Motion is now handled
//      where it belongs (CSS), and polling is unconditional.
//   2. `ageSeconds` was computed during render with no timer, so nothing ever
//      re-rendered and the stale threshold could never trip on its own.
//   3. Two effects both called `start()`, racing the timeout chain.
//
// Contract now: poll on an interval while the tab is visible, tick the age every
// second so staleness is detected without a fetch, expose failures as state
// (never swallow them), and never blank the UI while refreshing.

export interface PollingConfig {
  /** Poll interval in milliseconds. Default 20s (spec §7). */
  interval?: number;
  /** Age in seconds after which data is declared stale. Default 60s (spec §7). */
  staleThreshold?: number;
  /** Enable/disable polling. Default true. */
  enabled?: boolean;
  /** Fetch immediately on mount rather than waiting for the first interval. */
  immediate?: boolean;
  /** Called to fetch fresh data. Throw to signal failure. */
  onRefresh: () => Promise<void> | void;
}

export interface PollingResult {
  /** Last *successful* update. Null until the first success. */
  lastUpdated: Date | null;
  /** Age in seconds since the last success; ticks without a fetch. */
  ageSeconds: number | null;
  /** True once `ageSeconds` exceeds `staleThreshold`. */
  isStale: boolean;
  /** A refresh is in flight. */
  isPolling: boolean;
  /** Message from the most recent failed refresh, or null. */
  error: string | null;
  /** Trigger a refresh now (used by the banner's Refresh button). */
  refresh: () => Promise<void>;
  start: () => void;
  stop: () => void;
}

export function usePolling(config: PollingConfig): PollingResult {
  const { interval = 20_000, staleThreshold = 60, enabled = true, immediate = false, onRefresh } = config;

  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [isPolling, setIsPolling] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Re-rendered every second while mounted so `ageSeconds` advances and the
  // stale threshold trips on time even when no fetch happens.
  const [, setTick] = React.useState(0);

  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = React.useRef(false);
  // Keep the latest callback without re-arming the timer chain on every render.
  const onRefreshRef = React.useRef(onRefresh);
  React.useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const refresh = React.useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsPolling(true);
    try {
      await onRefreshRef.current();
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      // Surface the failure — silently keeping stale data is how a dashboard
      // starts lying. `lastUpdated` is deliberately not advanced.
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      inFlightRef.current = false;
      setIsPolling(false);
    }
  }, []);

  const clearTimers = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const start = React.useCallback(() => {
    clearTimers();
    if (!enabled) return;

    // Tick the age once a second so staleness is detected without a fetch.
    tickRef.current = setInterval(() => setTick((t) => t + 1), 1_000);

    const poll = async () => {
      // Pause while the tab is hidden (battery/network), resume on return.
      if (typeof document !== "undefined" && document.hidden) {
        timerRef.current = setTimeout(poll, interval);
        return;
      }
      await refresh();
      timerRef.current = setTimeout(poll, interval);
    };

    if (immediate) void poll();
    else timerRef.current = setTimeout(poll, interval);
  }, [clearTimers, enabled, immediate, interval, refresh]);

  const stop = React.useCallback(() => {
    clearTimers();
  }, [clearTimers]);

  React.useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  // Resume promptly when the tab becomes visible again.
  React.useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const onVisibility = () => {
      if (!document.hidden) start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled, start]);

  // Computed during render on purpose: the 1s tick above re-renders this hook's
  // owner, so the age advances without a fetch and the stale threshold trips on
  // schedule. Memoising it would freeze the value between refreshes.
  const ageSeconds = lastUpdated ? Math.max(0, Math.floor((Date.now() - lastUpdated.getTime()) / 1000)) : null;
  const isStale = ageSeconds !== null && ageSeconds > staleThreshold;

  return { lastUpdated, ageSeconds, isStale, isPolling, error, refresh, start, stop };
}

/**
 * Minimal hook for components that already receive a server timestamp and only
 * need to know whether it has gone stale. Ticks once a second.
 */
export function useStaleDetection(
  lastUpdated: Date | string | null,
  staleThreshold = 60,
): { isStale: boolean; ageSeconds: number | null } {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const at = React.useMemo(() => {
    if (!lastUpdated) return null;
    const t = lastUpdated instanceof Date ? lastUpdated.getTime() : new Date(lastUpdated).getTime();
    return Number.isFinite(t) ? t : null;
  }, [lastUpdated]);

  const ageSeconds = at === null ? null : Math.max(0, Math.floor((Date.now() - at) / 1000));
  return { isStale: ageSeconds !== null && ageSeconds > staleThreshold, ageSeconds };
}
