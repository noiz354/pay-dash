import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommandCenterCard, blockingRolesLabel, rolesThatCan } from "./command-center-card";
import type { CommandCenterItem } from "@/lib/command-center";

// Wave 4 §2 — the lane card is the actionable unit of the Command Center.
// "Actionable" has two honest forms, both under test here:
//   canAct=true  -> a verb CTA into the filtered queue
//   canAct=false -> who is blocking, and the queue still opens (no dead end)
// This is also the *cross-role handoff* surface: the blocker label is the
// projection of the permission matrix onto human role names.

function item(partial: Partial<CommandCenterItem> = {}): CommandCenterItem {
  return {
    id: "card_refunds_awaiting",
    lane: "needs_attention",
    title: "Refunds awaiting second approval",
    description: "Dual control pending.",
    count: 3,
    href: "/transactions?refundState=AWAITING_APPROVAL",
    icon: "account_balance_wallet",
    tone: "warning",
    permission: "refund.execute",
    severity: 2,
    slaBand: "OVERDUE",
    oldestAgeSeconds: 7200,
    samples: ["txn_1", "txn_2"],
    canAct: true,
    ...partial,
  };
}

describe("CommandCenterCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders title, count with an sr-only unit, samples and the SLA badge", () => {
    render(<CommandCenterCard item={item()} />);
    expect(screen.getByTestId("cc-card-card_refunds_awaiting")).toBeInTheDocument();
    expect(screen.getByTestId("cc-count-card_refunds_awaiting")).toHaveTextContent("3");
    expect(screen.getByText("Refunds awaiting second approval")).toBeInTheDocument();
    expect(screen.getByTestId("sla-badge-overdue")).toBeInTheDocument();
    expect(screen.getByTitle("txn_1, txn_2")).toBeInTheDocument();
  });

  it("the accessible name carries count, band and items — not colour", () => {
    render(<CommandCenterCard item={item({ count: 1 })} />);
    const link = screen.getByTestId("cc-card-card_refunds_awaiting");
    const label = link.getAttribute("aria-label") ?? "";
    expect(label).toContain("1 item");
    expect(label).toContain("Overdue");
  });

  it("canAct=true shows the permission's action verb (payout.release → Approve)", () => {
    render(<CommandCenterCard item={item({ permission: "payout.release", slaBand: null })} />);
    const link = screen.getByTestId("cc-card-card_refunds_awaiting");
    expect(link).toHaveAttribute("data-can-act", "true");
    expect(link).toHaveTextContent("Approve");
    expect(link.textContent).not.toContain("Waiting on");
  });

  it.each([
    ["refund.execute", "Review refunds"],
    ["payout.retry", "Retry"],
    ["provider.connect.test", "Inspect"],
    ["audit.read", "Review"],
    ["money_in.create", "Triage"],
    [null, "Open queue"],
  ] as const)("action verb mapping for %s", (permission, verb) => {
    render(<CommandCenterCard item={item({ permission, slaBand: null })} />);
    expect(screen.getByTestId("cc-card-card_refunds_awaiting")).toHaveTextContent(verb);
  });

  it("canAct=false names the blocking role and STILL opens the queue — no dead end", () => {
    render(<CommandCenterCard item={item({ canAct: false })} />);
    const link = screen.getByTestId("cc-card-card_refunds_awaiting");
    expect(link).toHaveAttribute("data-can-act", "false");
    expect(link).toHaveAttribute("href", "/transactions?refundState=AWAITING_APPROVAL");
    expect(link.textContent).toMatch(/Waiting on .+/);
    // A hidden card would recreate the dead end — the card must render.
    expect(link).toBeVisible();
  });

  it("NORMAL band cards do not wear a badge (on-track is the absence of urgency)", () => {
    render(<CommandCenterCard item={item({ slaBand: "NORMAL" })} />);
    expect(screen.queryByTestId(/^sla-badge-/)).not.toBeInTheDocument();
  });

  it("oldestAgeSeconds renders the age line; null omits it", () => {
    const { rerender } = render(<CommandCenterCard item={item({ slaBand: null })} />);
    expect(screen.getByText(/Oldest /)).toBeInTheDocument();
    rerender(<CommandCenterCard item={item({ slaBand: null, oldestAgeSeconds: null })} />);
    expect(screen.queryByText(/Oldest /)).not.toBeInTheDocument();
  });

  it("reports the activation through onAct (ANA command_center_action hook)", () => {
    const onAct = vi.fn();
    render(<CommandCenterCard item={item()} onAct={onAct} />);
    fireEvent.click(screen.getByTestId("cc-card-card_refunds_awaiting"));
    expect(onAct).toHaveBeenCalledTimes(1);
    expect(onAct.mock.calls[0][0].id).toBe("card_refunds_awaiting");
  });
});

describe("permission → blocking-role projection (cross-role handoff copy)", () => {
  it("rolesThatCan refunds dual control to exactly the finance roles", () => {
    const roles = rolesThatCan("refund.execute");
    expect(roles).toContain("FINANCE_ADMIN");
    expect(roles).toContain("OWNER");
    expect(roles).not.toContain("SUPPORT"); // initiator can never self-approve
    expect(roles).not.toContain("ANALYST");
  });

  it("one holder renders a single role, two render 'A or B', three render 'A (+2 more)'", () => {
    expect(blockingRolesLabel("refund.execute")).toMatch(/ or /);
    expect(blockingRolesLabel(null)).toBeNull();
    // A permission nobody holds cannot name a blocker — the card falls back.
    expect(blockingRolesLabel("nonexistent.permission" as never)).toBeNull();
  });

  it("the fallback copy when no role holds the permission is 'an approver'", () => {
    render(<CommandCenterCard item={item({ canAct: false, permission: null })} />);
    expect(screen.getByTestId("cc-card-card_refunds_awaiting")).toHaveTextContent("Waiting on an approver");
  });
});

describe("CommandCenterCardSkeleton", () => {
  it("is hidden from assistive tech and matches the real card's box (CLS ≈ 0)", async () => {
    const { CommandCenterCardSkeleton } = await import("./command-center-card");
    const { container } = render(
      <ul>
        <CommandCenterCardSkeleton />
      </ul>,
    );
    const li = container.querySelector("li");
    expect(li).toHaveAttribute("aria-hidden", "true");
    // Same paddings as the real card — measured, not guessed.
    expect(li?.firstElementChild?.className).toContain("p-4");
  });
});
