import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { installMatchMedia } from "@/test/match-media";
import { emptyCommandCenter, type CommandCenterDto, type CommandCenterItem } from "@/lib/command-center";

// Wave 4 §2 — Command Center section behavior. Four states are mandatory per
// spec §7: loading, empty (celebrate), error and populated — plus explicit
// freshness (poll age, stale banner, manual refresh). The client never widens
// its own permissions: canAct arrives from the server and is only re-computed
// there, so this suite treats it as data, not logic.

const pollingState = {
  current: {
    lastUpdated: new Date(),
    ageSeconds: 5 as number | null,
    isStale: false,
    isPolling: false,
    error: null as string | null,
    refresh: vi.fn(async () => {}),
  },
};

vi.mock("@/hooks/use-polling", () => ({
  usePolling: () => pollingState.current,
}));

const mockTrackEvent = vi.fn();
vi.mock("@/lib/analytics-events", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { CommandCenter } from "./command-center";

function item(partial: Partial<CommandCenterItem> = {}): CommandCenterItem {
  return {
    id: "card_test",
    lane: "critical",
    title: "Test card",
    description: "desc",
    count: 2,
    href: "/transactions",
    icon: "error",
    tone: "critical",
    permission: "refund.execute",
    severity: 3,
    slaBand: "CRITICAL",
    oldestAgeSeconds: 60,
    samples: [],
    canAct: true,
    ...partial,
  };
}

function dto(partial: Partial<CommandCenterDto> = {}): CommandCenterDto {
  const base = emptyCommandCenter("2026-09-12T09:00:00.000Z");
  return { ...base, ...partial };
}

beforeEach(() => {
  vi.clearAllMocks();
  installMatchMedia(false);
  pollingState.current = {
    lastUpdated: new Date(),
    ageSeconds: 5,
    isStale: false,
    isPolling: false,
    error: null,
    refresh: vi.fn(async () => {}),
  };
  fetchMock.mockResolvedValue(new Response(JSON.stringify(dto()), { status: 200 }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CommandCenter — populated", () => {
  it("summarizes exceptions across active lanes and renders lane sections + cards", () => {
    const data = dto({
      allClear: false,
      totals: { ...dto().totals, critical: 3, exceptions: 3 },
      lanes: { ...dto().lanes, critical: [item({ count: 3 })] },
    });
    render(<CommandCenter initialData={data} />);
    expect(screen.getByTestId("command-center")).toBeInTheDocument();
    expect(screen.getByText(/3 items need action across 1 lane/)).toBeInTheDocument();
    expect(screen.getByTestId("cc-lane-critical")).toBeInTheDocument();
    expect(screen.getByTestId("cc-card-card_test")).toBeInTheDocument();
    // Empty lanes are not rendered as zero-grids.
    expect(screen.queryByTestId("cc-lane-needs_attention")).not.toBeInTheDocument();
  });

  it("focusLane renders only the focused lane", () => {
    const data = dto({
      allClear: false,
      totals: { ...dto().totals, critical: 2, failed: 1, exceptions: 3 },
      lanes: { ...dto().lanes, critical: [item()], failed: [item({ id: "card_failed", lane: "failed" as never })] },
    });
    render(<CommandCenter initialData={data} focusLane="critical" />);
    expect(screen.getByTestId("cc-lane-critical")).toBeInTheDocument();
    expect(screen.queryByTestId("cc-lane-failed")).not.toBeInTheDocument();
  });

  it("freshness line shows the poll age and refresh triggers the hook + ANA event", () => {
    render(<CommandCenter initialData={dto()} />);
    expect(screen.getByTestId("cc-freshness")).toHaveTextContent("Updated 5s ago");
    fireEvent.click(screen.getByTestId("cc-refresh"));
    expect(pollingState.current.refresh).toHaveBeenCalledTimes(1);
    expect(mockTrackEvent).toHaveBeenCalledWith("stale_refreshed", expect.objectContaining({ age_sec: 5, scr: "SCR-004" }));
  });
});

describe("CommandCenter — all clear (celebrate, not zeros)", () => {
  it("shows the celebrate state and keeps the completed lane as evidence", () => {
    const data = dto({
      allClear: true,
      totals: { ...dto().totals, recently_completed: 1, exceptions: 0 },
      lanes: { ...dto().lanes, recently_completed: [item({ id: "card_done", lane: "recently_completed" as never, slaBand: null })] },
    });
    render(<CommandCenter initialData={data} />);
    expect(screen.getByTestId("cc-all-clear")).toBeInTheDocument();
    expect(screen.getByText("All clear")).toBeInTheDocument();
    expect(screen.getByText("Nothing needs you right now.")).toBeInTheDocument();
    // The completed lane survives the celebration — the queue visibly drains.
    expect(screen.getByTestId("cc-lane-recently_completed")).toBeInTheDocument();
  });
});

describe("CommandCenter — error state", () => {
  it("a poll failure is first-class: alert + last snapshot + retry", () => {
    pollingState.current = { ...pollingState.current, error: "Request failed (503)" };
    render(<CommandCenter initialData={dto({ allClear: false, totals: { ...dto().totals, critical: 2, exceptions: 2 }, lanes: { ...dto().lanes, critical: [item()] } })} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not refresh the Command Center");
    // Honest about what is on screen: the last good snapshot.
    expect(alert).toHaveTextContent("Showing the last successful snapshot from 5s ago");
    // The stale data still renders beneath the error — never a blank dashboard.
    expect(screen.getByTestId("cc-card-card_test")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(pollingState.current.refresh).toHaveBeenCalled();
  });
});

describe("CommandCenter — stale state", () => {
  it("renders the StaleBanner and emits stale_seen once per episode", () => {
    pollingState.current = { ...pollingState.current, isStale: true, ageSeconds: 75 };
    pollingState.current = { ...pollingState.current, isStale: true, ageSeconds: 75 };
    const { rerender } = render(<CommandCenter initialData={dto()} />);
    expect(screen.getByText(/Data may be outdated — last updated/)).toBeInTheDocument();
    expect(mockTrackEvent).toHaveBeenCalledWith("stale_seen", expect.objectContaining({ age_sec: 75, surface: "command_center" }));
    // Re-render with still-stale data must not re-announce (once per episode,
    // per mounted instance — the ref persists across renders).
    rerender(<CommandCenter initialData={dto()} />);
    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
  });

  it("the banner refresh carries the age and re-arms after recovery", () => {
    pollingState.current = { ...pollingState.current, isStale: true, ageSeconds: 90 };
    const { rerender } = render(<CommandCenter initialData={dto()} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    expect(mockTrackEvent).toHaveBeenCalledWith("stale_refreshed", expect.objectContaining({ age_sec: 90 }));
    // Recovered: banner gone.
    pollingState.current = { ...pollingState.current, isStale: false, ageSeconds: 2 };
    rerender(<CommandCenter initialData={dto()} />);
    expect(screen.queryByText(/Data may be outdated/)).not.toBeInTheDocument();
  });
});

describe("CommandCenter — analytics on activation", () => {
  it("a card the viewer cannot act on also emits permission_denied", async () => {
    const data = dto({
      allClear: false,
      totals: { ...dto().totals, pending_approval: 1, exceptions: 1 },
      lanes: { ...dto().lanes, pending_approval: [item({ id: "card_locked", lane: "pending_approval" as never, canAct: false, permission: "payout.release" })] },
    });
    render(<CommandCenter initialData={data} />);
    fireEvent.click(screen.getByTestId("cc-card-card_locked"));
    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith("command_center_action", expect.objectContaining({ card: "card_locked", scr: "SCR-004" }));
      expect(mockTrackEvent).toHaveBeenCalledWith("permission_denied", expect.objectContaining({ permission: "payout.release", surface: "command_center" }));
    });
  });
});
