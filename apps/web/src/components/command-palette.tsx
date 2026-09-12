"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/lib/roles";
import type { OrgPermission } from "@/lib/roles";

/**
 * Command Palette — SCR-039, CMP-018
 * 
 * Role-aware navigation/entity search
 * Fuzzy matching on title + description
 * Recent 5 items
 * NO destructive financial actions
 * Permission-aware filtering
 */

export interface CommandItem {
  id: string;
  title: string;
  description?: string;
  href: string;
  icon?: string;
  category: string;
  requiredPermission?: OrgPermission;
  // For entity search
  entityType?: "customer" | "transaction" | "payout" | "invoice" | "user";
  entityId?: string;
}

/**
 * Navigation items for the palette
 */
const NAVIGATION_ITEMS: CommandItem[] = [
  // Dashboard
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Overview of your account and recent activity",
    href: "/dashboard",
    icon: "dashboard",
    category: "Navigation",
  },
  
  // Money In
  {
    id: "transactions",
    title: "Transactions",
    description: "View all payment transactions",
    href: "/transactions",
    icon: "receipt_long",
    category: "Money In",
    requiredPermission: "transaction.read",
  },
  {
    id: "balance",
    title: "Balance",
    description: "Manage your wallet balance",
    href: "/balance",
    icon: "account_balance_wallet",
    category: "Money In",
    requiredPermission: "balance.write",
  },
  {
    id: "payment-links",
    title: "Payment Links",
    description: "Create and manage payment links",
    href: "/payment-links",
    icon: "link",
    category: "Money In",
    requiredPermission: "money_in.create",
  },
  {
    id: "customers",
    title: "Customers",
    description: "Manage customer records",
    href: "/customers",
    icon: "group",
    category: "Money In",
    requiredPermission: "customer.read",
  },
  {
    id: "invoices",
    title: "Invoices",
    description: "View and manage invoices",
    href: "/invoices",
    icon: "description",
    category: "Money In",
    requiredPermission: "transaction.read",
  },
  {
    id: "subscriptions",
    title: "Subscriptions",
    description: "View subscription MRR",
    href: "/subscriptions",
    icon: "loyalty",
    category: "Money In",
    requiredPermission: "customer.read",
  },
  
  // Money Out
  {
    id: "payouts",
    title: "Payouts",
    description: "Create and manage payouts",
    href: "/payouts",
    icon: "payments",
    category: "Money Out",
    requiredPermission: "payout.create",
  },
  
  // Governance
  {
    id: "team",
    title: "Team",
    description: "Manage team members and invites",
    href: "/team",
    icon: "supervised_user_circle",
    category: "Governance",
    requiredPermission: "team.manage",
  },
  {
    id: "audit",
    title: "Audit Log",
    description: "View audit trail",
    href: "/audit",
    icon: "history",
    category: "Governance",
    requiredPermission: "audit.read",
  },
  {
    id: "system",
    title: "System Status",
    description: "View system health",
    href: "/system",
    icon: "monitoring",
    category: "Governance",
    requiredPermission: "system.read",
  },
  {
    id: "support",
    title: "Support",
    description: "Get help and support",
    href: "/support",
    icon: "help",
    category: "Governance",
  },
  
  // Operations
  {
    id: "fraud",
    title: "Fraud Hub",
    description: "Manage fraud controls",
    href: "/fraud",
    icon: "security",
    category: "Operations",
    requiredPermission: "blocklist.manage",
  },
  {
    id: "fraud-blocklist",
    title: "Blocklist",
    description: "Manage blocklist",
    href: "/fraud/blocklist",
    icon: "block",
    category: "Operations",
    requiredPermission: "blocklist.manage",
  },
  {
    id: "fraud-risk",
    title: "Risk Manager",
    description: "Configure risk limits",
    href: "/fraud/risk",
    icon: "tune",
    category: "Operations",
    requiredPermission: "deployRisk",
  },
  {
    id: "kyc",
    title: "KYC",
    description: "Manage KYC submissions",
    href: "/kyc",
    icon: "verified_user",
    category: "Operations",
    requiredPermission: "kyc.prepare",
  },
  
  // Developer
  {
    id: "developer",
    title: "Developer",
    description: "Developer tools and settings",
    href: "/developer",
    icon: "code",
    category: "Developer",
    requiredPermission: "provider.connect.test",
  },
  {
    id: "webhooks",
    title: "Webhooks",
    description: "Manage webhook endpoints",
    href: "/webhooks",
    icon: "webhook",
    category: "Developer",
    requiredPermission: "provider.connect.test",
  },
  {
    id: "api-keys",
    title: "API Keys",
    description: "Manage API keys",
    href: "/developer/api-keys",
    icon: "key",
    category: "Developer",
    requiredPermission: "provider.rotate",
  },
  
  // Settings
  {
    id: "settings",
    title: "Settings",
    description: "Application settings",
    href: "/settings",
    icon: "settings",
    category: "Settings",
  },
];

