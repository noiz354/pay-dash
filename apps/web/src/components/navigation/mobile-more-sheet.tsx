"use client";

import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { NAV_SECTIONS, PINNED_NAV, type NavSection } from "./nav-config";
import { isNavActive } from "./route-resolver";
import { filterNavByRoles } from "./permission-adapter";
import type { OrganizationRole } from "@/domain/organization/roles";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  roles?: OrganizationRole[];
  // Optionally override sections (for BottomNav quick access)
  sections?: NavSection[];
};

export function MobileMoreSheet({ open, onClose, roles, sections }: Props) {
  const pathname = usePathname() ?? "";
  const [visibleSections, setVisibleSections] = useState<NavSection[]>(sections ?? NAV_SECTIONS);

  useEffect(() => {
    if (roles) setVisibleSections(filterNavByRoles(sections ?? NAV_SECTIONS, roles));
    else setVisibleSections(sections ?? NAV_SECTIONS);
  }, [roles, sections]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // Prevent body scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="More navigation">
      {/* Backdrop */}
      <button aria-label="Close navigation" onClick={onClose} className="absolute inset-0 bg-black/40" />
      {/* Sheet */}
      <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-auto rounded-t-2xl bg-[var(--surface)] p-4 shadow-xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--outline-variant)]" aria-hidden />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Navigation</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-[var(--surface-container-high)]">
            <span className="material-symbols-outlined" aria-hidden>close</span>
          </button>
        </div>
        <div className="space-y-6 pb-6">
          {visibleSections.map((section) => (
            <div key={section.id}>
              <div className="px-2 py-1 text-xs font-semibold tracking-wider text-[var(--on-surface-variant)] uppercase">{section.label}</div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {section.items.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-xl px-3 py-3 border text-sm",
                        active ? "bg-[var(--primary-container)] text-[var(--on-primary-container)] border-[var(--primary-container)]" : "bg-[var(--surface-container)] border-[var(--outline-variant)] text-[var(--on-surface)]"
                      )}
                    >
                      <span className="material-symbols-outlined text-[20px]" aria-hidden>{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="pt-4 border-t border-[var(--outline-variant)]">
            <div className="grid grid-cols-2 gap-2">
              {PINNED_NAV.map((item) => {
                const active = isNavActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href as string}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-3 py-3 border text-sm",
                      active ? "bg-[var(--primary-container)] text-[var(--on-primary-container)] border-[var(--primary-container)]" : "bg-[var(--surface-container)] border-[var(--outline-variant)]"
                    )}
                  >
                    <span className="material-symbols-outlined text-[20px]" aria-hidden>{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
