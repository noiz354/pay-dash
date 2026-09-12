"use client";

import { useState, useMemo } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "@/components/navigation/nav-config";
import { isNavActive, getCanonicalPath } from "@/components/navigation/route-resolver";
import { filterNavByRoles } from "@/components/navigation/permission-adapter";
import type { OrganizationRole } from "@/domain/organization/roles";
import { MobileMoreSheet } from "@/components/navigation/mobile-more-sheet";

// Wave1: BottomNav with More sheet — uses same NAV_SECTIONS source, no duplication
// - 4 primary + More (grouped rest)
// - Active state via route-resolver (alias + nested)
// - Permission-aware: filters by roles if provided
// - More sheet reuses grouped sections

const PRIMARY_HREFS = ["/dashboard", "/transactions", "/payouts", "/balance"] as const;

function findPrimaryItem(href: string) {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.href === href) return item;
    }
  }
  return null;
}

const PRIMARY_ITEMS = PRIMARY_HREFS.map((href) => findPrimaryItem(href)).filter(Boolean) as NonNullable<ReturnType<typeof findPrimaryItem>>[];

// Display label overrides for mobile compactness (preserve FE-015 test contract)
const BOTTOM_LABELS: Record<string, string> = {
  "/dashboard": "Home",
  "/transactions": "Transact",
};

export type BottomNavProps = {
  activeHref?: string;
  roles?: OrganizationRole[];
};

export function BottomNav({ activeHref, roles }: BottomNavProps) {
  const pathname = usePathname() ?? "";
  const current = getCanonicalPath(activeHref ?? pathname ?? "");
  const [moreOpen, setMoreOpen] = useState(false);

  const sections = useMemo(() => (roles ? filterNavByRoles(NAV_SECTIONS, roles) : NAV_SECTIONS), [roles]);

  // Determine if More is active (any non-primary route that is in nav but not primary)
  const moreActive = useMemo(() => {
    const primaryCanonical = new Set(PRIMARY_HREFS.map(getCanonicalPath));
    // If current matches any primary, not more
    for (const href of primaryCanonical) {
      if (current === href || current.startsWith(href + "/")) return false;
    }
    // If current matches any other nav item, then More is active
    for (const section of sections) {
      for (const item of section.items) {
        const c = getCanonicalPath(item.href);
        if (current === c || current.startsWith(c + "/")) {
          // Ensure not primary
          if (!primaryCanonical.has(c)) return true;
        }
      }
    }
    return false;
  }, [current, sections]);

  return (
    <>
      <nav className="fixed bottom-0 z-50 flex h-16 w-full items-center justify-around border-t bg-[var(--surface-container-highest)] shadow-[0_-4px_6px_rgba(0,0,0,0.05)] md:hidden" aria-label="Mobile navigation">
        {PRIMARY_ITEMS.map((item) => {
          // Permission filter: hide if not allowed
          if (roles && item.requiresPermission) {
            // quick check via filter — if item not in visible sections, skip
            const visible = sections.some((s) => s.items.some((i) => i.href === item.href));
            if (!visible) return null;
          }
          const active = isNavActive(current, item.href);
          return (
            <Link
              key={item.href}
              href={item.href as never}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1 body-sm min-w-0",
                active ? "rounded-full bg-[var(--primary-container)] px-4 py-1 text-[var(--on-primary-container)]" : "text-[var(--on-surface-variant)]"
              )}
            >
              <span className="material-symbols-outlined text-[20px] shrink-0" aria-hidden>{item.icon}</span>
              <span className="text-[11px] truncate max-w-[64px]">{BOTTOM_LABELS[item.href] ?? item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          aria-label="More navigation"
          className={cn(
            "flex flex-col items-center gap-1 px-3 py-1 body-sm",
            moreActive ? "rounded-full bg-[var(--primary-container)] px-4 py-1 text-[var(--on-primary-container)]" : "text-[var(--on-surface-variant)]"
          )}
        >
          <span className="material-symbols-outlined text-[20px] shrink-0" aria-hidden>more_horiz</span>
          <span className="text-[11px]">More</span>
        </button>
      </nav>
      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} roles={roles} sections={sections} />
    </>
  );
}
