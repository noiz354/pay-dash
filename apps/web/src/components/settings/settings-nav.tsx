"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Local navigation for the settings cluster. The sidebar links straight to the
// children, so before this existed there was no way to tell which settings
// screen you were on, and no way to hop between them without the sidebar.
export const SETTINGS_LINKS = [
  { href: "/settings", label: "Overview", icon: "tune", exact: true },
  { href: "/settings/merchant", label: "Merchant Profile", icon: "store" },
  { href: "/settings/notifications", label: "Notifications", icon: "notifications" },
  { href: "/settings/api-keys", label: "API Keys", icon: "key" },
  { href: "/settings/developer", label: "Developer", icon: "code" },
] as const;

export function SettingsNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className={cn("w-full overflow-x-auto", className)}>
      <ul className="flex min-w-max items-center gap-1 border-b border-[var(--border-subtle)]">
        {SETTINGS_LINKS.map((link) => {
          const active =
            "exact" in link && link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "label-md flex items-center gap-2 rounded-t-lg px-3 py-2.5 transition-colors",
                  active
                    ? "border-b-2 border-[var(--primary)] font-semibold text-[var(--primary)]"
                    : "border-b-2 border-transparent text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] hover:text-[var(--on-surface)]"
                )}
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  {link.icon}
                </span>
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
