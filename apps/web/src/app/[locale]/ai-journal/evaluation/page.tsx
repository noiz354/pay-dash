import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EvaluationDashboard } from "@/components/ai-journal/evaluation-dashboard";
import { AiBoundaryBanner, JudgeEvidencePanel } from "@/components/ai-journal/ai-agent-ux";

export const dynamic = "force-dynamic";

export default function AiJournalEvaluationPage() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6 pb-12">
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[radial-gradient(circle_at_top_left,rgba(19,83,216,0.16),transparent_34%),linear-gradient(135deg,var(--surface),#fff)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Link href="/ai-journal" className="body-sm text-[var(--primary)] underline-offset-4 hover:underline">
              ← Back to AI Journal
            </Link>
            <p className="label-caps mt-4 text-[var(--on-surface-variant)]">Evaluation dashboard</p>
            <h1 className="headline-xl text-[var(--on-surface)]">AI Agent Evaluation</h1>
            <p className="body-lg mt-2 text-[var(--on-surface-variant)]">
              Track private per-user evidence for multi-turn usage, feedback, saved reports, and readiness before the
              final Ideathon walkthrough.
            </p>
          </div>
          <Badge className="w-fit bg-[var(--primary)] text-white">Human-in-loop metrics</Badge>
        </div>
      </section>

      <AiBoundaryBanner />
      <JudgeEvidencePanel />

      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm">
        <CardHeader>
          <CardTitle className="headline-md">Private evaluation summary</CardTitle>
          <p className="body-sm text-[var(--on-surface-variant)]">
            This page reads only the signed-in Firebase user&apos;s Firestore journal path.
          </p>
        </CardHeader>
        <CardContent>
          <EvaluationDashboard />
        </CardContent>
      </Card>
    </main>
  );
}
