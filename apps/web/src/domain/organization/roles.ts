import { z } from "zod";

/**
 * Organization-scoped RBAC (organization-access). This replaces the broad
 * `User.role` (ADMIN/DEVELOPER/ANALYST/RISK_ANALYST) assumptions that cannot
 * authorize money movement. Authorization is always resolved from the
 * authenticated membership, never from the browser.
 */

export const OrganizationRoleSchema = z.enum([
  "OWNER",
  "FINANCE_ADMIN",
  "FINANCE_OPERATOR",
  "DEVELOPER",
  "ANALYST",
  "COMPLIANCE_ANALYST",
  "RISK_ANALYST",
  "SUPPORT",
]);

export type OrganizationRole = z.infer<typeof OrganizationRoleSchema>;
export const ORGANIZATION_ROLES: readonly OrganizationRole[] = OrganizationRoleSchema.options;

export const PermissionSchema = z.enum([
  // Provider lifecycle (sensitive).
  "provider.connect.live",
  "provider.connect.test",
  "provider.rotate",
  "provider.disconnect",
  // Money-in.
  "money_in.create",
  // Payouts.
  "payout.create",
  "payout.release",
  "payout.cancel",
  "payout.retry",
  // Refunds.
  "refund.prepare",
  "refund.execute",
  // Transfers / split routing.
  "transfer.execute",
  "split.prepare",
  "split.activate",
  // KYC.
  "kyc.prepare",
  "kyc.submit",
  // Recurring.
  "recurring.create",
  "recurring.immediate_charge",
  // Read-only / reporting.
  "report.export",
  "customer.read",
  "transaction.read",
  "audit.read",
  // Administration.
  "team.manage",
  "settings.manage",
]);

export type Permission = z.infer<typeof PermissionSchema>;
export const PERMISSIONS: readonly Permission[] = PermissionSchema.options;

/**
 * Least-privilege permission matrix. A role is granted exactly the permissions
 * it needs; no role inherits another's rights implicitly.
 */
export const ROLE_PERMISSIONS: Record<OrganizationRole, readonly Permission[]> = {
  OWNER: [
    "provider.connect.live",
    "provider.connect.test",
    "provider.rotate",
    "provider.disconnect",
    "money_in.create",
    "payout.create",
    "payout.release",
    "payout.cancel",
    "payout.retry",
    "refund.prepare",
    "refund.execute",
    "transfer.execute",
    "split.prepare",
    "split.activate",
    "kyc.prepare",
    "kyc.submit",
    "recurring.create",
    "recurring.immediate_charge",
    "report.export",
    "customer.read",
    "transaction.read",
    "audit.read",
    "team.manage",
    "settings.manage",
  ],
  FINANCE_ADMIN: [
    "money_in.create",
    "payout.create",
    "payout.release",
    "payout.cancel",
    "payout.retry",
    "refund.prepare",
    "refund.execute",
    "transfer.execute",
    "split.prepare",
    "split.activate",
    "recurring.create",
    "recurring.immediate_charge",
    "report.export",
    "customer.read",
    "transaction.read",
    "audit.read",
  ],
  FINANCE_OPERATOR: [
    "money_in.create",
    "payout.create",
    "refund.prepare",
    "split.prepare",
    "recurring.create",
    "report.export",
    "customer.read",
    "transaction.read",
  ],
  DEVELOPER: [
    "provider.connect.test",
    "provider.rotate",
    "money_in.create",
    "transaction.read",
    "report.export",
  ],
  ANALYST: ["customer.read", "transaction.read", "report.export", "audit.read"],
  COMPLIANCE_ANALYST: ["kyc.prepare", "kyc.submit", "customer.read", "transaction.read", "audit.read"],
  RISK_ANALYST: ["customer.read", "transaction.read", "audit.read", "report.export"],
  SUPPORT: ["customer.read", "transaction.read", "refund.prepare"],
};

export type RoleDefinition = {
  value: OrganizationRole;
  label: string;
  description: string;
  permissions: readonly Permission[];
};

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = ORGANIZATION_ROLES.map((role) => ({
  value: role,
  label: role
    .toLowerCase()
    .split("_")
    .map((s) => s.charAt(0) + s.slice(1))
    .join(" "),
  description: "",
  permissions: ROLE_PERMISSIONS[role],
}));

export function hasPermission(role: OrganizationRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** A user may hold several roles; a permission is granted if any role grants it. */
export function authorizeRoles(roles: readonly OrganizationRole[], permission: Permission): boolean {
  return roles.some((role) => hasPermission(role, permission));
}

/** Resolve a session candidate into a validated role set. */
export function parseRoles(value: unknown): OrganizationRole[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is OrganizationRole => OrganizationRoleSchema.safeParse(v).success);
}
