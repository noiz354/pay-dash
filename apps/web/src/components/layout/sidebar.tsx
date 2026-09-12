"use client";

import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, PINNED_NAV } from "@/components/navigation/nav-config";
import { isNavActive } from "@/components/navigation/route-resolver";
import { filterNavByRoles, getVisiblePinned } from "@/components/navigation/permission-adapter";
import type { OrganizationRole } from "@/domain/organization/roles";

// Wave1: Grouped, permission-aware, collapsed-persisted, single-source-of-truth sidebar
// - Desktop: fixed left, grouped sections (Overview / Money In/Out / Governance / Operations / Developer)
// - Collapsed: icons only, persisted in localStorage, tooltip on hover
// - Mobile: hidden (BottomNav handles mobile via More sheet)
// - Active state via route-resolver (alias + nested + locale stripped)

const COLLAPSED_KEY = "paydash:nav:collapsed";

export type SidebarProps = {
  roles?: OrganizationRole[];
  // For tests / server override: initial collapsed state before hydration
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (v: boolean) => void;
};

export function Sidebar({ roles, defaultCollapsed = false, collapsed: controlledCollapsed, onCollapsedChange }: SidebarProps) {
  const pathname = usePathname() ?? "";
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(defaultCollapsed);
  const [hydrated, setHydrated] = useState(false);
  const isControlled = controlledCollapsed !== undefined && onCollapsedChange !== undefined;
  const collapsed = isControlled ? controlledCollapsed! : internalCollapsed;
  const setCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void = (next) => {
    if (isControlled) {
      const val = typeof next === "function" ? (next as (p: boolean) => boolean)(controlledCollapsed!) : next;
      onCollapsedChange!(val);
    } else {
      setInternalCollapsed((prev) => (typeof next === "function" ? (next as (p: boolean) => boolean)(prev) : next));
    }
  };

  // Persisted collapsed (only in uncontrolled mode)
  useEffect(() => {
    if (isControlled) {
      setHydrated(true);
      return;
    }
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      if (raw !== null) setInternalCollapsed(raw === "1");
    } catch {}
    setHydrated(true);
  }, [isControlled]);

  useEffect(() => {
    if (isControlled || !hydrated) return;
    try {
      localStorage.setItem(COLLAPSED_KEY, internalCollapsed ? "1" : "0");
    } catch {}
  }, [internalCollapsed, hydrated, isControlled]);

  // Permission filtering (visible sections)
  const sections = roles ? filterNavByRoles(NAV_SECTIONS, roles) : NAV_SECTIONS;
  const pinned = roles ? getVisiblePinned(roles) : PINNED_NAV;

  return (
    <aside
      data-testid="sidebar"
      aria-label="Primary"
      className={cn(
        "hidden md:fixed md:inset-y-0 md:left-0 md:flex md:flex-col border-r bg-[var(--surface-container-lowest)] transition-all duration-200",
        collapsed ? "md:w-[72px]" : "md:w-[280px]"
      )}
    >
      <div className="flex h-16 items-center gap-2 px-3 border-b shrink-0">
        <div className={cn("flex items-center gap-2 min-w-0", collapsed && "justify-center w-full")}>
          <div className="h-8 w-8 rounded-full bg-[var(--primary)] text-[var(--on-primary)] flex items-center justify-center text-sm font-bold shrink-0">P</div>
          {!collapsed && <span className="font-semibold truncate">PayDash</span>}
        </div>
        {!collapsed && (
          <button
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            onClick={() => setCollapsed((v) => !v)}
            className="ml-auto rounded-full p-2 hover:bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden>chevron_left</span>
          </button>
        )}
      </div>

      {collapsed && (
        <button
          aria-label="Expand navigation"
          onClick={() => setCollapsed(false)}
          className="mx-auto mt-2 rounded-full p-2 hover:bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]"
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden>chevron_right</span>
        </button>
      )}

      <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {sections.map((section) => (
          <div key={section.id} className="mb-4">
            {!collapsed && (
              <div className="px-4 py-1.5 text-[11px] font-semibold tracking-widest text-[var(--on-surface-variant)] uppercase">{section.label}</div>
            )}
            {collapsed && <div className="mx-3 my-2 h-px bg-[var(--outline-variant)]" aria-hidden />}
            <nav className="px-2 space-y-1" aria-label={section.label}>
              {section.items.map((item) => {
                const active = isNavActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href as never}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-full px-3 py-2 text-sm transition-colors",
                      collapsed ? "justify-center px-2" : "",
                      active
                        ? "bg-[var(--secondary-container)] text-[var(--on-secondary-container)] font-medium"
                        : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)]"
                    )}
                  >
                    <span className="material-symbols-outlined text-[20px] shrink-0" aria-hidden>{item.icon}</span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      <div className="border-t p-2 shrink-0 space-y-1">
        {pinned.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href as never}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-full px-3 py-2 text-sm",
                collapsed ? "justify-center px-2" : "",
                active
                  ? "bg-[var(--secondary-container)] text-[var(--on-secondary-container)] font-medium"
                  : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]"
              )}
            >
              <span className="material-symbols-outlined text-[20px] shrink-0" aria-hidden>{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
        {!collapsed && (
          <div className="px-2 py-2 text-xs text-[var(--on-surface-variant)]">
            {/* Collapsed hint */} 
          </div>
        )}
      </div>
    </aside>
  );
}

// For testing: export collapsed key
export const SIDEBAR_COLLAPSED_KEY = COLLAPSED_KEY;
