"use client";

import * as React from "react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// A table row that behaves like a link: whole-row click, keyboard activation,
// and cmd/ctrl-click support — without nesting <a> inside <td> for every cell.
export function ClickableRow({
  href,
  className,
  children,
  label,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { href: string; label: string }) {
  const router = useRouter();

  return (
    <tr
      {...props}
      role="link"
      tabIndex={0}
      aria-label={label}
      onClick={(e) => {
        // Let interactive children (checkbox, menu button) handle their own clicks.
        if ((e.target as HTMLElement).closest("[data-row-interactive]")) return;
        if (e.metaKey || e.ctrlKey) {
          window.open(href, "_blank", "noopener");
          return;
        }
        router.push(href);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          if ((e.target as HTMLElement).closest("[data-row-interactive]")) return;
          e.preventDefault();
          router.push(href);
        }
      }}
      onMouseEnter={() => router.prefetch(href)}
      className={cn(
        "group cursor-pointer transition-colors hover:bg-[var(--surface-container-low)]/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)]",
        className
      )}
    >
      {children}
    </tr>
  );
}
