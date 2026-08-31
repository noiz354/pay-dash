// ponytail: lightweight swappable tracker — self no-op → swap to Umami/PostHog via env
export function track(event: string, props?: Record<string, unknown>) {
  if (typeof window !== "undefined" && (window as unknown as { umami?: { track: (e: string, d?: unknown) => void } }).umami) {
    try {
      (window as unknown as { umami: { track: (e: string, d?: unknown) => void } }).umami.track(event, props);
      return;
    } catch {}
  }
  // self-first: log only, no vendor required
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[track]", event, props ?? {});
  }
}
