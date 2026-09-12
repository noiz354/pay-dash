"use client";
import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StaleBannerWithPolling } from "@/components/data-table/stale-banner";
import { usePolling } from "@/hooks/use-polling";
import type { NeedsAttentionData } from "@/server/data/dashboard";

/**
 * Needs Attention — Dashboard Exception Cards (FE-002)
 * 
 * 6 exception cards from real actionable data, permission-aware
 * Poll 20s for freshness, stale banner >60s
 * Positive empty state when no exceptions
 */

export interface NeedsAttentionProps {
  /** Initial data from server */
  initialData: NeedsAttentionData;
  /** Current user's permissions */
  permissions: string[];
  /** Last updated timestamp */
  lastUpdated: Date;
}

/**
 * Card configuration
 */
const CARDS = [
  {
    id: "pending-payouts",
    title: "Pending Payouts",
    description: "Need your approval to process",
    icon: "pending_actions",
    requiredPermissions: ["payout.release", "payout.approve"],
    href: "/payouts?status=PENDING",
    badgeVariant: "pending",
  },
  {
    id: "payouts-retry",
    title: "Payouts Needing Retry",
    description: "Failed recipients that can be retried",
    icon: "replay",
    requiredPermissions: ["payout.retry", "payout.release"],
    href: "/payouts?status=PARTIAL",
    badgeVariant: "failed",
  },
  {
    id: "refunds-awaiting",
    title: "Refunds Awaiting Approval",
    description: "Dual-control refunds pending your review",
    icon: "account_balance_wallet",
    requiredPermissions: ["refund.execute", "refund.approve"],
    href: "/transactions?refundState=AWAITING_APPROVAL",
    badgeVariant: "pending",
  },
  {
    id: "blocked-payments",
    title: "Blocked Payments",
    description: "Payments blocked today",
    icon: "block",
    requiredPermissions: ["blocklist.read", "fraud.read"],
    href: "/fraud/blocklist",
    badgeVariant: "failed",
  },
  {
    id: "kyc-pending",
    title: "KYC Pending",
    description: "Customer verifications awaiting review",
    icon: "verified_user",
    requiredPermissions: ["kyc.prepare", "kyc.submit", "compliance"],
    href: "/kyc",
    badgeVariant: "pending",
  },
  {
    id: "webhook-failures",
    title: "Webhook Failures",
    description: "Delivery failures in the last 7 days",
    icon: "error",
    requiredPermissions: ["provider.connect.test", "developer"],
    href: "/webhooks",
    badgeVariant: "failed",
  },
] as const;

/**
 * Badge variants for different card types
 */
const BADGE_VARIANTS = {
  pending: "bg-[var(--pending-status)]/10 text-[var(--pending-status)] border-[var(--pending-status)]",
  failed: "bg-[var(--failed-status)]/10 text-[var(--failed-status)] border-[var(--failed-status)]",
  success: "bg-[var(--success-status)]/10 text-[var(--success-status)] border-[var(--success-status)]",
} as const;

/**
 * Card component
 */
function NeedsAttentionCard({
  card,
  count,
  hasPermission,
}: {
  card: typeof CARDS[number];
  count: number;
  hasPermission: boolean;
}) {
  if (!hasPermission) {
    return null;
  }

  // Don't render if no items (unless we want to show zero - spec says hide zeros)
  if (count === 0) {
    return null;
  }

  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4 hover:shadow-md transition-shadow">
      <Link href={card.href} className="block">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-[24px] text-[var(--primary)]" aria-hidden="true">
            {card.icon}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="body-md font-medium text-[var(--on-surface)]">{card.title}</h3>
              <Badge 
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold label-caps border ${BADGE_VARIANTS[card.badgeVariant]}`}
              >
                {count}
              </Badge>
            </div>
            <p className="body-sm text-[var(--on-surface-variant)]">{card.description}</p>
          </div>
          <span className="material-symbols-outlined text-[20px] text-[var(--on-surface-variant)]" aria-hidden="true">
            chevron_right
          </span>
        </div>
      </Link>
    </Card>
  );
}

/**
 * Celebrate empty state — Positive reinforcement when no exceptions
 */
export function CelebrateEmptyState() {
  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="material-symbols-outlined text-[48px] text-[var(--success-status)]" aria-hidden="true">
          check_circle
        </span>
        <h3 className="headline-md text-[var(--on-surface)]">All Clear!</h3>
        <p className="body-sm text-[var(--on-surface-variant)]">
          No items require your immediate attention. Great job keeping things on track!
        </p>
      </div>
    </Card>
  );
}

/**
 * Main Needs Attention component
 */
export function NeedsAttention({ initialData, permissions, lastUpdated }: NeedsAttentionProps) {
  const [data, setData] = React.useState(initialData);
  
  // Polling for fresh data
  const { lastUpdated: polledLastUpdated, refresh, isStale } = usePolling({
    interval: 20000, // 20s
    staleThreshold: 60, // 60s
    enabled: true,
    onRefresh: async () => {
      // In a real implementation, this would fetch fresh data
      // For now, we'll just update the timestamp
      // TODO: Replace with actual data fetching
      const response = await fetch("/api/dashboard/needs-attention");
      if (response.ok) {
        const freshData = await response.json();
        setData(freshData);
      }
    },
  });

  // Combine server timestamp with polling timestamp
  const effectiveLastUpdated = polledLastUpdated ?? lastUpdated;
  
  // Check if user has permission for each card
  const hasPermission = (card: typeof CARDS[number]): boolean => {
    return card.requiredPermissions.some((perm) => permissions.includes(perm));
  };

  // Count visible cards with data
  const visibleCards = CARDS.filter((card) => {
    const perm = hasPermission(card);
    const count = data[card.id as keyof NeedsAttentionData] as number;
    return perm && count > 0;
  });

  // Show celebrate state if no visible cards
  const showCelebrate = visibleCards.length === 0;

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="headline-sm text-[var(--on-surface)]">Needs Attention</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refresh()}
          className="h-8 gap-2 text-[var(--on-surface-variant)] hover:text-[var(--primary)]"
          aria-label="Refresh needs attention"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            refresh
          </span>
        </Button>
      </div>

      {/* Stale Banner */}
      {effectiveLastUpdated && isStale && (
        <StaleBannerWithPolling
          lastUpdated={effectiveLastUpdated}
          onRefresh={refresh}
          staleThreshold={60}
        />
      )}

      {/* Cards or Celebrate */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {showCelebrate ? (
          <div className="md:col-span-2 lg:col-span-3">
            <CelebrateEmptyState />
          </div>
        ) : (
          CARDS.map((card) => {
            const count = data[card.id as keyof NeedsAttentionData] as number;
            return (
              <NeedsAttentionCard
                key={card.id}
                card={card}
                count={count}
                hasPermission={hasPermission(card)}
              />
            );
          })
        )}
      </div>
    </section>
  );
}
