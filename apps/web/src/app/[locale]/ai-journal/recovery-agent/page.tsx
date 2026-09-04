import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentDeepLinks, AgentEmptyState, AiBoundaryBanner, ContextTransparencyPanel } from "@/components/ai-journal/ai-agent-ux";
import { GeminiJournalAgent, type GeminiQuickPrompt } from "@/components/ai-journal/gemini-journal-agent";
import { formatCompactMoney, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { listCustomers } from "@/server/data/customers";
import { getLedgerMetrics, listTransactions } from "@/server/data/transactions";

export const dynamic = "force-dynamic";

function RecoveryMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="border-[var(--border-subtle)] bg-white shadow-sm">
      <CardContent className="p-4">
        <p className="label-caps text-[var(--on-surface-variant)]">{label}</p>
        <p className="data-mono mt-1 text-2xl font-bold text-[var(--on-surface)]">{value}</p>
        <p className="body-sm mt-1 text-[var(--on-surface-variant)]">{detail}</p>
      </CardContent>
    </Card>
  );
}

export default async function FailedPaymentRecoveryPage() {
  const [metrics, failed, customers] = await Promise.all([
    getLedgerMetrics(),
    listTransactions({ status: "FAILED", pageSize: 8 }),
    listCustomers({ pageSize: 100 }),
  ]);

  const failedAmount = failed.rows.reduce((sum, tx) => sum + tx.amount, 0);
  const uniqueCustomers = new Set(failed.rows.map((tx) => tx.customerEmail)).size;
  const highRiskFailures = failed.rows.filter((tx) => tx.riskScore >= 60).length;

  const failedContext = failed.rows
    .map((tx) => {
      const reason = tx.events.find((event) => event.kind === "error")?.detail ?? "Reason not recorded";
      return `- ${tx.id}: ${tx.customerName} <${tx.customerEmail}>, ${formatMoney(tx.amount, tx.currency)}, channel ${tx.channel}, method ${tx.methodLabel}, risk ${tx.riskScore}, created ${formatDateTime(tx.createdAt)}, failure: ${reason}`;
    })
    .join("\n");

  const recoveryContext = `PayDash failed payment recovery snapshot:\n- Current failed rate: ${metrics.failedRate.toFixed(1)}% from ${metrics.failedCount} failures in the active ledger window\n- Visible failed amount: ${formatMoney(failedAmount, metrics.currency)} across ${failed.rows.length} failed transactions\n- Affected customers in sample: ${uniqueCustomers}\n- High-risk failures: ${highRiskFailures}\n- Customer directory size: ${formatNumber(customers.total)}\n- Failed transaction sample:\n${failedContext || "No failed payments available."}`;

  const quickPrompts: GeminiQuickPrompt[] = [
    {
      mode: "recovery-agent",
      title: "Recovery plan",
      text: `${recoveryContext}\n\nBuat payment recovery plan 3 hari. Segmentasikan customer, rekomendasikan timing retry, dan buat action checklist untuk merchant tanpa mengklaim sudah mengeksekusi pembayaran.`,
    },
    {
      mode: "recovery-agent",
      title: "Customer copy",
      text: `${recoveryContext}\n\nTulis 3 versi pesan customer yang sopan dalam Bahasa Indonesia: friendly reminder, expired/failed payment link follow-up, dan high-value customer concierge. Sertakan caveat consent/data privacy.`,
    },
    {
      mode: "brainstorm",
      title: "Feature idea",
      text: `${recoveryContext}\n\nGunakan Brainstorm Skill untuk mencari fitur original Failed Payment Recovery Agent yang paling demonstrable di PayDash UI untuk Ideathon.`,
    },
  ];

  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6 pb-12">
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.14),transparent_34%),linear-gradient(135deg,var(--surface),#fff)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Link href="/ai-journal" className="body-sm text-[var(--primary)] underline-offset-4 hover:underline">
              ← Back to AI Journal
            </Link>
            <p className="label-caps mt-4 text-[var(--on-surface-variant)]">Page 2 / PayDash as recovery API context</p>
            <h1 className="headline-xl text-[var(--on-surface)]">Failed Payment Recovery Agent</h1>
            <p className="body-lg mt-2 text-[var(--on-surface-variant)]">
              Agent ini membaca sample failed transactions PayDash dan mengubahnya menjadi recovery plan, customer-safe
              messaging, dan retry checklist yang bisa disimpan sebagai private Firestore journal.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-[var(--failed-status)] text-white">Revenue recovery</Badge>
            <Badge variant="outline">Customer-safe copy</Badge>
            <Badge variant="outline">No auto money movement</Badge>
          </div>
        </div>
      </section>

      <AiBoundaryBanner />
      <ContextTransparencyPanel
        items={[
          { label: "Failed transactions", detail: "Failed amount, affected customers, channel, payment method, risk score, and failure reason." },
          { label: "Customer directory totals", detail: "Directory size and customer identifiers needed to group recovery outreach." },
          { label: "Recovery constraints", detail: "The agent drafts plans/messages only; it never retries or marks payments successful." },
          { label: "Privacy defaults", detail: "Copy/save controls can redact customer names, emails, and card-like method labels." },
        ]}
      />
      <AgentDeepLinks
        links={[
          { href: "/transactions?status=FAILED", label: "Failed Transactions", icon: "receipt_long" },
          { href: "/customers", label: "Customers", icon: "group" },
          { href: "/payments/links", label: "Payment Links", icon: "link" },
          { href: "/webhooks", label: "Webhook Logs", icon: "webhook" },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <RecoveryMetric label="Failed amount" value={formatCompactMoney(failedAmount, metrics.currency)} detail={`${failed.rows.length} failed payments in sample`} />
        <RecoveryMetric label="Affected customers" value={formatNumber(uniqueCustomers)} detail={`${formatNumber(customers.total)} customers in directory`} />
        <RecoveryMetric label="High-risk failures" value={formatNumber(highRiskFailures)} detail="Require careful manual review" />
        <RecoveryMetric label="Failure rate" value={`${metrics.failedRate.toFixed(1)}%`} detail={`${metrics.failedCount} active-window failures`} />
      </div>

      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm">
        <CardHeader>
          <CardTitle className="headline-md">Failed transaction sample</CardTitle>
          <p className="body-sm text-[var(--on-surface-variant)]">
            Data ini berasal dari PayDash transaction store dan dipakai sebagai konteks prompt recovery.
          </p>
        </CardHeader>
        <CardContent>
          {failed.rows.length === 0 ? (
            <AgentEmptyState
              title="No failed payments found in this snapshot"
              description="Recovery Agent can still help you prepare a prevention playbook before failures happen."
              actions={["Draft a retry SOP", "Create a customer-safe follow-up template", "Define escalation rules for high-value payments"]}
            />
          ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-white">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-[var(--surface-container-low)] label-caps text-[var(--on-surface-variant)]">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3 text-right">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] body-sm">
                {failed.rows.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-4 py-3">
                      <span className="block font-medium text-[var(--on-surface)]">{tx.customerName}</span>
                      <span className="text-[12px] text-[var(--on-surface-variant)]">{tx.customerEmail}</span>
                    </td>
                    <td className="px-4 py-3 text-right data-mono">{formatMoney(tx.amount, tx.currency)}</td>
                    <td className="px-4 py-3">{tx.channel}</td>
                    <td className="px-4 py-3">{tx.methodLabel}</td>
                    <td className="px-4 py-3 text-right data-mono">{tx.riskScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm">
        <CardHeader>
          <CardTitle className="headline-md">Recovery agent workspace</CardTitle>
          <p className="body-sm text-[var(--on-surface-variant)]">
            Gunakan agent untuk membuat plan dan pesan customer. Semua percakapan tetap multi-turn dan tersimpan per user.
          </p>
        </CardHeader>
        <CardContent>
          <GeminiJournalAgent
            initialMode="recovery-agent"
            availableModes={["recovery-agent", "ops-copilot", "journal", "brainstorm"]}
            quickPrompts={quickPrompts}
            emptyTitle="Start a failed-payment recovery plan"
            threadTags={["recovery", "failed-payment", "customer-copy"]}
            reportKind="recovery-plan"
          />
        </CardContent>
      </Card>
    </main>
  );
}
