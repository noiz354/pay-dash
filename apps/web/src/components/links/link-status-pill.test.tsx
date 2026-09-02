import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LinkStatusPill } from "./link-status-pill";
import { LINK_STATUSES, LINK_STATUS_LABELS } from "@/lib/link-status";

describe("LinkStatusPill", () => {
  it("renders a human label for every status", () => {
    for (const status of LINK_STATUSES) {
      const { unmount } = render(<LinkStatusPill status={status} />);
      expect(screen.getByText(LINK_STATUS_LABELS[status])).toBeInTheDocument();
      unmount();
    }
  });

  it("colours paid and cancelled distinctly from open and expired", () => {
    const { container } = render(<LinkStatusPill status="PAID" />);
    expect(container.querySelector("span")).toHaveClass("text-[var(--success-status)]");

    const { container: c2 } = render(<LinkStatusPill status="CANCELLED" />);
    expect(c2.querySelector("span")).toHaveClass("text-[var(--failed-status)]");
  });
});
