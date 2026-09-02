import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MovementStatusPill } from "./movement-status-pill";
import { MOVEMENT_STATUSES, MOVEMENT_STATUS_LABELS } from "@/lib/balance-status";

describe("MovementStatusPill", () => {
  it("renders a human label for every status", () => {
    for (const status of MOVEMENT_STATUSES) {
      const { unmount } = render(<MovementStatusPill status={status} />);
      expect(screen.getByText(MOVEMENT_STATUS_LABELS[status])).toBeInTheDocument();
      unmount();
    }
  });
});
