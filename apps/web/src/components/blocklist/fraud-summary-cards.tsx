import { Card, CardContent } from "@/components/ui/card";
import type { BlocklistSummary } from "@/server/data/blocklist";

// Derived fraud metrics (ADR-0024) — the prototype's invented 14,209 / 8,432
// / 3,194 (and "+12% this week") are gone; each card counts a real entry
// type from the one store both fraud pages run on.
export function FraudSummaryCards({ summary }: { summary: BlocklistSummary }) {
  const cards = [
    {
      key: "IP",
      icon: "router",
      title: "Blocked IP Addresses",
      count: summary.byType.IP,
    },
    {
      key: "CARD",
      icon: "credit_card",
      title: "Blocked Cards",
      count: summary.byType.CARD,
    },
    {
      key: "EMAIL",
      icon: "alternate_email",
      title: "Blocked Email Domains",
      count: summary.byType.EMAIL,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {cards.map((card) => (
        <Card
          key={card.key}
          className="border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] shadow-sm"
        >
          <CardContent className="p-5">
            <div className="label-caps mb-2 flex items-center gap-2 uppercase text-[var(--on-surface-variant)]">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                {card.icon}
              </span>
              {card.title}
            </div>
            <div className="headline-xl text-[var(--on-surface)]">{card.count}</div>
            <div className="body-sm mt-2 text-[var(--on-surface-variant)]">
              {summary.addedLast30d > 0
                ? `${summary.addedLast30d} added in the last 30 days`
                : "none added in the last 30 days"}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
