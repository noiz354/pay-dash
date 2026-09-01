import * as React from "react";
import { Link } from "@/i18n/navigation";
import { formatMoney, formatDateLong, formatNumber } from "@/lib/format";
import type { PayoutsOverview } from "@/server/data/payouts";

/**
 * Payout exposure at a glance.
 * The prototype printed `,250,890.00` and `8,405,200.50` — literals with the
 * leading digit and currency lost, and no way to reach whatever they described.
 * Every figure here is derived from recipients and every card is a link into
 * the filtered list that produced it.
 */
export function PayoutsSummaryCards({ overview }: { overview: PayoutsOverview }) {
  const cards = [
    {
      key: "pending",
      href: "/payouts?status=SCHEDULED",
      icon: "pending_actions",
      tone: "text-[var(--pending-status)]",
      label: "Pending disbursements",
      value: formatMoney(overview.pendingAmount, overview.currency),
      detail: `${formatNumber(overview.pendingRecipients)} recipient${
        overview.pendingRecipients === 1 ? "" : "s"
      } across ${overview.pendingBatches} batch${overview.pendingBatches === 1 ? "" : "es"}`,
    },
    {
      key: "completed",
      href: "/payouts?status=PAID&range=30d",
      icon: "task_alt",
      tone: "text-[var(--success-status)]",
      label: "Completed (30d)",
      value: formatMoney(overview.completedAmount30d, overview.currency),
      detail: `${formatNumber(overview.completedRecipients30d)} recipients paid`,
    },
    {
      key: "failed",
      href: "/payouts?status=FAILED",
      icon: "error",
      tone: "text-[var(--failed-status)]",
      label: "Needs attention",
      value: formatMoney(overview.failedAmount, overview.currency),
      detail: `${formatNumber(overview.failedRecipients)} failed or returned transfer${
        overview.failedRecipients === 1 ? "" : "s"
      }`,
    },
    {
      key: "next",
      href: "/payouts/settings",
      icon: "event_upcoming",
      tone: "text-[var(--primary)]",
      label: "Next scheduled run",
      value: overview.nextScheduledAt ? formatDateLong(overview.nextScheduledAt) : "Nothing scheduled",
      detail: overview.nextScheduledAt ? "Review or change the schedule" : "Set a cadence in payout settings",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Link
          key={card.key}
          href={card.href}
          className="group flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-5 transition-colors hover:border-[var(--primary)]"
        >
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-container)]">
              <span className={`material-symbols-outlined text-[18px] ${card.tone}`} aria-hidden="true">
                {card.icon}
              </span>
            </span>
            <span className="label-caps text-[var(--on-surface-variant)]">{card.label}</span>
          </div>
          <div>
            <div className="headline-lg data-mono font-bold tracking-tight text-[var(--on-surface)]">
              {card.value}
            </div>
            <div className="body-sm mt-1 text-[var(--on-surface-variant)]">{card.detail}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
