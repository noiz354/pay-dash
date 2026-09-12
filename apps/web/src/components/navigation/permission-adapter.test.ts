import { describe, it, expect } from "vitest";
import { filterNavByRoles, isNavItemVisible, isPathAllowed, getVisibleNav } from "./permission-adapter";
import { NAV_SECTIONS } from "./nav-config";

describe("permission-adapter", () => {
  describe("isNavItemVisible", () => {
    it("visible when no permission required", () => {
      expect(isNavItemVisible({ href: "/dashboard", label: "Dashboard", icon: "a" }, ["VIEWER"])).toBe(true);
    });
    it("hidden when role lacks permission", () => {
      expect(isNavItemVisible({ href: "/team", label: "Team", icon: "a", requiresPermission: "team.manage" }, ["VIEWER"])).toBe(false);
    });
    it("visible when role has permission", () => {
      expect(isNavItemVisible({ href: "/team", label: "Team", icon: "a", requiresPermission: "team.manage" }, ["OWNER"])).toBe(true);
    });
  });

  describe("filterNavByRoles", () => {
    it("filters restricted items for viewer", () => {
      const visible = filterNavByRoles(NAV_SECTIONS, ["VIEWER"]);
      const flat = visible.flatMap((s) => s.items.map((i) => i.href));
      expect(flat).not.toContain("/team");
      expect(flat).not.toContain("/audit");
      expect(flat).toContain("/transactions");
    });
    it("owner sees all", () => {
      const visible = filterNavByRoles(NAV_SECTIONS, ["OWNER"]);
      const flat = visible.flatMap((s) => s.items.map((i) => i.href));
      expect(flat).toContain("/team");
      expect(flat).toContain("/audit");
      expect(flat).toContain("/fraud");
    });
    it("filters Operations to only KYC for viewer (fraud items require audit.read)", () => {
      const visible = filterNavByRoles(NAV_SECTIONS, ["VIEWER"]);
      const ops = visible.find((s) => s.id === "operations");
      expect(ops).toBeDefined();
      const hrefs = ops!.items.map((i) => i.href);
      expect(hrefs).toEqual(["/kyc"]);
      expect(hrefs).not.toContain("/fraud");
    });
  });

  describe("isPathAllowed", () => {
    it("denies direct URL for viewer on team", () => {
      expect(isPathAllowed("/team", ["VIEWER"]).allowed).toBe(false);
      expect(isPathAllowed("/team", ["VIEWER"]).requires).toBe("team.manage");
    });
    it("allows viewer on public routes", () => {
      expect(isPathAllowed("/transactions", ["VIEWER"]).allowed).toBe(true);
    });
    it("allows owner everywhere", () => {
      expect(isPathAllowed("/audit", ["OWNER"]).allowed).toBe(true);
    });
    it("allows alias-resolved path via canonical permission", () => {
      // /payouts/bulk resolves to /payouts which has no restriction, so allowed even for viewer
      expect(isPathAllowed("/payouts/bulk", ["VIEWER"]).allowed).toBe(true);
    });
    it("handles locale prefix", () => {
      expect(isPathAllowed("/en/team", ["VIEWER"]).allowed).toBe(false);
      expect(isPathAllowed("/en/transactions", ["VIEWER"]).allowed).toBe(true);
    });
  });

  describe("getVisibleNav", () => {
    it("never exposes backend authz bypass — hidden != allowed direct access", () => {
      const viewerNav = getVisibleNav(["VIEWER"]);
      const flat = viewerNav.flatMap((s) => s.items.map((i) => i.href));
      // Viewer nav hides team, but direct check still denies
      expect(flat).not.toContain("/team");
      expect(isPathAllowed("/team", ["VIEWER"]).allowed).toBe(false);
    });
  });
});
