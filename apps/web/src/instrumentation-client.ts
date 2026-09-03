"use client";

import * as Sentry from "@sentry/nextjs";
import { useReportWebVitals } from "next/web-vitals";
import { track } from "@/lib/analytics";

if (typeof window !== "undefined") {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

// Web Vitals + track() — ADR-0005, NEXTJS #36 instrumentation-client
export function WebVitals() {
  useReportWebVitals((metric) => {
    // Guard: web-vitals v5 can invoke callback with undefined during HMR / Fast Refresh
    if (!metric || typeof (metric as unknown as { name?: unknown }).name !== "string") return;
    let payload: Record<string, unknown>;
    try {
      payload = {
        name: metric.name,
        value: metric.value,
        id: metric.id,
        delta: (metric as unknown as { delta?: number }).delta,
        rating: (metric as unknown as { rating?: string }).rating,
        navigationType: (metric as unknown as { navigationType?: string }).navigationType,
        // Guard: web-vitals v5 Metric has no startTime; use entries[0].startTime if present
        startTime: (metric as unknown as { entries?: Array<{ startTime?: number }> }).entries?.[0]?.startTime,
      };
    } catch {
      return;
    }
    const doTrack = () => {
      try {
        track("web_vital", payload);
      } catch {}
    };
    try {
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(doTrack, { timeout: 2000 });
      } else {
        doTrack();
      }
    } catch {
      doTrack();
    }
    if (process.env.NODE_ENV === "development") {
      console.log("[WebVital]", payload);
    }
  });
  return null;
}
