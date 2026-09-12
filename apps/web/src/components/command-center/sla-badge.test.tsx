import * as React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SlaBadge, SlaSortHint } from "./sla-badge";

// Wave 4 §3 — the SLA badge is the shared four-band vocabulary. The contract
// under test: a band is NEVER conveyed by colour alone (WCAG 1.4.1) — every
// badge carries a text label, an icon, and a text countdown; and the machine
// attributes (data-testid / data-sla-band) stay stable for tests and E2E.

const BANDS = [
  { band: "NORMAL", label: "On track" },
  { band: "APPROACHING", label: "Approaching SLA" },
  { band: "OVERDUE", label: "Overdue" },
  { band: "CRITICAL", label: "Critically overdue" },
] as const;

describe("SlaBadge (W4-SLA vocabulary)", () => {
  it.each(BANDS)("renders $band with its text label and an icon", ({ band, label }) => {
    render(<SlaBadge band={band} />);
    const badge = screen.getByTestId(`sla-badge-${band.toLowerCase()}`);
    expect(badge).toHaveAttribute("data-sla-band", band);
    expect(badge).toHaveTextContent(label);
    // Icon present (decorative, but part of the non-colour cue).
    expect(badge.querySelector(".material-symbols-outlined")).not.toBeNull();
  });

  it.each(BANDS)("keeps the band machine-readable even in compact mode", ({ band }) => {
    render(<SlaBadge band={band} compact />);
    expect(screen.getByTestId(`sla-badge-${band.toLowerCase()}`)).toHaveAttribute("data-sla-band", band);
  });

  it("renders a text countdown and repeats it for screen readers", () => {
    render(<SlaBadge band="OVERDUE" remainingSeconds={-7200} />);
    const badge = screen.getByTestId("sla-badge-overdue");
    expect(badge).toHaveTextContent("2h overdue");
    // sr-only sentence so the band is announced, not just shown.
    expect(badge).toHaveTextContent("Overdue, 2h overdue");
    // Tooltip repeats the pair for pointer users.
    expect(badge).toHaveAttribute("title", "Overdue — 2h overdue");
  });

  it("compacts to the countdown only (tight table cells)", () => {
    render(<SlaBadge band="APPROACHING" remainingSeconds={1800} compact />);
    const badge = screen.getByTestId("sla-badge-approaching");
    // Visible copy is the countdown; only the sr-only sentence keeps the label.
    const visible = Array.from(badge.querySelectorAll("span:not(.sr-only)")).map((s) => s.textContent).join("");
    expect(visible).toContain("30m left");
    expect(visible).not.toContain("Approaching SLA");
    expect(badge).toHaveTextContent("Approaching SLA"); // still announced to AT
  });

  it("without remainingSeconds renders the label and no countdown", () => {
    render(<SlaBadge band="CRITICAL" />);
    const badge = screen.getByTestId("sla-badge-critical");
    expect(badge).toHaveTextContent("Critically overdue");
    expect(badge.textContent).not.toMatch(/left|overdue\s*·/);
    // title carries the label only
    expect(badge).toHaveAttribute("title", "Critically overdue");
  });

  it("normalizes fractional seconds deterministically (no Intl drift)", () => {
    // 90 min -> "1h left"; 59s -> "59s left". The formatter is locale-independent
    // so server and client render identical strings (hydration safety).
    const { rerender } = render(<SlaBadge band="NORMAL" remainingSeconds={5400} />);
    expect(screen.getByTestId("sla-badge-normal")).toHaveTextContent("1h left");
    rerender(<SlaBadge band="NORMAL" remainingSeconds={59} />);
    expect(screen.getByTestId("sla-badge-normal")).toHaveTextContent("59s left");
    rerender(<SlaBadge band="NORMAL" remainingSeconds={3 * 86400} />);
    expect(screen.getByTestId("sla-badge-normal")).toHaveTextContent("3d left");
  });
});

describe("SlaSortHint", () => {
  it("renders nothing when the column is not the active sort", () => {
    const { container } = render(<SlaSortHint active={false} direction="desc" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a direction arrow when active", () => {
    const { rerender, container } = render(<SlaSortHint active direction="desc" />);
    expect(container.querySelector(".material-symbols-outlined")).toHaveTextContent("arrow_downward");
    rerender(<SlaSortHint active direction="asc" />);
    expect(container.querySelector(".material-symbols-outlined")).toHaveTextContent("arrow_upward");
  });
});
