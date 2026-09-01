import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Reusable BottomNav — fixed bottom-0 h-16 lg:hidden (balance_history:359, dashboard_home:315)
// Addy Osmani — shell bottom nav, 5 items per mobile prototypes (dashboard_home:315-336, webhook_logs:318-340)
const items = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/transactions", label: "Transact", icon: "receipt_long" },
  { href: "/balance", label: "Balance", icon: "account_balance" },
  { href: "/customers", label: "Customers", icon: "group" },
  { href: "/settings/developer", label: "Settings", icon: "settings" },
];

export function BottomNav({ activeHref }: { activeHref?: string }) {
  return (
    <nav className="fixed bottom-0 z-50 flex h-16 w-full items-center justify-around border-t bg-[var(--surface-container-highest)] shadow-[0_-4px_6px_rgba(0,0,0,0.05)] md:hidden" aria-label="Mobile navigation">
      {items.map((item) => {
        const active = activeHref === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 px-4 py-1 body-sm",
              active
                ? "rounded-full bg-[var(--primary-container)] px-4 py-1 text-[var(--on-primary-container)]"
                : "text-[var(--on-surface-variant)]"
            )}
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">{item.icon}</span>
            <span className="text-xs">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
