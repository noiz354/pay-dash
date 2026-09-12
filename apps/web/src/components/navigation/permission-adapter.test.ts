import { describe, it, expect } from "vitest";
import { filterNavByRoles, isNavItemVisible, isPathAllowed, getVisibleNav } from "./permission-adapter";
import { NAV_SECTIONS } from "./nav-config";

describe("permission-adapter", () => {
  describe("isNavItemVisible", () => {
    it("visible when no permission required", () => {
      expect(isNavItemVisible({ href: "/dashboard", label: "Dashboard", icon: "a" }, ["SUPPORT"])).toBe(true);
    });
    it("hidden when role lacks permission", () => {
      expect(isNavItemVisible({ href: "/team", label: "Team", icon: "a", requiresPermission: "team.manage" }, ["SUPPORT"])).toBe(false);
    });
    it("visible when role has permission", () => {
      expect(isNavItemVisible({ href: "/team", label: "Team", icon: "a", requiresPermission: "team.manage" }, ["OWNER"])).toBe(true);
    });
  });

  describe("filterNavByRoles", () => {
    it("filters restricted items for the least-privileged role", () => {
      const visible = filterNavByRoles(NAV_SECTIONS, ["SUPPORT"]);
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
    it("filters Operations to only KYC for SUPPORT (fraud items require audit.read)", () => {
      const visible = filterNavByRoles(NAV_SECTIONS, ["SUPPORT"]);
      const ops = visible.find((s) => s.id === "operations");
      expect(ops).toBeDefined();
      const hrefs = ops!.items.map((i) => i.href);
      expect(hrefs).toEqual(["/kyc"]);
      expect(hrefs).not.toContain("/fraud");
    });
  });

  describe("isPathAllowed", () => {
    it("denies direct URL for SUPPORT on team", () => {
      expect(isPathAllowed("/team", ["SUPPORT"]).allowed).toBe(false);
      expect(isPathAllowed("/team", ["SUPPORT"]).requires).toBe("team.manage");
    });
    it("allows SUPPORT on public routes", () => {
      expect(isPathAllowed("/transactions", ["SUPPORT"]).allowed).toBe(true);
    });
    it("allows owner everywhere", () => {
      expect(isPathAllowed("/audit", ["OWNER"]).allowed).toBe(true);
    });
    it("allows alias-resolved path via canonical permission", () => {
      // /payouts/bulk resolves to /payouts which has no restriction, so allowed even for SUPPORT
      expect(isPathAllowed("/payouts/bulk", ["SUPPORT"]).allowed).toBe(true);
    });
    it("handles locale prefix", () => {
      expect(isPathAllowed("/en/team", ["SUPPORT"]).allowed).toBe(false);
      expect(isPathAllowed("/en/transactions", ["SUPPORT"]).allowed).toBe(true);
    });
  });

  describe("getVisibleNav", () => {
    it("never exposes backend authz bypass — hidden != allowed direct access", () => {
      const supportNav = getVisibleNav(["SUPPORT"]);
      const flat = supportNav.flatMap((s) => s.items.map((i) => i.href));
      // The nav hides team, but the direct URL check still denies it
      expect(flat).not.toContain("/team");
      expect(isPathAllowed("/team", ["SUPPORT"]).allowed).toBe(false);
    });
  });
});
