import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Reusable Sidebar — w-sidebar-width fixed left-0, bg-inverse-surface (transaction_ledger_desktop:122, DESIGN.md:14)
// Addy Osmani App Shell — shell cached, content streamed (PRPL)
const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/transactions", label: "Transactions", icon: "receipt_long" },
  { href: "/balance", label: "Balance", icon: "account_balance" },
  { href: "/customers", label: "Customers", icon: "group" },
  { href: "/billing", label: "Billing", icon: "request_quote" },
  { href: "/payouts/bulk", label: "Bulk Payouts", icon: "payments" },
  { href: "/payouts/settings", label: "Payout Settings", icon: "account_balance_wallet" },
  { href: "/subscriptions", label: "Subscriptions", icon: "autorenew" },
  { href: "/team", label: "Team", icon: "group" },
  { href: "/fraud", label: "Fraud", icon: "shield" },
  { href: "/kyc", label: "KYC", icon: "verified_user" },
  { href: "/audit", label: "Audit Log", icon: "history" },
  { href: "/reports/builder", label: "Reports", icon: "analytics" },
  { href: "/payments/links", label: "Payment Links", icon: "link" },
  { href: "/webhooks", label: "Webhooks", icon: "webhook" },
  { href: "/system", label: "System", icon: "monitor_heart" },
  { href: "/onboarding", label: "Onboarding", icon: "checklist" },
  { href: "/support", label: "Support", icon: "help" },
  { href: "/risk", label: "Risk", icon: "warning" },
  { href: "/settings/merchant", label: "Merchant", icon: "store" },
  { href: "/settings/notifications", label: "Notifications", icon: "notifications" },
  { href: "/settings/api-keys", label: "API Keys", icon: "key" },
  { href: "/settings/developer", label: "Developer", icon: "code" },
];

export function Sidebar({ activeHref }: { activeHref?: string }) {
  return (
    <aside className="hidden h-screen w-sidebar-width shrink-0 flex-col border-r border-[var(--outline-variant)] bg-[var(--inverse-surface)] py-4 md:flex fixed left-0 top-0 z-20">
      <div className="px-4 pb-4">
        <span className="headline-md text-[var(--inverse-on-surface)]">Kinetic Ledger</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map((item) => {
          const active = activeHref === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 body-sm",
                active
                  ? "border-l-4 border-[var(--primary-fixed-dim)] bg-[var(--on-secondary-fixed-variant)]/20 font-semibold text-white"
                  : "text-[var(--inverse-on-surface)] hover:bg-white/10"
              )}
            >
              <span className="material-symbols-outlined text-[20px] shrink-0" aria-hidden="true">{item.icon}</span>
              <span className="truncate min-w-0">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
