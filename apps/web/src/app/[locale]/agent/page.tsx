import { Badge } from "@/components/ui/badge";
import { MerchantOpsConsole } from "@/components/agent/merchant-ops-console";

export const dynamic = "force-dynamic";

export default function AgentPage() {
  return (
    <main className="mx-auto max-w-container-max space-y-6 p-gutter pb-12">
      <section className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[radial-gradient(circle_at_top_left,rgba(19,83,216,0.14),transparent_34%),linear-gradient(135deg,var(--surface),#ffffff)] p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-[var(--primary)] text-white">Strands Agents SDK</Badge>
              <Badge variant="outline" className="border-[var(--primary)]/30 text-[var(--primary)]">
                Amazon Bedrock
              </Badge>
              <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                Read-only · tenant-scoped
              </Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Merchant Operations Agent</h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              Investigate settlements, failed transactions and payout health with an agent that reads
              your organization&apos;s real operational data through audited, tenant-scoped tools — and
              shows you exactly which tools it used and what they found.
            </p>
          </div>
        </div>
      </section>

      <MerchantOpsConsole />
    </main>
  );
}
