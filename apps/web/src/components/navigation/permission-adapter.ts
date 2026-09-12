// Wave1: Permission-aware navigation adapter — filters nav-config by canonical roles
// Implements: JRN-001 role-aware visibility, security boundary rule (hidden != authz)

import { hasPermission, type OrganizationRole, type Permission } from "@/domain/organization/roles";
import { NAV_SECTIONS, PINNED_NAV, type NavSection, type NavItem } from "./nav-config";
import { findActiveNav, getCanonicalPath } from "./route-resolver";

/**
 * Check if a single nav item is visible for the given roles.
 */
export function isNavItemVisible(item: NavItem, roles: OrganizationRole[]): boolean {
  if (!item.requiresPermission) return true;
  return roles.some((r) => hasPermission(r, item.requiresPermission as Permission));
}

/**
 * Filter sections/items by roles — returns only visible items, and drops empty sections.
 */
export function filterNavByRoles(sections: NavSection[], roles: OrganizationRole[]): NavSection[] {
  return sections
    .map((section) => {
      // Section-level gate (if section has requiresPermission, check it)
      if (section.requiresPermission && !roles.some((r) => hasPermission(r, section.requiresPermission as Permission))) {
        return null;
      }
      const visibleItems = section.items.filter((item) => isNavItemVisible(item, roles));
      if (visibleItems.length === 0) return null;
      return { ...section, items: visibleItems };
    })
    .filter((s): s is NavSection => s !== null);
}

/**
 * Convenience: filter global NAV_SECTIONS by roles.
 */
export function getVisibleNav(roles: OrganizationRole[]): NavSection[] {
  return filterNavByRoles(NAV_SECTIONS, roles);
}

export function getVisiblePinned(roles: OrganizationRole[]): NavItem[] {
  return PINNED_NAV.filter((item) => isNavItemVisible(item, roles));
}

/**
 * For direct URL access: check if pathname is allowed for roles.
 * Uses resolver to find the item that owns the path, then checks its permission.
 * Returns { allowed, requiresPermission }.
 */
export function isPathAllowed(pathname: string, roles: OrganizationRole[]): { allowed: boolean; requires?: Permission; item?: NavItem } {
  const canonical = getCanonicalPath(pathname);
  const active = findActiveNav(pathname);
  if (!active) {
    // No nav owns this path (e.g., /onboarding, /reports/builder, /settings/merchant) — allow by default
    // Their protection is via page-level requireOrgContext, not nav visibility
    return { allowed: true };
  }
  const permission = active.item.requiresPermission;
  if (!permission) return { allowed: true, item: active.item };
  const allowed = roles.some((r) => hasPermission(r, permission));
  return { allowed, requires: permission, item: active.item };
}
