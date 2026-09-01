import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvoiceStatusPill } from "@/components/billing/invoice-status-pill";
import { InvoicesEmptyState } from "@/components/billing/invoices-empty-state";
import { isPayable, INVOICE_STATUSES } from "@/lib/invoice-status";

describe("InvoiceStatusPill", () => {
  it("renders a label + icon for every status", () => {
    const { rerender } = render(<InvoiceStatusPill status="PAID" />);
    expect(screen.getByText("Paid")).toBeInTheDocument();

    rerender(<InvoiceStatusPill status="PENDING" />);
    expect(screen.getByText("Pending")).toBeInTheDocument();

    rerender(<InvoiceStatusPill status="OVERDUE" />);
    expect(screen.getByText("Overdue")).toBeInTheDocument();

    rerender(<InvoiceStatusPill status="DRAFT" />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("covers the whole status vocabulary", () => {
    for (const s of INVOICE_STATUSES) {
      const { unmount } = render(<InvoiceStatusPill status={s} />);
      unmount();
    }
    expect(INVOICE_STATUSES).toHaveLength(4);
  });
});

describe("isPayable", () => {
  it("only pending and overdue invoices can be paid", () => {
    expect(isPayable("PENDING")).toBe(true);
    expect(isPayable("OVERDUE")).toBe(true);
    expect(isPayable("PAID")).toBe(false);
    expect(isPayable("DRAFT")).toBe(false);
  });
});

describe("InvoicesEmptyState", () => {
  it("phrases each void differently", () => {
    const { rerender } = render(<InvoicesEmptyState variant="no-data" />);
    expect(screen.getByText("No invoices yet")).toBeInTheDocument();

    rerender(<InvoicesEmptyState variant="no-match" />);
    expect(screen.getByText("No invoices match these filters")).toBeInTheDocument();

    rerender(<InvoicesEmptyState variant="no-outstanding" />);
    expect(screen.getByText("No outstanding invoices")).toBeInTheDocument();
  });
});
