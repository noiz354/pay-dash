// FE-001: Canonical grouped navigation config — single source of truth for Sidebar + BottomNav + Command Palette
// Implements: JRN-001, SCR-001..045, INT-... grouped IA 5 sections (Money In/Out, Governance, Operations, Developer)
// Sync with `src/proxy.ts APP_ROUTE_PREFIXES` and `next.config.ts appRoutes` — prefix match covers dynamic children.

import type { Permission } from "@/domain/organization/roles";

export type NavItem = {
  href: string;
  label: string;
  icon: string; // material-symbols
  requiresPermission?: Permission;
  badge?: string; // optional count key
};

export type NavSection = {
  id: string;
  label: string;
  icon?: string;
  items: NavItem[];
  requiresPermission?: Permission;
};

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard" }],
  },
  {
    id: "money-in",
    label: "Money In",
    items: [
      { href: "/transactions", label: "Transactions", icon: "receipt_long" },
      { href: "/balance", label: "Balance", icon: "account_balance" },
      { href: "/payments/links", label: "Payment Links", icon: "link" },
      { href: "/subscriptions", label: "Subscriptions", icon: "autorenew" },
      { href: "/billing", label: "Billing", icon: "request_quote" },
      { href: "/customers", label: "Customers", icon: "group" },
    ],
  },
  {
    id: "money-out",
    label: "Money Out",
    items: [
      { href: "/payouts", label: "Payouts", icon: "payments" },
      // Alias safety: old routes remain valid via next.config.ts rewrites + proxy rewrites
      // Bulk and Settings are now tabs within Payouts hub (SCR-013) — these hrefs redirect canonically
      { href: "/payouts/bulk", label: "Bulk Payouts", icon: "upload_file" },
      { href: "/payouts/settings", label: "Payout Settings", icon: "account_balance_wallet" },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    items: [
      { href: "/team", label: "Team", icon: "group", requiresPermission: "team.manage" },
      { href: "/audit", label: "Audit Log", icon: "history", requiresPermission: "audit.read" },
      { href: "/reports/builder", label: "Reports", icon: "analytics" },
      { href: "/support", label: "Support", icon: "help" },
      { href: "/system", label: "System", icon: "monitor_heart" },
      { href: "/onboarding", label: "Onboarding", icon: "checklist" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: "/fraud", label: "Fraud", icon: "shield", requiresPermission: "audit.read" },
      { href: "/fraud/blocklist", label: "Blocklist", icon: "block", requiresPermission: "audit.read" },
      { href: "/risk", label: "Risk", icon: "warning", requiresPermission: "audit.read" },
      { href: "/kyc", label: "KYC", icon: "verified_user" },
    ],
  },
  {
    id: "developer",
    label: "Developer",
    items: [
      { href: "/settings/developer", label: "Overview", icon: "code" },
      { href: "/settings/api-keys", label: "API Keys", icon: "key", requiresPermission: "provider.rotate" },
      { href: "/webhooks", label: "Webhooks", icon: "webhook", requiresPermission: "provider.connect.test" },
      { href: "/settings/mcp", label: "MCP", icon: "smart_toy" },
      { href: "/payments/platform", label: "Platform", icon: "account_balance" },
    ],
  },
];

// Flat list for matcher / proxy sync convenience (kept in sync manually — add test to enforce)
export const FLAT_NAV_HREFS = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));

// Pinned footer items (always visible, separate from grouped sections)
export const PINNED_NAV: NavItem[] = [
  { href: "/settings", label: "Settings", icon: "tune" },
  { href: "/ai-journal", label: "AI Journal", icon: "auto_awesome" },
];

// Alias map for migration safety: old → canonical (308 redirect). Old remains valid via rewrites.
export const NAV_ALIASES: Record<string, string> = {
  "/payouts/bulk": "/payouts",
  "/payouts/settings": "/payouts",
  "/payments/platform": "/settings/developer",
  "/reports": "/reports/builder",
};
