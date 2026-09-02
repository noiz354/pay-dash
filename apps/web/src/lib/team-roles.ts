// Client-safe team vocabulary (ADR-0022) — the role catalog and status
// labels are static config (Dashboard RBAC, INTEGRATION.md:318), kept
// client-safe so toolbar filters and row menus can import them without
// bundling the store.

export type TeamRole = "ADMIN" | "DEVELOPER" | "ANALYST" | "RISK_ANALYST";
export type MemberStatus = "ACTIVE" | "INVITED" | "DEACTIVATED";

export type RoleDefinition = {
  value: TeamRole;
  label: string;
  description: string;
  icon: string;
  permissions: string[];
};

export const TEAM_ROLES: RoleDefinition[] = [
  {
    value: "ADMIN",
    label: "Admin",
    description: "Full access to the dashboard, including team and merchant settings.",
    icon: "shield_person",
    permissions: [
      "Team & permissions",
      "Merchant settings",
      "Balance & payouts",
      "Transactions & refunds",
      "Reports & exports",
      "Webhooks & API keys",
    ],
  },
  {
    value: "DEVELOPER",
    label: "Developer",
    description: "Integrations and code-level access to the ledger.",
    icon: "code",
    permissions: ["Webhooks & API keys", "Payment links", "Reports & exports", "Transactions (read)"],
  },
  {
    value: "ANALYST",
    label: "Analyst",
    description: "Read-only analytics over the ledger, customers and reports.",
    icon: "monitoring",
    permissions: ["Reports & exports", "Customers (read)", "Transactions (read)"],
  },
  {
    value: "RISK_ANALYST",
    label: "Risk Analyst",
    description: "Risk, fraud and blocklist operations.",
    icon: "gavel",
    permissions: ["Risk & fraud", "Blocklist", "Transactions (read)", "Reports & exports"],
  },
];

export const ROLE_LABELS: Record<TeamRole, string> = Object.fromEntries(
  TEAM_ROLES.map((r) => [r.value, r.label])
) as Record<TeamRole, string>;

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  ACTIVE: "Active",
  INVITED: "Invited",
  DEACTIVATED: "Deactivated",
};

/** Invites expire after this many days (stated on the Pending Invites tab). */
export const INVITE_TTL_DAYS = 7;
