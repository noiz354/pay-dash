import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { installMatchMedia } from "@/test/match-media";
import { StaleBanner } from "./stale-banner";

// CMP-019 — freshness is explicit: say how old the data is and offer one
// obvious way to fix it. The refresh affordance arms only past the 60s
// threshold, and the pulse respects prefers-reduced-motion.

describe("StaleBanner (CMP-019)", () => {
  let onRefresh: Mock;
  beforeEach(() => {
    onRefresh = vi.fn();
    installMatchMedia(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("announces itself politely with a human age (73s → 1m 13s ago)", () => {
    render(<StaleBanner ageSeconds={73} onRefresh={onRefresh} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Data may be outdated — last updated 1m 13s ago");
  });

  it.each([
    [45, "45s ago"],
    [60, "1m ago"],
    [3600, "1h ago"],
    [5400, "1h 30m ago"],
  ])("formats %ss as %s", (seconds, expected) => {
    render(<StaleBanner ageSeconds={seconds} onRefresh={onRefresh} />);
    expect(screen.getByText(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeInTheDocument();
  });

  it("the refresh button is disabled under the 60s threshold and enabled past it", () => {
    const { rerender } = render(<StaleBanner ageSeconds={45} onRefresh={onRefresh} />);
    expect(screen.getByRole("button", { name: "Refresh data" })).toBeDisabled();
    rerender(<StaleBanner ageSeconds={120} onRefresh={onRefresh} />);
    expect(screen.getByRole("button", { name: "Refresh data" })).toBeEnabled();
  });

  it("invokes onRefresh exactly once per click", () => {
    render(<StaleBanner ageSeconds={90} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("a custom message overrides the default copy", () => {
    render(<StaleBanner ageSeconds={90} onRefresh={onRefresh} message="Ledger snapshot is 5 minutes old" />);
    expect(screen.getByText("Ledger snapshot is 5 minutes old")).toBeInTheDocument();
  });

  it("honours prefers-reduced-motion: the refresh affordance does not pulse", () => {
    installMatchMedia(true);
    render(<StaleBanner ageSeconds={90} onRefresh={onRefresh} />);
    const icon = screen.getByRole("button", { name: "Refresh data" }).querySelector(".material-symbols-outlined");
    expect(icon?.className).not.toContain("animate-pulse");
  });

  it("pulses by default (motion allowed)", () => {
    render(<StaleBanner ageSeconds={90} onRefresh={onRefresh} />);
    const icon = screen.getByRole("button", { name: "Refresh data" }).querySelector(".material-symbols-outlined");
    expect(icon?.className).toContain("animate-pulse");
  });
});
