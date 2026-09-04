import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const AI_AGENT_ROUTES = [
  {
    href: "/ai-journal/ops-copilot",
    title: "Merchant Ops Copilot",
    label: "Ops",
    icon: "support_agent",
    description: "Daily payment operations briefing from ledger, payout, webhook, and risk signals.",
  },
  {
    href: "/ai-journal/recovery-agent",
    title: "Failed Payment Recovery",
    label: "Recovery",
    icon: "currency_exchange",
    description: "Segment failed payments and draft respectful retry/customer follow-up plans.",
  },
  {
    href: "/ai-journal/readiness-agent",
    title: "Launch Readiness Agent",
    label: "Readiness",
    icon: "rocket_launch",
    description: "Score payment launch readiness and prepare Ideathon evidence.",
  },
  {
    href: "/ai-journal/evaluation",
    title: "AI Evaluation Dashboard",
    label: "Evaluate",
    icon: "fact_check",
    description: "Review per-user conversations, feedback, saved reports, safety gates, and readiness evidence.",
  },
] as const;

export function AgentRouteCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {AI_AGENT_ROUTES.map((route) => (
        <Card key={route.href} className="border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">{route.icon}</span>
              </span>
              <Badge variant="outline">{route.label}</Badge>
            </div>
            <CardTitle className="headline-md">{route.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="body-sm text-[var(--on-surface-variant)]">{route.description}</p>
            <Link href={route.href}>
              <Button variant="outline" className="w-full border-[var(--border-subtle)]">
                Open page
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span>
              </Button>
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
