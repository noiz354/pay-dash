import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricCard } from "./metric-card";

describe("MetricCard", () => {
  it("renders label and value with data-mono", () => {
    render(<MetricCard label="Total Volume" value="IDR 1,000.00" />);
    expect(screen.getByText("Total Volume")).toBeInTheDocument();
    expect(screen.getByText("IDR 1,000.00")).toHaveClass("data-mono");
  });
});
