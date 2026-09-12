import { describe, it, expect } from "vitest";
import { stripLocale, resolveAlias, getCanonicalPath, isNavActive, findActiveNav, getBreadcrumbs } from "./route-resolver";
import { NAV_SECTIONS } from "./nav-config";

describe("route-resolver", () => {
  describe("stripLocale", () => {
    it("strips /en and /id prefixes", () => {
      expect(stripLocale("/en/dashboard")).toBe("/dashboard");
      expect(stripLocale("/id/transactions/123")).toBe("/transactions/123");
      expect(stripLocale("/dashboard")).toBe("/dashboard");
      expect(stripLocale("/en")).toBe("/");
      expect(stripLocale("/en/transactions?foo=1")).toBe("/transactions");
    });
  });

  describe("resolveAlias", () => {
    it("resolves exact alias", () => {
      expect(resolveAlias("/payouts/bulk")).toEqual({ canonical: "/payouts", isAlias: true });
      expect(resolveAlias("/payments/platform")).toEqual({ canonical: "/settings/developer", isAlias: true });
      expect(resolveAlias("/reports")).toEqual({ canonical: "/reports/builder", isAlias: true });
    });
    it("resolves prefix alias for nested children", () => {
      expect(resolveAlias("/payouts/bulk/123")).toEqual({ canonical: "/payouts/123", isAlias: true });
    });
    it("returns canonical false for non-alias", () => {
      expect(resolveAlias("/transactions")).toEqual({ canonical: "/transactions", isAlias: false });
    });
  });

  describe("getCanonicalPath", () => {
    it("strips locale and alias", () => {
      expect(getCanonicalPath("/en/payouts/bulk")).toBe("/payouts");
      expect(getCanonicalPath("/id/payments/platform")).toBe("/settings/developer");
      expect(getCanonicalPath("/en/transactions/123")).toBe("/transactions/123");
    });
  });

  describe("isNavActive", () => {
    it("exact match", () => {
      expect(isNavActive("/transactions", "/transactions")).toBe(true);
    });
    it("nested child active", () => {
      expect(isNavActive("/transactions/123", "/transactions")).toBe(true);
      expect(isNavActive("/transactions/123/edit", "/transactions")).toBe(true);
    });
    it("not active for sibling", () => {
      expect(isNavActive("/balance", "/transactions")).toBe(false);
    });
    it("alias active maps to canonical", () => {
      // pathname is old alias, href is canonical
      expect(isNavActive("/payouts/bulk", "/payouts")).toBe(true);
      expect(isNavActive("/en/payouts/bulk", "/payouts")).toBe(true);
      // pathname canonical, href alias canonical same
      expect(isNavActive("/payouts", "/payouts/bulk")).toBe(true); // both resolve to /payouts, so exact
    });
    it("locale stripped", () => {
      expect(isNavActive("/en/transactions", "/transactions")).toBe(true);
      expect(isNavActive("/en/transactions/123", "/transactions")).toBe(true);
    });
  });

  describe("findActiveNav", () => {
    it("finds active item for canonical path", () => {
      const res = findActiveNav("/transactions");
      expect(res?.item.href).toBe("/transactions");
      expect(res?.section.id).toBe("money-in");
    });
    it("finds active via alias", () => {
      const res = findActiveNav("/payouts/bulk");
      expect(res?.item.href).toBe("/payouts");
    });
    it("finds deepest match for nested", () => {
      const res = findActiveNav("/fraud/blocklist/123");
      expect(res?.item.href).toBe("/fraud/blocklist");
    });
    it("returns null for unknown", () => {
      expect(findActiveNav("/unknown-xyz")).toBeNull();
    });
  });

  describe("getBreadcrumbs", () => {
    it("returns section + item", () => {
      expect(getBreadcrumbs("/transactions")).toEqual([
        { label: "Money In" },
        { label: "Transactions", href: "/transactions" },
      ]);
    });
    it("appends dynamic ID", () => {
      const crumbs = getBreadcrumbs("/transactions/txn_123");
      expect(crumbs).toHaveLength(3);
      expect(crumbs[2].label).toContain("txn_123");
    });
    it("alias breadcrumb resolves to Money Out / Payouts", () => {
      const crumbs = getBreadcrumbs("/payouts/bulk");
      expect(crumbs[0].label).toBe("Money Out");
      expect(crumbs[1].label).toBe("Payouts");
    });
    it("handles locale prefix", () => {
      const crumbs = getBreadcrumbs("/en/dashboard");
      expect(crumbs[1].label).toBe("Dashboard");
    });
  });

  describe("nav-config sync sanity", () => {
    it("FLAT length matches sections", () => {
      const flat = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
      expect(flat.length).toBeGreaterThan(15);
      // Unique check (FE-001 fix for duplicate)
      expect(new Set(flat).size).toBe(flat.length);
    });
    it("reports and onboarding present", () => {
      const flat = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
      expect(flat).toContain("/reports/builder");
      expect(flat).toContain("/onboarding");
    });
  });
});
