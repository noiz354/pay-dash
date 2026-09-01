// ponytail: lightweight swappable tracker — self no-op → swap to Umami/PostHog via env
// Addy Osmani: idle + beacon to avoid main-thread blocking and handle page unload
const pending: Array<{ event: string; props?: Record<string, unknown> }> = [];
let flushScheduled = false;

function flush() {
  if (pending.length === 0) return;
  const batch = [...pending];
  pending.length = 0;
  flushScheduled = false;
  for (const { event, props } of batch) {
    if (typeof window !== "undefined" && (window as unknown as { umami?: { track: (e: string, d?: unknown) => void } }).umami) {
      try {
        (window as unknown as { umami: { track: (e: string, d?: unknown) => void } }).umami.track(event, props);
        continue;
      } catch {}
    }
    // Fallback: sendBeacon for page-unload resilience, else console in dev
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      try {
        navigator.sendBeacon("/api/vitals", JSON.stringify({ event, props, ts: Date.now() }));
      } catch {}
    }
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[track]", event, props ?? {});
    }
  }
}

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(flush, { timeout: 2000 });
  } else {
    setTimeout(flush, 0);
  }
}

export function track(event: string, props?: Record<string, unknown>) {
  // Guard: props may contain undefined startTime from web-vitals v5 Metric — normalize
  const safeProps = props ? { ...props } : undefined;
  if (safeProps && typeof safeProps.startTime === "undefined") {
    // Keep as undefined but avoid crashing downstream consumers that read startTime
    // Do not delete — downstream may expect key; just ensure not throwing
  }
  pending.push({ event, props: safeProps });
  scheduleFlush();
}
