import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BottomNav } from "./bottom-nav";

// Mock next-intl navigation usePathname
vi.mock("@/i18n/navigation", async () => {
  const actual = await vi.importActual("@/i18n/navigation");
  return {
    ...(actual as any),
    usePathname: vi.fn(() => "/dashboard"),
    Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
  };
});

import { usePathname } from "@/i18n/navigation";

describe("BottomNav FE-015 active state", () => {
  it("marks /dashboard as active for /dashboard", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");
    render(<BottomNav />);
    const link = screen.getByRole("link", { name: /Home/i });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("marks /transactions as active for nested /transactions/123", () => {
    vi.mocked(usePathname).mockReturnValue("/transactions/123");
    render(<BottomNav />);
    const link = screen.getByRole("link", { name: /Transact/i });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("marks Settings as active for /settings/api-keys (any /settings/*)", () => {
    vi.mocked(usePathname).mockReturnValue("/settings/api-keys");
    render(<BottomNav />);
    const link = screen.getByRole("link", { name: /Settings/i });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("respects explicit activeHref prop over pathname", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");
    render(<BottomNav activeHref="/transactions/456" />);
    const transact = screen.getByRole("link", { name: /Transact/i });
    expect(transact).toHaveAttribute("aria-current", "page");
    const home = screen.getByRole("link", { name: /Home/i });
    expect(home).not.toHaveAttribute("aria-current");
  });
});