// Blocked actions (NO destructive financial actions in palette)
const BLOCKED_ACTIONS = [
  "delete",
  "remove",
  "cancel",
  "approve",
  "reject",
  "execute",
  "release",
  "retry",
];

/**
 * Fuzzy search implementation
 */
function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  
  // Exact match
  if (t.includes(q)) {
    return true;
  }
  
  // Fuzzy match: check if all query chars appear in order
  let queryIndex = 0;
  for (let i = 0; i < t.length && queryIndex < q.length; i++) {
    if (t[i] === q[queryIndex]) {
      queryIndex++;
    }
  }
  
  return queryIndex === q.length;
}

/**
 * Rank items by match quality
 */
function rankItem(item: CommandItem, query: string): number {
  const q = query.toLowerCase();
  const title = item.title.toLowerCase();
  const description = item.description?.toLowerCase() ?? "";
  
  // Exact match on title
  if (title === q) {
    return 100;
  }
  
  // Starts with query
  if (title.startsWith(q)) {
    return 90;
  }
  
  // Exact match on description
  if (description === q) {
    return 80;
  }
  
  // Contains query in title
  if (title.includes(q)) {
    return 70;
  }
  
  // Contains query in description
  if (description.includes(q)) {
    return 60;
  }
  
  // Fuzzy match
  if (fuzzyMatch(q, title) || fuzzyMatch(q, description)) {
    return 50;
  }
  
  return 0;
}

export interface CommandPaletteProps {
  /** User's permissions */
  permissions: OrgPermission[];
  /** Recently accessed items (for quick access) */
  recentItems?: CommandItem[];
  /** Custom entity index for search */
  entityIndex?: CommandItem[];
}

