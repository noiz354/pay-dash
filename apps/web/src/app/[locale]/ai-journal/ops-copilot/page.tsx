import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentDeepLinks, AiBoundaryBanner, ContextTransparencyPanel } from "@/components/ai-journal/ai-agent-ux";
import { GeminiJournalAgent, type GeminiQuickPrompt } from "@/components/ai-journal/gemini-journal-agent";
import { formatCompactMoney, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { getBalanceOverview } from "@/server/data/balance";
import { getPayoutsOverview } from "@/server/data/payouts";
import { getRiskOverview } from "@/server/data/risk";
import { getLedgerMetrics, listTransactions } from "@/server/data/transactions";
import { getSystemWebhookSummary } from "@/server/data/webhooks";

export const dynamic = "force-dynamic";

function SignalCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: string }) {
  return (
    <Card className="border-[var(--border-subtle)] bg-white shadow-sm">
      <CardContent className="flex items-start gap-3 p-4">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">{icon}</span>
        </span>
        <div className="min-w-0">
          <p className="label-caps text-[var(--on-surface-variant)]">{label}</p>
          <p className="data-mono mt-1 text-lg font-bold text-[var(--on-surface)]">{value}</p>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function MerchantOpsCopilotPage() {
  const [metrics, balance, payouts, risk, webhooks, failed] = await Promise.all([
    getLedgerMetrics(),
    getBalanceOverview(),
    getPayoutsOverview(),
    getRiskOverview(),
    Promise.resolve(getSystemWebhookSummary()),
    listTransactions({ status: "FAILED", pageSize: 5 }),
  ]);

  const failedRows = failed.rows
    .map((tx) => {
      const reason = tx.events.find((event) => event.kind === "error")?.detail ?? "No failure reason recorded";
      return `- ${tx.id}: ${tx.customerName}, ${formatMoney(tx.amount, tx.currency)}, ${tx.channel}, risk ${tx.riskScore}, ${reason}`;
    })
    .join("\n");

  const opsContext = `PayDash operations snapshot:\n- Total 7d volume: ${formatMoney(metrics.totalVolume, metrics.currency)} (${formatPercent(metrics.volumeDelta)} vs previous period)\n- Successful payments: ${formatNumber(metrics.succeededCount)} (${formatPercent(metrics.succeededDelta)} vs previous period)\n- Failed rate: ${metrics.failedRate.toFixed(1)}% (${formatPercent(metrics.failedRateDelta)} pt delta)\n- Failed count: ${metrics.failedCount}; processing/pending: ${metrics.processingCount}\n- Available balance: ${formatMoney(balance.available, balance.currency)}; pending settlements: ${formatMoney(balance.pendingSettlements, balance.currency)}; reserved: ${formatMoney(balance.reserved, balance.currency)}\n- Pending payouts: ${formatMoney(payouts.pendingAmount, payouts.currency)} across ${payouts.pendingBatches} batches / ${payouts.pendingRecipients} recipients\n- Failed payout recipients: ${payouts.failedRecipients}, failed amount: ${formatMoney(payouts.failedAmount, payouts.currency)}\n- Risk alerts: ${risk.alertCount} high-risk transactions from ${risk.scanned} scanned; daily cap usage ${risk.usage.dailyPct}%\n- Webhooks last 24h: ${webhooks.last24h.total} total, ${webhooks.last24h.received} received, ${webhooks.last24h.duplicated} duplicated, ${webhooks.last24h.rejected} rejected\n- Top failed payments:\n${failedRows || "No failed payments in the current snapshot."}`;

  const quickPrompts: GeminiQuickPrompt[] = [
    {
      mode: "ops-copilot",
      title: "Daily brief",
      text: `${opsContext}\n\nBuat daily merchant operations briefing. Fokuskan pada risiko, prioritas 24 jam, dan metrik PayDash mana yang harus saya buka dulu.`,
    },
    {
      mode: "ops-copilot",
      title: "Incident review",
      text: `${opsContext}\n\nIdentifikasi 3 potensi incident dari snapshot ini, severity-nya, kemungkinan penyebab, dan mitigasi yang aman tanpa menjalankan aksi pembayaran otomatis.`,
    },
    {
      mode: "brainstorm",
      title: "Product angle",
      text: `${opsContext}\n\nGunakan Brainstorm Skill: idekan enhancement PayDash Merchant Ops Copilot yang paling original untuk demo Ideathon, dengan HMW, variasi, asumsi, dan Not Doing list.`,
    },
  ];

  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6 pb-12">
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[radial-gradient(circle_at_top_left,rgba(19,83,216,0.16),transparent_34%),linear-gradient(135deg,var(--surface),#fff)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Link href="/ai-journal" className="body-sm text-[var(--primary)] underline-offset-4 hover:underline">
              ← Back to AI Journal
            </Link>
            <p className="label-caps mt-4 text-[var(--on-surface-variant)]">Page 1 / PayDash as operations UI</p>
            <h1 className="headline-xl text-[var(--on-surface)]">Merchant Ops Copilot</h1>
            <p className="body-lg mt-2 text-[var(--on-surface-variant)]">
              Agent ini memanfaatkan PayDash sebagai command center: ledger, balance, payouts, risk, dan webhook signals
              diringkas menjadi daily operating plan yang tersimpan private di Firestore.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-[var(--primary)] text-white">Gemini ops analysis</Badge>
            <Badge variant="outline">Firestore private journal</Badge>
            <Badge variant="outline">Cloud Run-ready</Badge>
          </div>
        </div>
      </section>

      <AiBoundaryBanner />
      <ContextTransparencyPanel
        items={[
          { label: "Ledger metrics", detail: "7-day volume, success count, failure rate, failed/processing counts." },
          { label: "Balance and payouts", detail: "Available balance, pending settlements, reserved funds, payout queue." },
          { label: "Risk and webhook health", detail: "Risk alert count, cap usage, received/duplicated/rejected callback totals." },
          { label: "Failed payment sample", detail: "Top failed transaction IDs, customers, amount, channel, risk score, and failure reason." },
        ]}
      />
      <AgentDeepLinks
        links={[
          { href: "/transactions?status=FAILED", label: "Failed Transactions", icon: "receipt_long" },
          { href: "/webhooks", label: "Webhook Logs", icon: "webhook" },
          { href: "/risk", label: "Risk Rules", icon: "shield" },
          { href: "/payouts", label: "Payouts", icon: "payments" },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SignalCard label="7d volume" value={formatCompactMoney(metrics.totalVolume, metrics.currency)} detail={`${formatPercent(metrics.volumeDelta)} vs previous period`} icon="payments" />
        <SignalCard label="Failure rate" value={`${metrics.failedRate.toFixed(1)}%`} detail={`${metrics.failedCount} failed payments`} icon="error" />
        <SignalCard label="Available balance" value={formatCompactMoney(balance.available, balance.currency)} detail={`${formatCompactMoney(balance.pendingSettlements, balance.currency)} pending settlement`} icon="account_balance_wallet" />
        <SignalCard label="Risk alerts" value={formatNumber(risk.alertCount)} detail={`${risk.usage.dailyPct}% daily cap usage`} icon="shield" />
        <SignalCard label="Webhook health" value={`${webhooks.last24h.received}/${webhooks.last24h.total}`} detail={`${webhooks.last24h.rejected} rejected callbacks`} icon="webhook" />
      </div>

      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm">
        <CardHeader>
          <CardTitle className="headline-md">Ops agent workspace</CardTitle>
          <p className="body-sm text-[var(--on-surface-variant)]">
            Klik prompt snapshot atau tulis pertanyaan sendiri. Gemini mendapat konteks PayDash lewat prompt, lalu hasilnya
            tersimpan per Firebase UID.
          </p>
        </CardHeader>
        <CardContent>
          <GeminiJournalAgent
            initialMode="ops-copilot"
            availableModes={["ops-copilot", "journal", "brainstorm"]}
            quickPrompts={quickPrompts}
            emptyTitle="Start a merchant ops briefing"
            threadTags={["ops", "paydash", "daily-brief"]}
            reportKind="ops-report"
          />
        </CardContent>
      </Card>
    </main>
  );
}
