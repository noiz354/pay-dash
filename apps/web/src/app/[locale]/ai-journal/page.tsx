import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentRouteCards } from "@/components/ai-journal/agent-route-cards";
import { GeminiJournalAgent } from "@/components/ai-journal/gemini-journal-agent";
import { SubmissionToolkit } from "@/components/ai-journal/submission-toolkit";

export const dynamic = "force-dynamic";

export default function AiJournalPage() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6 pb-12">
      <section className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[radial-gradient(circle_at_top_left,rgba(19,83,216,0.16),transparent_34%),linear-gradient(135deg,var(--surface),#ffffff)] p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-[var(--primary)] text-white">#AccelerateAIwithCloudRun</Badge>
              <Badge variant="outline" className="border-[var(--primary)]/30 text-[var(--primary)]">
                Firebase Auth + Firestore + Gemini + Secret Manager
              </Badge>
            </div>
            <div>
              <p className="label-caps text-[var(--on-surface-variant)]">Ideathon prototype</p>
              <h1 className="headline-xl text-[var(--on-surface)]">PayDash Gemini Journal</h1>
            </div>
            <p className="body-lg text-[var(--on-surface-variant)]">
              A secure merchant-ops AI agent: sign in with Firebase, brainstorm with Gemini, and save every
              private journal thread into user-isolated Firestore paths from a Cloud Run-ready Next.js app.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:min-w-[460px]">
            {[
              ["Firebase", "Google Sign-In"],
              ["Firestore", "users/{uid}"],
              ["Gemini", "Multi-turn"],
              ["Secrets", "Cloud SM"],
            ].map(([label, value]) => (
              <Card key={label} className="border-[var(--border-subtle)] bg-white/75 p-3 shadow-sm">
                <p className="label-caps text-[var(--on-surface-variant)]">{label}</p>
                <p className="body-sm font-semibold text-[var(--on-surface)]">{value}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <AgentRouteCards />

      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm">
        <CardHeader>
          <CardTitle className="headline-md">Private AI workspace</CardTitle>
          <p className="body-sm text-[var(--on-surface-variant)]">
            Original enhancement: Brainstorm mode ports Addy-style idea refinement into the agent, while Submission
            Coach verifies every Ideathon deliverable before you post.
          </p>
        </CardHeader>
        <CardContent>
          <GeminiJournalAgent />
        </CardContent>
      </Card>

      <SubmissionToolkit />
    </main>
  );
}
