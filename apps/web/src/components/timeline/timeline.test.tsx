import * as React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timeline, CompactTimeline } from "./timeline";
import type { TimelineEntry } from "@/server/data/timeline";

// CMP-009 — the canonical Timeline. Single-event model: no duplicates, newest
// first, actor + action + reason on every row. The Wave 3 registry claimed
// "timeline.test.tsx 5/5" for a file that did not exist; this suite replaces
// that claim with evidence (see IMPLEMENTATION_PROGRESS.md "unverified" note).

const T0 = "2026-09-12T09:00:00.000Z";

function entry(partial: Partial<TimelineEntry> & Pick<TimelineEntry, "id">): TimelineEntry {
  return {
    entityId: "txn_1",
    entityType: "transaction",
    action: "PAYMENT_SUCCEEDED",
    actor: "system",
    timestamp: T0,
    fromState: "PENDING",
    toState: "SUCCEEDED",
    reason: null,
    detail: null,
    ...partial,
  };
}

describe("Timeline (CMP-009)", () => {
  it("renders entries with label, actor, and state change", () => {
    render(
      <Timeline
        entries={[
          entry({ id: "e1", action: "REFUND_REQUESTED", actor: "Agus (SUPPORT)", reason: "Damaged goods", fromState: "SUCCEEDED", toState: "AWAITING_APPROVAL" }),
        ]}
      />,
    );
    expect(screen.getByText("Refund requested")).toBeInTheDocument();
    expect(screen.getByText(/Agus \(SUPPORT\)/)).toBeInTheDocument();
    expect(screen.getByText(/Damaged goods/)).toBeInTheDocument();
  });

  it("deduplicates identical action:entityId:timestamp — 'Refund issued' appears once", () => {
    render(
      <Timeline
        entries={[
          entry({ id: "e1", action: "REFUND_EXECUTED" }),
          entry({ id: "e1-dup", action: "REFUND_EXECUTED" }), // same key triple, different id
        ]}
      />,
    );
    expect(screen.getAllByText("Refund executed")).toHaveLength(1);
  });

  it("does NOT collapse entries that differ in any key part", () => {
    render(
      <Timeline
        entries={[
          entry({ id: "e1", action: "REFUND_EXECUTED", timestamp: T0 }),
          entry({ id: "e2", action: "REFUND_EXECUTED", timestamp: "2026-09-12T10:00:00.000Z" }),
          entry({ id: "e3", action: "REFUND_EXECUTED", entityId: "txn_2" }),
        ]}
      />,
    );
    expect(screen.getAllByText("Refund executed")).toHaveLength(3);
  });

  it("orders newest first regardless of input order", () => {
    const { container } = render(
      <Timeline
        entries={[
          entry({ id: "old", action: "PAYMENT_CREATED", timestamp: "2026-09-10T09:00:00.000Z" }),
          entry({ id: "new", action: "PAYMENT_SUCCEEDED", timestamp: "2026-09-12T09:00:00.000Z" }),
          entry({ id: "mid", action: "PAYMENT_PENDING", timestamp: "2026-09-11T09:00:00.000Z" }),
        ]}
      />,
    );
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain("Payment succeeded");
    expect(items[2].textContent).toContain("Payment created");
  });

  it("renders the empty state instead of an empty shell", () => {
    render(<Timeline entries={[]} />);
    expect(screen.getByText("No timeline events yet")).toBeInTheDocument();
  });

  it("falls back to the UNKNOWN glyph for an unmapped action", () => {
    render(<Timeline entries={[entry({ id: "e1", action: "SOMETHING_ELSE" })]} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("provider/system events omit the 'by …' actor line entirely", () => {
    render(<Timeline entries={[entry({ id: "e1", actor: null })]} />);
    expect(screen.queryByText(/^by /)).not.toBeInTheDocument();
    expect(screen.getByText("Payment succeeded")).toBeInTheDocument();
  });
});

describe("CompactTimeline", () => {
  it("renders one badge per deduped entry, newest first", () => {
    render(
      <CompactTimeline
        entries={[
          entry({ id: "old", action: "PAYMENT_CREATED", timestamp: "2026-09-10T09:00:00.000Z" }),
          entry({ id: "new", action: "PAYMENT_SUCCEEDED", timestamp: "2026-09-12T09:00:00.000Z" }),
          entry({ id: "dup", action: "PAYMENT_SUCCEEDED", timestamp: "2026-09-12T09:00:00.000Z" }),
        ]}
      />,
    );
    const badges = screen.getAllByText(/Payment (succeeded|created)/);
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveTextContent("Payment succeeded");
  });
});
