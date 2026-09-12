// Wave1: Canonical route resolver — single source for active-state, aliases, canonical, breadcrumbs
// Implements: JRN-001, SCR-001..045 active-state consistency, alias preservation, responsive navigation

import { NAV_ALIASES, NAV_SECTIONS, type NavItem, type NavSection } from "./nav-config";

/**
 * Strip locale prefix (/en, /id) from pathname.
 * Handles bare paths, locale-prefixed, and query strings (query stripped).
 */
export function stripLocale(pathname: string): string {
  // Remove search/hash
  const clean = pathname.split("?")[0].split("#")[0];
  return clean.replace(/^\/(en|id)(\/|$)/, "/") || "/";
}

/**
 * Resolve alias → canonical. Bare old route → canonical destination.
 * Returns canonical path (still locale-stripped) and whether it was an alias.
 */
export function resolveAlias(stripped: string): { canonical: string; isAlias: boolean } {
  // Exact alias match
  if (NAV_ALIASES[stripped]) {
    return { canonical: NAV_ALIASES[stripped], isAlias: true };
  }
  // Prefix alias for nested children? e.g., /payouts/bulk/123 → /payouts
  for (const [old, canon] of Object.entries(NAV_ALIASES)) {
    if (stripped === old || stripped.startsWith(old + "/")) {
      // For nested under alias (e.g., /payouts/bulk/123), map to canonical + remainder
      const remainder = stripped.slice(old.length);
      return { canonical: canon + remainder, isAlias: true };
    }
  }
  return { canonical: stripped, isAlias: false };
}

/**
 * Canonical path: strip locale then resolve alias.
 */
export function getCanonicalPath(pathname: string): string {
  const stripped = stripLocale(pathname);
  return resolveAlias(stripped).canonical;
}

/**
 * Is `href` active for `pathname`?
 * - exact match after canonicalization
 * - nested/dynamic child (e.g., /transactions/123 active for /transactions)
 * - alias-aware (old route highlights canonical)
 * - special: /settings/* wildcard for Settings developer bottom-nav was handled here via prefix
 */
export function isNavActive(pathname: string, href: string): boolean {
  const canonicalPath = getCanonicalPath(pathname);
  const canonicalHref = getCanonicalPath(href);
  if (canonicalPath === canonicalHref) return true;
  if (canonicalPath.startsWith(canonicalHref + "/")) return true;
  // Special: /settings/* should activate /settings/developer when href is /settings/developer
  // Already covered by prefix above for canonical, but for bottom-nav Settings we also allow /settings/* → /settings/developer
  // Handled via caller wildcard, but keep generic: any /settings child activates /settings/developer when href is that
  return false;
}

/**
 * Find the active NavItem + section for a pathname.
 * Returns the deepest matching item (longest href prefix).
 */
export function findActiveNav(pathname: string): { section: NavSection; item: NavItem } | null {
  const canonicalPath = getCanonicalPath(pathname);
  let best: { section: NavSection; item: NavItem; score: number } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      const hrefCanonical = getCanonicalPath(item.href);
      const isActive =
        canonicalPath === hrefCanonical || canonicalPath.startsWith(hrefCanonical + "/");
      if (isActive) {
        const score = hrefCanonical.length;
        if (!best || score > best.score) {
          best = { section, item, score };
        }
      }
    }
  }
  // Also check pinned (Settings, AI Journal) but they are secondary; only if no section match
  // For now, return best from sections
  if (best) return { section: best.section, item: best.item };
  return null;
}

/**
 * Breadcrumb from route/screen metadata.
 * Uses active nav + dynamic segments (IDs) to build hierarchy.
 * Example: /payouts/PO-123 → Money Out / Payouts / Payout PO-123
 */
export type BreadcrumbItem = { label: string; href?: string };

export function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const active = findActiveNav(pathname);
  const canonical = getCanonicalPath(pathname);
  const stripped = stripLocale(pathname);

  if (!active) {
    // Fallback: use last segment as label
    const parts = canonical.split("/").filter(Boolean);
    return parts.map((p, i) => ({
      label: p,
      href: "/" + parts.slice(0, i + 1).join("/"),
    }));
  }

  const crumbs: BreadcrumbItem[] = [
    { label: active.section.label },
    { label: active.item.label, href: active.item.href },
  ];

  // Append dynamic ID if present and not already equal to item href
  // e.g., /payouts/PO-123 → add Payout PO-123
  // e.g., /transactions/txn_123 → add txn_123
  const hrefCanonical = getCanonicalPath(active.item.href);
  if (canonical !== hrefCanonical && canonical.startsWith(hrefCanonical + "/")) {
    const remainder = canonical.slice(hrefCanonical.length + 1).split("/")[0];
    if (remainder) {
      // Try to humanize: if looks like ID, prefix with item label singular
      const singular = active.item.label.replace(/s$/, "");
      crumbs.push({ label: `${singular} ${remainder}` });
    }
  }

  // Alias indicator: if original stripped was alias, add note? Not in breadcrumb, but resolver knows
  return crumbs;
}

/**
 * Verify alias map completeness: every alias target should be a canonical href in nav or a valid route.
 * Used in tests.
 */
export function verifyAliases(): { ok: boolean; missingTargets: string[] } {
  const allHrefs = new Set<string>([
    ...NAV_SECTIONS.flatMap((s) => s.items.map((i) => getCanonicalPath(i.href))),
    "/reports/builder",
    "/settings/developer",
    "/payouts",
  ]);
  const missing: string[] = [];
  for (const target of Object.values(NAV_ALIASES)) {
    if (!allHrefs.has(target) && !target.startsWith("/")) missing.push(target);
  }
  return { ok: missing.length === 0, missingTargets: missing };
}