export function CommandPalette({
  permissions,
  recentItems = [],
  entityIndex = [],
}: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  
  // Combined items: navigation + entity index
  const allItems = [...NAVIGATION_ITEMS, ...entityIndex];
  
  // Filter by permission
  const permittedItems = allItems.filter((item) => {
    if (!item.requiredPermission) {
      return true;
    }
    return hasPermission(permissions, item.requiredPermission);
  });
  
  // Filter by query
  const filteredItems = React.useMemo(() => {
    if (!query) {
      return permittedItems;
    }
    
    return permittedItems
      .map((item) => ({
        item,
        rank: rankItem(item, query),
      }))
      .filter(({ rank }) => rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .map(({ item }) => item);
  }, [query, permittedItems]);
  
  // Recent items (filtered by permission)
  const permittedRecent = recentItems.filter((item) => {
    if (!item.requiredPermission) {
      return true;
    }
    return hasPermission(permissions, item.requiredPermission);
  });
  
  // Group items by category
  const groupedItems = React.useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filteredItems.forEach((item) => {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push(item);
    });
    return groups;
  }, [filteredItems]);
  
  // Handle keyboard navigation
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    const items = Object.values(groupedItems).flat();
    
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (items[selectedIndex]) {
          router.push(items[selectedIndex].href);
          setOpen(false);
          setQuery("");
          setSelectedIndex(0);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        setQuery("");
        setSelectedIndex(0);
        break;
      case "Tab":
        e.preventDefault();
        setOpen(false);
        break;
    }
  }, [groupedItems, selectedIndex, router]);
  
  // Open palette
  const openPalette = React.useCallback(() => {
    setOpen(true);
    setQuery("");
    setSelectedIndex(0);
  }, []);
  
  // Close palette
  const closePalette = React.useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }, []);
  
  // Register keyboard shortcut
  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Check for Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openPalette();
      }
    };
    
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [openPalette]);
  
  // Focus input when opened
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);
  
  // Total items for navigation
  const totalItems = Object.values(groupedItems).flat().length;
  const items = Object.values(groupedItems).flat();

  return (
    <>
      {/* Trigger button (for mobile/accessibility) */}
      <Button
        variant="ghost"
        size="icon"
        onClick={openPalette}
        className="h-9 w-9 md:hidden"
        aria-label="Open command palette"
      >
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
          search
        </span>
      </Button>
      
      {/* Dialog */}
      <Dialog open={open} onOpenChange={(newOpen) => !newOpen && closePalette()}>
        <DialogContent 
          className="max-w-2xl max-h-[80vh] overflow-y-auto p-0"
          onInteractOutside={closePalette}
          aria-label="Command palette"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex flex-col h-full">
            {/* Input */}
            <div className="flex items-center gap-2 p-4 border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--surface)]">
              <span className="material-symbols-outlined text-[var(--on-surface-variant)]" aria-hidden="true">
                search
              </span>
              <Input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Search for anything..."
                className="flex-1 border-0 bg-transparent text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]"
                autoComplete="off"
                onKeyDown={handleKeyDown}
                aria-label="Search commands"
              />
              <kbd className="body-xs px-2 py-1 bg-[var(--surface-container-low)] rounded text-[var(--on-surface-variant)]">
                ⌘K
              </kbd>
            </div>
            
            {/* Content */}
            <div className="p-2">
              {/* Recent section (when no query) */}
              {query === "" && permittedRecent.length > 0 && (
                <div className="mb-4">
                  <h3 className="body-xs font-medium text-[var(--on-surface-variant)] uppercase tracking-wider px-2 py-1">
                    Recent
                  </h3>
                  <div className="space-y-1">
                    {permittedRecent.slice(0, 5).map((item, index) => (
                      <CommandItemRow
                        key={item.id}
                        item={item}
                        isSelected={selectedIndex === index}
                        onClick={() => {
                          router.push(item.href);
                          closePalette();
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Results */}
              {totalItems > 0 ? (
                Object.entries(groupedItems).map(([category, categoryItems]) => (
                  <div key={category} className="mb-4">
                    <h3 className="body-xs font-medium text-[var(--on-surface-variant)] uppercase tracking-wider px-2 py-1">
                      {category}
                    </h3>
                    <div className="space-y-1">
                      {categoryItems.map((item, index) => {
                        const globalIndex = items.findIndex((i) => i.id === item.id);
                        return (
                          <CommandItemRow
                            key={item.id}
                            item={item}
                            isSelected={selectedIndex === globalIndex}
                            onClick={() => {
                              router.push(item.href);
                              closePalette();
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <span className="material-symbols-outlined text-[48px] text-[var(--on-surface-variant)]" aria-hidden="true">
                    search_off
                  </span>
                  <p className="body-sm text-[var(--on-surface-variant)] mt-2">
                    No results found
                  </p>
                  <p className="body-xs text-[var(--on-surface-variant)] mt-1">
                    Try a different search term
                  </p>
                </div>
              )}
            </div>
            
            {/* Footer with shortcuts */}
            <div className="p-2 border-t border-[var(--border-subtle)] bg-[var(--surface)]">
              <div className="flex flex-wrap gap-2 justify-end text-[10px] text-[var(--on-surface-variant)]">
                <kbd className="px-1.5 py-0.5 bg-[var(--surface-container-low)] rounded">↑↓</kbd>
                <span>Navigate</span>
                <kbd className="px-1.5 py-0.5 bg-[var(--surface-container-low)] rounded">⏎</kbd>
                <span>Select</span>
                <kbd className="px-1.5 py-0.5 bg-[var(--surface-container-low)] rounded">Esc</kbd>
                <span>Close</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Command item row component
 */
function CommandItemRow({
  item,
  isSelected,
  onClick,
}: {
  item: CommandItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const config = ACTION_CONFIG[item.icon as keyof typeof ACTION_CONFIG] ?? ACTION_CONFIG.UNKNOWN;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-2 rounded cursor-pointer text-left",
        "hover:bg-[var(--surface-container-low)]",
        isSelected && "bg-[var(--primary)]/10"
      )}
      aria-selected={isSelected}
      aria-label={`${item.title}${item.description ? `, ${item.description}` : ""}`}
    >
      <span className="material-symbols-outlined text-[var(--on-surface-variant)]" aria-hidden="true">
        {item.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="body-sm font-medium text-[var(--on-surface)] truncate">
          {item.title}
        </div>
        {item.description && (
          <div className="body-xs text-[var(--on-surface-variant)] truncate">
            {item.description}
          </div>
        )}
      </div>
      {item.entityType && (
        <span className="body-xs px-2 py-0.5 bg-[var(--surface-container-low)] rounded text-[var(--on-surface-variant)]">
          {item.entityType}
        </span>
      )}
    </button>
  );
}

// Action config for icons (reuse from timeline)
const ACTION_CONFIG: Record<string, { label: string; icon: string }> = {
  dashboard: { label: "Dashboard", icon: "dashboard" },
  transactions: { label: "Transactions", icon: "receipt_long" },
  balance: { label: "Balance", icon: "account_balance_wallet" },
  payment-links: { label: "Payment Links", icon: "link" },
  customers: { label: "Customers", icon: "group" },
  invoices: { label: "Invoices", icon: "description" },
  subscriptions: { label: "Subscriptions", icon: "loyalty" },
  payouts: { label: "Payouts", icon: "payments" },
  team: { label: "Team", icon: "supervised_user_circle" },
  audit: { label: "Audit", icon: "history" },
  system: { label: "System", icon: "monitoring" },
  support: { label: "Support", icon: "help" },
  fraud: { label: "Fraud", icon: "security" },
  blocklist: { label: "Blocklist", icon: "block" },
  risk: { label: "Risk", icon: "tune" },
  kyc: { label: "KYC", icon: "verified_user" },
  developer: { label: "Developer", icon: "code" },
  webhooks: { label: "Webhooks", icon: "webhook" },
  api-keys: { label: "API Keys", icon: "key" },
  settings: { label: "Settings", icon: "settings" },
  UNKNOWN: { label: "Unknown", icon: "help" },
};

/**
 * Hook to index routes for entity search
 */
export function useCommandPaletteIndex(
  customers: Array<{ id: string; name: string; email: string }> = [],
  transactions: Array<{ id: string; ref: string; amount: number }> = [],
  payouts: Array<{ id: string; batchName: string; status: string }> = []
): CommandItem[] {
  const entityItems: CommandItem[] = [];
  
  // Index customers
  customers.forEach((c) => {
    entityItems.push({
      id: `customer:${c.id}`,
      title: c.name,
      description: c.email,
      href: `/customers/${c.id}`,
      icon: "group",
      category: "Customers",
      entityType: "customer",
      entityId: c.id,
    });
  });
  
  // Index transactions
  transactions.forEach((t) => {
    entityItems.push({
      id: `transaction:${t.id}`,
      title: `Transaction ${t.ref}`,
      description: `Amount: ${t.amount}`,
      href: `/transactions/${t.id}`,
      icon: "receipt_long",
      category: "Transactions",
      entityType: "transaction",
      entityId: t.id,
    });
  });
  
  // Index payouts
  payouts.forEach((p) => {
    entityItems.push({
      id: `payout:${p.id}`,
      title: p.batchName,
      description: `Status: ${p.status}`,
      href: `/payouts/${p.id}`,
      icon: "payments",
      category: "Payouts",
      entityType: "payout",
      entityId: p.id,
    });
  });
  
  return entityItems;
}
