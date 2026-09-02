import * as React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntlProvider } from "next-intl";
import { CustomerStatusPill } from "@/components/customers/customer-status-pill";
import { CustomerAvatar, paletteFor } from "@/components/customers/customer-avatar";
import { CustomerEmptyState } from "@/components/customers/customer-empty-state";

// The empty state renders the next-intl Link, which needs an intl context.
function renderWithIntl(ui: React.ReactElement) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      {ui}
    </IntlProvider>
  );
}

describe("CustomerStatusPill", () => {
  it("renders a human label for every status", () => {
    const { rerender } = render(<CustomerStatusPill status="ACTIVE" />);
    expect(screen.getByText("Active")).toBeInTheDocument();

    rerender(<CustomerStatusPill status="REVIEW" />);
    expect(screen.getByText("Review")).toBeInTheDocument();

    rerender(<CustomerStatusPill status="BLOCKED" />);
    expect(screen.getByText("Archived")).toBeInTheDocument();

    rerender(<CustomerStatusPill status="NEW" />);
    expect(screen.getByText("New")).toBeInTheDocument();
  });
});

describe("CustomerAvatar", () => {
  it("falls back to a question mark instead of an empty block", () => {
    render(<CustomerAvatar name="Unknown" initials="" seed="unknown@example.com" />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("assigns a deterministic palette per seed", () => {
    expect(paletteFor("tony@stark.com")).toBe(paletteFor("tony@stark.com"));
  });
});

describe("CustomerEmptyState", () => {
  it("distinguishes no-data from no-match", () => {
    const { rerender } = renderWithIntl(<CustomerEmptyState variant="no-data" />);
    expect(screen.getByText("No customers yet")).toBeInTheDocument();

    rerender(
      <IntlProvider locale="en" messages={{}}>
        <CustomerEmptyState variant="no-match" />
      </IntlProvider>
    );
    expect(screen.getByText("No customers match these filters")).toBeInTheDocument();

    rerender(
      <IntlProvider locale="en" messages={{}}>
        <CustomerEmptyState variant="no-payments" />
      </IntlProvider>
    );
    expect(screen.getByText("No payments yet")).toBeInTheDocument();
  });
});
