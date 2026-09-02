import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WebhookStatusPill } from "./webhook-status-pill";
import { WEBHOOK_STATUSES, WEBHOOK_STATUS_LABELS } from "@/lib/webhook-status";

describe("WebhookStatusPill", () => {
  it("renders a human label for every status", () => {
    for (const status of WEBHOOK_STATUSES) {
      const { unmount } = render(<WebhookStatusPill status={status} />);
      expect(screen.getByText(WEBHOOK_STATUS_LABELS[status])).toBeInTheDocument();
      unmount();
    }
  });

  it("colours received, duplicated and rejected distinctly", () => {
    const { container } = render(<WebhookStatusPill status="RECEIVED" />);
    expect(container.querySelector("span")).toHaveClass("text-[var(--success-status)]");

    const { container: c2 } = render(<WebhookStatusPill status="DUPLICATED" />);
    expect(c2.querySelector("span")).toHaveClass("text-[var(--pending-status)]");

    const { container: c3 } = render(<WebhookStatusPill status="REJECTED" />);
    expect(c3.querySelector("span")).toHaveClass("text-[var(--failed-status)]");
  });
});
