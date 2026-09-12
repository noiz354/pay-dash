// Wave1: Breadcrumb — derived from route-resolver, stable across navigations
import Link from "next/link";
import { getBreadcrumbs } from "./route-resolver";

export function Breadcrumb({ pathname }: { pathname: string }) {
  const crumbs = getBreadcrumbs(pathname);
  if (crumbs.length <= 1) return null;
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-[var(--on-surface-variant)]">
      {crumbs.map((c, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <span key={`${c.label}-${idx}`} className="flex items-center gap-1">
            {idx > 0 && <span className="material-symbols-outlined text-[16px] opacity-50" aria-hidden>chevron_right</span>}
            {c.href && !isLast ? (
              <Link href={c.href} className="hover:text-[var(--on-surface)] hover:underline underline-offset-2">
                {c.label}
              </Link>
            ) : (
              <span aria-current={isLast ? "page" : undefined} className={isLast ? "text-[var(--on-surface)] font-medium" : ""}>
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

// For server usage: accepts pathname, returns json for tests
export { getBreadcrumbs };
