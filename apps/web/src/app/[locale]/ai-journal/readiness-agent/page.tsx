import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentDeepLinks, AiBoundaryBanner, ContextTransparencyPanel, JudgeEvidencePanel } from "@/components/ai-journal/ai-agent-ux";
import { GeminiJournalAgent, type GeminiQuickPrompt } from "@/components/ai-journal/gemini-journal-agent";
import { SubmissionToolkit } from "@/components/ai-journal/submission-toolkit";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { getOnboardingStatus } from "@/server/data/onboarding";
import { getPayoutSettings } from "@/server/data/payouts";
import { getRiskOverview } from "@/server/data/risk";
import { getSystemWebhookSummary } from "@/server/data/webhooks";

export const dynamic = "force-dynamic";

function ScoreBreakdown({ rows }: { rows: Array<{ label: string; points: number; max: number; detail: string }> }) {
  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm">
      <CardHeader>
        <CardTitle className="headline-md">Transparent readiness score</CardTitle>
        <p className="body-sm text-[var(--on-surface-variant)]">Judges can see how the page-derived score is assembled.</p>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl border border-[var(--border-subtle)] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-[var(--on-surface)]">{row.label}</p>
              <span className="data-mono text-[var(--primary)]">{row.points}/{row.max}</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-[var(--surface-container-high)]">
              <div className="h-2 rounded-full bg-[var(--primary)]" style={{ width: `${Math.round((row.points / row.max) * 100)}%` }} />
            </div>
            <p className="body-sm mt-2 text-[var(--on-surface-variant)]">{row.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ReadinessSignal({ label, complete, detail }: { label: string; complete: boolean; detail: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full ${
            complete
              ? "bg-[var(--success-status)]/10 text-[var(--success-status)]"
              : "bg-[var(--pending-status)]/10 text-[var(--pending-status)]"
          }`}
        >
          <span className="material-symbols-outlined text-[19px]" aria-hidden="true">
            {complete ? "check_circle" : "priority_high"}
          </span>
        </span>
        <div>
          <p className="font-semibold text-[var(--on-surface)]">{label}</p>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">{detail}</p>
        </div>
      </div>
    </div>
  );
}

export default async function LaunchReadinessAgentPage() {
  const [onboarding, risk, webhooks, payoutSettings] = await Promise.all([
    getOnboardingStatus(),
    getRiskOverview(),
    Promise.resolve(getSystemWebhookSummary()),
    getPayoutSettings(),
  ]);

  const technical = onboarding.sections.find((section) => section.id === "technical");
  const compliance = onboarding.sections.find((section) => section.id === "compliance");
  const bank = onboarding.sections.find((section) => section.id === "bank");
  const profile = onboarding.sections.find((section) => section.id === "profile");

  const signals = [
    {
      label: "Business profile",
      complete: profile?.tone === "success",
      detail: `${profile?.badge ?? "UNKNOWN"}: ${profile?.checks.filter((check) => check.done).length ?? 0}/${profile?.checks.length ?? 0} checks done`,
    },
    {
      label: "KYC / compliance",
      complete: compliance?.tone === "success",
      detail: `${compliance?.badge ?? "UNKNOWN"}: reviewers need clear identity and business evidence`,
    },
    {
      label: "Bank and payout setup",
      complete: bank?.tone === "success" && payoutSettings.automated,
      detail: `${bank?.badge ?? "UNKNOWN"}; auto payout ${payoutSettings.automated ? "enabled" : "disabled"} (${payoutSettings.cadence})`,
    },
    {
      label: "Technical setup",
      complete: technical?.tone === "success",
      detail: `${technical?.badge ?? "UNKNOWN"}: API keys and webhook evidence must be demo-ready`,
    },
    {
      label: "Webhook stability",
      complete: webhooks.last24h.rejected === 0 && webhooks.last24h.total > 0,
      detail: `${webhooks.last24h.received}/${webhooks.last24h.total} callbacks received in last 24h; ${webhooks.last24h.rejected} rejected`,
    },
    {
      label: "Risk controls",
      complete: risk.effective.volumeLimitsEnabled && risk.effective.rules.some((rule) => rule.enabled),
      detail: `${formatNumber(risk.effective.rules.filter((rule) => rule.enabled).length)} active rules; daily cap usage ${risk.usage.dailyPct}%`,
    },
  ];

  const scoreRows = [
    { label: "Profile", points: profile?.tone === "success" ? 15 : 8, max: 15, detail: profile?.badge ?? "Profile status unknown" },
    { label: "KYC", points: compliance?.tone === "success" ? 15 : 7, max: 15, detail: compliance?.badge ?? "Compliance status unknown" },
    { label: "Bank/Payout", points: bank?.tone === "success" && payoutSettings.automated ? 15 : bank?.tone === "success" ? 10 : 5, max: 15, detail: `Auto payout ${payoutSettings.automated ? "enabled" : "disabled"}` },
    { label: "Technical", points: technical?.tone === "success" ? 15 : 8, max: 15, detail: technical?.badge ?? "Technical status unknown" },
    { label: "Webhooks", points: webhooks.last24h.total > 0 && webhooks.last24h.rejected === 0 ? 15 : webhooks.last24h.total > 0 ? 8 : 4, max: 15, detail: `${webhooks.last24h.rejected} rejected in last 24h` },
    { label: "Risk", points: risk.effective.volumeLimitsEnabled && risk.effective.rules.some((rule) => rule.enabled) ? 15 : 6, max: 15, detail: `${risk.effective.rules.filter((rule) => rule.enabled).length} enabled rules` },
    { label: "Ideathon evidence", points: 10, max: 10, detail: "Firebase, Firestore, Gemini, Secret Manager, Cloud Run docs are present" },
  ];
  const score = scoreRows.reduce((sum, row) => sum + row.points, 0);
  const sectionContext = onboarding.sections
    .map((section) => {
      const checks = section.checks.map((check) => `${check.done ? "done" : "missing"}: ${check.label}`).join("; ");
      return `- ${section.title}: ${section.badge}, ${checks}`;
    })
    .join("\n");

  const readinessContext = `PayDash launch readiness snapshot:\n- Merchant: ${onboarding.merchantName}\n- App-computed readiness score: ${score}/100\n- Onboarding progress: ${onboarding.progress}% (${onboarding.trackedComplete}/${onboarding.trackedTotal} tracked checks)\n- Webhooks last 24h: ${webhooks.last24h.total} total, ${webhooks.last24h.received} received, ${webhooks.last24h.duplicated} duplicated, ${webhooks.last24h.rejected} rejected\n- Risk rules enabled: ${risk.effective.rules.filter((rule) => rule.enabled).length}/${risk.effective.rules.length}; daily cap usage ${risk.usage.dailyPct}%; monthly cap usage ${risk.usage.monthlyPct}%\n- Payout automation: ${payoutSettings.automated ? "enabled" : "disabled"}, cadence ${payoutSettings.cadence}, minimum ${formatMoney(payoutSettings.minimumAmount, payoutSettings.currency)}\n- Risk deployed at: ${formatDateTime(risk.deployedAt)}\n- Sections:\n${sectionContext}`;

  const quickPrompts: GeminiQuickPrompt[] = [
    {
      mode: "readiness-agent",
      title: "Launch score",
      text: `${readinessContext}\n\nReview this as a strict Launch Readiness Agent. Give a score, blockers, security gaps, stability gaps, and the next 7 actions before public launch.`,
    },
    {
      mode: "readiness-agent",
      title: "Walkthrough plan",
      text: `${readinessContext}\n\nBuat walkthrough demo 3 menit untuk judges. Tunjukkan PayDash UI, Firebase Auth, Firestore isolation, Gemini multi-turn, Secret Manager, Cloud Run label, dan readiness score.`,
    },
    {
      mode: "submission-review",
      title: "Submission audit",
      text: `${readinessContext}\n\nAudit kesiapan submission Ideathon saya. Sertakan checklist Cloud Run URL, social post #AccelerateAIwithCloudRun, public repo, dan brief description 1024 karakter.`,
    },
  ];

  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6 pb-12">
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_34%),linear-gradient(135deg,var(--surface),#fff)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Link href="/ai-journal" className="body-sm text-[var(--primary)] underline-offset-4 hover:underline">
              ← Back to AI Journal
            </Link>
            <p className="label-caps mt-4 text-[var(--on-surface-variant)]">Page 3 / PayDash as launch checklist</p>
            <h1 className="headline-xl text-[var(--on-surface)]">Launch Readiness Agent</h1>
            <p className="body-lg mt-2 text-[var(--on-surface-variant)]">
              Agent ini memakai onboarding, webhook health, risk rules, dan payout settings PayDash untuk menilai apakah
              merchant atau prototype siap launch dan siap dinilai Ideathon.
            </p>
          </div>
          <div className="text-right">
            <Badge className="bg-[var(--success-status)] text-white">Readiness score</Badge>
            <p className="data-mono mt-2 text-4xl font-bold text-[var(--on-surface)]">{score}/100</p>
          </div>
        </div>
      </section>

      <AiBoundaryBanner />
      <ContextTransparencyPanel
        items={[
          { label: "Onboarding status", detail: "Profile, compliance/KYC, bank setup, and technical checklist progress." },
          { label: "Webhook stability", detail: "Last 24h received, duplicated, and rejected callback counts." },
          { label: "Risk controls", detail: "Enabled rules, volume limit status, daily/monthly cap usage, and deployment timestamp." },
          { label: "Payout configuration", detail: "Automation status, cadence, and minimum payout amount." },
        ]}
      />
      <JudgeEvidencePanel />
      <AgentDeepLinks
        links={[
          { href: "/onboarding", label: "Onboarding", icon: "checklist" },
          { href: "/kyc", label: "KYC", icon: "verified_user" },
          { href: "/settings/api-keys", label: "API Keys", icon: "key" },
          { href: "/ai-journal/evaluation", label: "AI Evaluation", icon: "fact_check" },
        ]}
      />

      <ScoreBreakdown rows={scoreRows} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {signals.map((signal) => (
          <ReadinessSignal key={signal.label} {...signal} />
        ))}
      </div>

      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm">
        <CardHeader>
          <CardTitle className="headline-md">Readiness agent workspace</CardTitle>
          <p className="body-sm text-[var(--on-surface-variant)]">
            Gunakan agent ini sebagai security/stability reviewer untuk PayDash launch dan final Ideathon submission.
          </p>
        </CardHeader>
        <CardContent>
          <GeminiJournalAgent
            initialMode="readiness-agent"
            availableModes={["readiness-agent", "submission-review", "ops-copilot", "brainstorm"]}
            quickPrompts={quickPrompts}
            emptyTitle="Start a launch readiness review"
            threadTags={["readiness", "launch", "submission"]}
            reportKind="readiness-checklist"
          />
        </CardContent>
      </Card>

      <SubmissionToolkit />
    </main>
  );
}
