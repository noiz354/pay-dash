import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePolling, useStaleDetection } from "./use-polling";

// Wave 4 §2/§8 — the freshness backbone.
//
// The Wave 3 version had three defects, each of which is pinned here:
//   1. polling was gated on `prefers-reduced-motion`, serving stale financial
//      data to users with vestibular disorders;
//   2. `ageSeconds` was computed once at render, so the stale threshold could
//      never trip without a fetch;
//   3. two effects both called `start()`, racing the timeout chain.

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("usePolling — scheduling", () => {
  it("waits one interval before the first poll", async () => {
    const onRefresh = vi.fn();
    renderHook(() => usePolling({ interval: 20_000, onRefresh }));

    await tick(19_999);
    expect(onRefresh).not.toHaveBeenCalled();
    await tick(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("polls on every interval thereafter", async () => {
    const onRefresh = vi.fn();
    renderHook(() => usePolling({ interval: 10_000, onRefresh }));
    await tick(30_000);
    expect(onRefresh).toHaveBeenCalledTimes(3);
  });

  it("fetches immediately when asked", async () => {
    const onRefresh = vi.fn();
    renderHook(() => usePolling({ interval: 10_000, immediate: true, onRefresh }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does nothing at all when disabled", async () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePolling({ interval: 1_000, enabled: false, immediate: true, onRefresh }));
    await tick(5_000);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.lastUpdated).toBeNull();
    expect(result.current.ageSeconds).toBeNull();
  });

  it("is not gated on prefers-reduced-motion (regression: defect 1)", async () => {
    // A motion preference is about animation, never about data currency. jsdom
    // ships no matchMedia, so install one that reports reduced motion.
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }) as unknown as typeof window.matchMedia;
    const onRefresh = vi.fn();
    renderHook(() => usePolling({ interval: 5_000, onRefresh }));
    await tick(5_000);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("skips the fetch while the tab is hidden but keeps the chain alive", async () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const onRefresh = vi.fn();
    renderHook(() => usePolling({ interval: 5_000, onRefresh }));
    await tick(15_000);
    expect(onRefresh).not.toHaveBeenCalled();

    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    await tick(5_000);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("stops fetching after unmount (no leaked timers)", async () => {
    const onRefresh = vi.fn();
    const { unmount } = renderHook(() => usePolling({ interval: 5_000, onRefresh }));
    await tick(5_000);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    unmount();
    await tick(60_000);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not stack two chains when start() runs again (regression: defect 3)", async () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePolling({ interval: 5_000, onRefresh }));
    act(() => result.current.start());
    act(() => result.current.start());
    await tick(15_000);
    expect(onRefresh).toHaveBeenCalledTimes(3); // one chain, not two
  });

  it("stop() halts polling and start() resumes it", async () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePolling({ interval: 5_000, onRefresh }));
    act(() => result.current.stop());
    await tick(20_000);
    expect(onRefresh).not.toHaveBeenCalled();
    act(() => result.current.start());
    await tick(5_000);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe("usePolling — freshness state", () => {
  it("records lastUpdated only after a successful refresh", async () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePolling({ interval: 5_000, onRefresh }));
    expect(result.current.lastUpdated).toBeNull();
    await tick(5_000);
    expect(result.current.lastUpdated?.getTime()).toBe(new Date("2026-09-01T12:00:05.000Z").getTime());
    expect(result.current.isStale).toBe(false);
  });

  it("ages without a fetch and trips the stale threshold on time (regression: defect 2)", async () => {
    const onRefresh = vi.fn();
    // A long interval proves the point: staleness must be detected by the 1s age
    // tick, not by the next poll happening to arrive.
    const { result } = renderHook(() => usePolling({ interval: 600_000, staleThreshold: 60, immediate: true, onRefresh }));
    await tick(0); // let the immediate refresh settle
    expect(result.current.ageSeconds).toBe(0);

    await tick(30_000);
    expect(result.current.ageSeconds).toBe(30);
    expect(result.current.isStale).toBe(false);

    await tick(31_000);
    expect(result.current.ageSeconds).toBe(61);
    expect(result.current.isStale).toBe(true);
    // Staleness was detected with no additional fetch.
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("clears staleness when a later poll succeeds", async () => {
    const { result } = renderHook(() => usePolling({ interval: 30_000, staleThreshold: 10, onRefresh: vi.fn() }));
    await tick(30_000);
    await tick(11_000);
    expect(result.current.isStale).toBe(true);
    await tick(19_000); // second poll lands at t=60s
    expect(result.current.isStale).toBe(false);
    expect(result.current.ageSeconds).toBe(0);
  });

  it("reports isPolling only while a refresh is in flight", async () => {
    let release: (() => void) | null = null;
    const onRefresh = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const { result } = renderHook(() => usePolling({ interval: 1_000, onRefresh }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(result.current.isPolling).toBe(true);
    await act(async () => {
      release?.();
    });
    expect(result.current.isPolling).toBe(false);
  });

  it("coalesces overlapping refreshes so a slow poll cannot pile up", async () => {
    let release: (() => void) | null = null;
    const onRefresh = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const { result } = renderHook(() => usePolling({ interval: 1_000, immediate: true, onRefresh }));

    await act(async () => {
      result.current.refresh();
      result.current.refresh();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      release?.();
    });
  });
});

describe("usePolling — failure handling", () => {
  it("surfaces the error message instead of silently keeping stale data", async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error("Network unreachable"));
    const { result } = renderHook(() => usePolling({ interval: 1_000, onRefresh }));
    await tick(1_000);
    expect(result.current.error).toBe("Network unreachable");
    expect(result.current.lastUpdated).toBeNull();
  });

  it("does not advance lastUpdated on failure, so staleness keeps counting", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined).mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => usePolling({ interval: 5_000, staleThreshold: 10, immediate: true, onRefresh }));
    await tick(0);
    expect(result.current.error).toBe("boom");
    expect(result.current.lastUpdated).toBeNull();

    await tick(5_000); // recovers
    expect(result.current.error).toBeNull();
    expect(result.current.lastUpdated).not.toBeNull();
  });

  it("normalises a non-Error rejection", async () => {
    const onRefresh = vi.fn().mockRejectedValue("string failure");
    const { result } = renderHook(() => usePolling({ interval: 1_000, onRefresh }));
    await tick(1_000);
    expect(result.current.error).toBe("Refresh failed");
  });

  it("keeps polling after a failure rather than giving up", async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error("boom"));
    renderHook(() => usePolling({ interval: 5_000, onRefresh }));
    await tick(15_000);
    expect(onRefresh).toHaveBeenCalledTimes(3);
  });
});

describe("useStaleDetection — server-supplied timestamp", () => {
  it("accepts an ISO string from the server", () => {
    const { result } = renderHook(() => useStaleDetection("2026-09-01T11:58:00.000Z", 60));
    expect(result.current.ageSeconds).toBe(120);
    expect(result.current.isStale).toBe(true);
  });

  it("accepts a Date", () => {
    const { result } = renderHook(() => useStaleDetection(new Date("2026-09-01T11:59:30.000Z"), 60));
    expect(result.current.ageSeconds).toBe(30);
    expect(result.current.isStale).toBe(false);
  });

  it("reports nothing when there is no timestamp yet", () => {
    const { result } = renderHook(() => useStaleDetection(null));
    expect(result.current.ageSeconds).toBeNull();
    expect(result.current.isStale).toBe(false);
  });

  it("ignores an unparseable timestamp rather than declaring everything stale", () => {
    const { result } = renderHook(() => useStaleDetection("nonsense"));
    expect(result.current.ageSeconds).toBeNull();
    expect(result.current.isStale).toBe(false);
  });

  it("clamps a future-dated timestamp to zero age", () => {
    const { result } = renderHook(() => useStaleDetection("2026-09-01T13:00:00.000Z"));
    expect(result.current.ageSeconds).toBe(0);
    expect(result.current.isStale).toBe(false);
  });

  it("ages on its own timer", async () => {
    const { result } = renderHook(() => useStaleDetection("2026-09-01T11:59:30.000Z", 60));
    expect(result.current.isStale).toBe(false);
    await tick(31_000);
    expect(result.current.ageSeconds).toBe(61);
    expect(result.current.isStale).toBe(true);
  });
});
