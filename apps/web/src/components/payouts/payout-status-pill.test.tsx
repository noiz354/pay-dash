import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PayoutStatusPill } from "./payout-status-pill";
import { RecipientStatusPill } from "./recipient-status-pill";
import { PAYOUT_STATUSES, PAYOUT_STATUS_LABELS, RECIPIENT_STATUSES } from "@/lib/payout-status";

describe("PayoutStatusPill", () => {
  it.each(PAYOUT_STATUSES)("renders %s with its label", (status) => {
    const { unmount } = render(<PayoutStatusPill status={status} />);
    expect(screen.getByText(PAYOUT_STATUS_LABELS[status])).toBeInTheDocument();
    expect(screen.getByTestId(`payout-status-${status}`)).toBeInTheDocument();
    unmount();
  });

  it("can hide the icon", () => {
    render(<PayoutStatusPill status="PAID" showIcon={false} />);
    expect(screen.getByTestId("payout-status-PAID").textContent).toBe("Paid");
  });
});

describe("RecipientStatusPill", () => {
  it.each(RECIPIENT_STATUSES)("renders %s", (status) => {
    const { unmount } = render(<RecipientStatusPill status={status} />);
    expect(screen.getByText(status.charAt(0) + status.slice(1).toLowerCase())).toBeInTheDocument();
    unmount();
  });
});
