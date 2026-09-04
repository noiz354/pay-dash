import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ContextItem = {
  label: string;
  detail: string;
};

export function AiBoundaryBanner({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-[var(--pending-status)]/30 bg-[var(--pending-status)]/10 p-4", className)}>
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined mt-0.5 text-[20px] text-[var(--pending-status)]" aria-hidden="true">
          policy
        </span>
        <div>
          <p className="font-semibold text-[var(--on-surface)]">AI recommends, human decides</p>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
            This agent provides recommendations only. It cannot retry payments, issue refunds, create payouts,
            change risk rules, or modify dashboard settings. Verify every recommendation in PayDash before acting.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ContextTransparencyPanel({
  title = "What Gemini can see",
  items,
  hiddenItems = ["Gemini API keys", "Firebase ID tokens", "Service account JSON", "Other users' Firestore data"],
}: {
  title?: string;
  items: ContextItem[];
  hiddenItems?: string[];
}) {
  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="headline-md">{title}</CardTitle>
            <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
              The quick prompts pass a bounded PayDash snapshot to Gemini. Operational secrets never leave the server.
            </p>
          </div>
          <Badge variant="outline">Context transparency</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4">
          <p className="label-caps text-[var(--on-surface-variant)]">Included in prompt context</p>
          <ul className="mt-3 space-y-2">
            {items.map((item) => (
              <li key={item.label} className="flex items-start gap-2 body-sm">
                <span className="text-[var(--success-status)]">✓</span>
                <span>
                  <span className="font-semibold text-[var(--on-surface)]">{item.label}</span>
                  <span className="block text-[var(--on-surface-variant)]">{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-low)] p-4">
          <p className="label-caps text-[var(--on-surface-variant)]">Never sent to Gemini</p>
          <ul className="mt-3 space-y-2 body-sm text-[var(--on-surface-variant)]">
            {hiddenItems.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="text-[var(--failed-status)]">×</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export function JudgeEvidencePanel() {
  const evidence = [
    ["Firebase Authentication", "Google Sign-In via Firebase client SDK."],
    ["User-isolated Firestore", "Data path: users/{uid}/interactions/{interactionId}/messages/{messageId}."],
    ["Gemini multi-turn", "Recent bounded history is sent server-side with mode-specific instructions."],
    ["Secret Manager", "Gemini API key is retrieved by the Cloud Run server at runtime."],
    ["Cloud Run", "Next.js standalone container with challenge label instructions."],
    ["Original features", "Ops Copilot, Recovery Agent, Readiness Agent, Brainstorm Skill, and Submission Cockpit."],
  ] as const;

  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="headline-md">Judge evidence panel</CardTitle>
            <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
              A fast checklist for Ideathon reviewers to verify required services and originality.
            </p>
          </div>
          <Badge className="w-fit bg-[var(--success-status)] text-white">Submission proof</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {evidence.map(([label, detail]) => (
          <div key={label} className="rounded-xl border border-[var(--border-subtle)] bg-white p-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-[var(--success-status)]" aria-hidden="true">
                verified
              </span>
              <p className="font-semibold text-[var(--on-surface)]">{label}</p>
            </div>
            <p className="body-sm mt-2 text-[var(--on-surface-variant)]">{detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AgentDeepLinks({ links }: { links: Array<{ href: string; label: string; icon: string }> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link key={link.href} href={link.href}>
          <Button variant="outline" size="sm" className="border-[var(--border-subtle)] bg-white">
            <span className="material-symbols-outlined text-[17px]" aria-hidden="true">{link.icon}</span>
            {link.label}
          </Button>
        </Link>
      ))}
    </div>
  );
}

export function AgentEmptyState({ title, description, actions }: { title: string; description: string; actions: string[] }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-white p-5">
      <p className="font-semibold text-[var(--on-surface)]">{title}</p>
      <p className="body-sm mt-1 text-[var(--on-surface-variant)]">{description}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 body-sm text-[var(--on-surface-variant)]">
        {actions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>
    </div>
  );
}
