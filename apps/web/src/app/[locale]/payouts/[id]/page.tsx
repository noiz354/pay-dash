import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { PayoutStatusPill } from "@/components/payouts/payout-status-pill";
import { RecipientsTable } from "@/components/payouts/recipients-table";
import { BatchTimeline } from "@/components/payouts/batch-timeline";
import { ReleaseBatchDialog } from "@/components/payouts/release-batch-dialog";
import { RetryFailuresButton } from "@/components/payouts/retry-failures-button";
import { getBatch, summarise } from "@/server/data/payouts";
import { isApprovable, isCancellable, isRetryable } from "@/lib/payout-status";
import { formatDateLong, formatDateTime, formatMoney, formatNumber } from "@/lib/format";

// Batch detail — the destination "3 active batches" never had.

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const batch = await getBatch(id);
  return { title: batch ? `${batch.name} — Payouts` : "Batch not found — Payouts" };
}

export default async function BatchDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const batch = await getBatch(id);
  if (!batch) notFound();

  const summary = summarise(batch);
  const pendingAmount = batch.recipients
    .filter((r) => r.status === "PENDING")
    .reduce((s, r) => s + r.amount, 0);

  return (
    <main className="mx-auto w-full max-w-container-max space-y-6 p-gutter">
      <nav aria-label="Breadcrumb" className="body-sm flex items-center gap-2 text-[var(--on-surface-variant)]">
        <Link href="/payouts" className="transition-colors hover:text-[var(--primary)]">
          Payouts
        </Link>
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
          chevron_right
        </span>
        <span className="data-mono text-[var(--on-surface)]" aria-current="page">
          {batch.id}
        </span>
      </nav>

      <header className="flex flex-col gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="headline-xl text-[var(--on-surface)]">{batch.name}</h1>
            <PayoutStatusPill status={summary.status} />
          </div>
          <p className="body-sm mt-2 text-[var(--on-surface-variant)]">
            {batch.source} · created {formatDateTime(batch.createdAt)}
            {batch.scheduledFor ? ` · releases ${formatDateLong(batch.scheduledFor)}` : ""}
            {batch.completedAt ? ` · completed ${formatDateTime(batch.completedAt)}` : ""}
          </p>
          {batch.note ? (
            <p className="body-sm mt-2 rounded-lg border border-dashed border-[var(--border-subtle)] p-3 text-[var(--on-surface-variant)]">
              {batch.note}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/exports/payouts/${batch.id}`} download>
            <Button variant="outline" className="gap-2 border-[var(--border-subtle)]">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                download
              </span>
              Recipients CSV
            </Button>
          </a>
          {isRetryable(summary.status) && summary.failedCount > 0 ? (
            <RetryFailuresButton batchId={batch.id} failedCount={summary.failedCount} />
          ) : null}
          {isCancellable(summary.status) ? (
            <ReleaseBatchDialog
              batchId={batch.id}
              batchName={batch.name}
              amount={pendingAmount}
              currency={batch.currency}
              recipientCount={summary.recipientCount}
              mode="cancel"
              triggerVariant="outline"
            />
          ) : null}
          {isApprovable(summary.status) ? (
            <ReleaseBatchDialog
              batchId={batch.id}
              batchName={batch.name}
              amount={pendingAmount}
              currency={batch.currency}
              recipientCount={summary.recipientCount}
              mode="send"
            />
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Batch total", value: formatMoney(summary.totalAmount, batch.currency), detail: `${formatNumber(summary.recipientCount)} recipients` },
          { label: "Paid", value: formatMoney(summary.paidAmount, batch.currency), detail: `${formatNumber(summary.paidCount)} settled` },
          { label: "Outstanding", value: formatMoney(pendingAmount, batch.currency), detail: `${formatNumber(summary.recipientCount - summary.paidCount - summary.failedCount)} pending` },
          { label: "Needs attention", value: formatMoney(summary.failedAmount, batch.currency), detail: `${formatNumber(summary.failedCount)} failed or returned` },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-5"
          >
            <span className="label-caps text-[var(--on-surface-variant)]">{card.label}</span>
            <div className="headline-lg data-mono mt-1 text-[var(--on-surface)]">{card.value}</div>
            <div className="body-sm mt-1 text-[var(--on-surface-variant)]">{card.detail}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecipientsTable batchId={batch.id} recipients={batch.recipients} currency={batch.currency} />
        </div>
        <div className="space-y-6">
          <BatchTimeline events={batch.timeline} />
          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-6">
            <h2 className="headline-md mb-2 text-[var(--on-surface)]">Where the money comes from</h2>
            <p className="body-sm text-[var(--on-surface-variant)]">
              Batches draw on the settled balance and follow the schedule configured for this account.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/balance"
                className="label-md rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
              >
                View balance
              </Link>
              <Link
                href="/payouts/settings"
                className="label-md rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
              >
                Payout settings
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
