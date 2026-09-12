import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar, SIDEBAR_COLLAPSED_KEY } from "./sidebar";

// Mock next-intl navigation
vi.mock("@/i18n/navigation", async () => {
  const actual = await vi.importActual("@/i18n/navigation");
  return {
    ...(actual as any),
    usePathname: vi.fn(() => "/dashboard"),
    Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
  };
});

import { usePathname } from "@/i18n/navigation";

describe("Sidebar grouped IA (Wave1)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(usePathname).mockReturnValue("/dashboard");
  });

  it("renders grouped sections: Overview, Money In, Money Out, Governance, Operations, Developer", () => {
    render(<Sidebar />);
    // Use nav aria-labels to avoid ambiguous item label "Overview" under Developer
    expect(screen.getByRole("navigation", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Money In" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Money Out" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Governance" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Operations" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Developer" })).toBeInTheDocument();
    expect(screen.getAllByText("Developer").length).toBeGreaterThanOrEqual(1);
  });

  it("active state via route-resolver: /transactions/123 highlights Transactions", () => {
    vi.mocked(usePathname).mockReturnValue("/transactions/123");
    render(<Sidebar />);
    const link = screen.getByRole("link", { name: /Transactions/ });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("alias active: /payouts/bulk highlights Payouts (Money Out)", () => {
    vi.mocked(usePathname).mockReturnValue("/payouts/bulk");
    render(<Sidebar />);
    const payouts = screen.getByRole("link", { name: /^Payouts$/ });
    expect(payouts).toHaveAttribute("aria-current", "page");
  });

  it("permission-aware: VIEWER hides Team/Audit", () => {
    render(<Sidebar roles={["VIEWER"]} />);
    expect(screen.queryByRole("link", { name: /^Team$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Audit Log/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Transactions/ })).toBeInTheDocument();
  });

  it("owner sees Team", () => {
    render(<Sidebar roles={["OWNER"]} />);
    expect(screen.getByRole("link", { name: /^Team$/ })).toBeInTheDocument();
  });

  it("collapsed persists to localStorage and shows tooltip titles", () => {
    render(<Sidebar />);
    const collapseBtn = screen.getByLabelText(/Collapse navigation/i);
    fireEvent.click(collapseBtn);
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("1");
    // In collapsed mode, titles are set via title attribute
    const dashboardLink = screen.getByTitle("Dashboard");
    expect(dashboardLink).toBeInTheDocument();
  });

  it("locale-prefixed pathname still active: /en/transactions", () => {
    vi.mocked(usePathname).mockReturnValue("/en/transactions");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /Transactions/ })).toHaveAttribute("aria-current", "page");
  });

  it("includes reports and onboarding in nav (no unreachable)", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /^Reports$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Onboarding/ })).toBeInTheDocument();
  });

  it("pinned footer Settings and AI Journal", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /^Settings$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /AI Journal/ })).toBeInTheDocument();
  });
});
