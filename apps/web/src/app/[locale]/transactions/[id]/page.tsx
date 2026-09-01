import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { StatusPill } from "@/components/transactions/status-pill";
import { RefundDialog } from "@/components/transactions/refund-dialog";
import { RetryButton } from "@/components/transactions/retry-button";
import { CopyButton } from "@/components/common/copy-button";
import { formatDateLong, formatDateTime, formatMoney } from "@/lib/format";
import { getTransaction } from "@/server/data/transactions";
import { customerIdFromEmail } from "@/server/data/customers";

// Transaction detail — the destination for every ledger row / row-action.
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  return { title: `${id} — Transaction — Kinetic Ledger` };
}

const EVENT_TONE: Record<string, string> = {
  info: "bg-[var(--primary)]",
  success: "bg-[var(--success-status)]",
  warning: "bg-[var(--pending-status)]",
  error: "bg-[var(--failed-status)]",
};

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="label-caps text-[var(--on-surface-variant)] shrink-0">{label}</span>
      <span className={`text-right break-words ${mono ? "data-mono text-[var(--on-surface)]" : "body-sm text-[var(--on-surface)]"}`}>
        {value}
      </span>
    </div>
  );
}

export default async function TransactionDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tx = await getTransaction(id);
  if (!tx) notFound();

  const refundable = tx.amount - tx.refundedAmount;
  const refundDisabled = refundable <= 0 || tx.status === "FAILED" || tx.status === "PENDING";

  return (
    <main className="mx-auto w-full max-w-container-max p-gutter space-y-6 pb-12">
      <Breadcrumb>
        <BreadcrumbList className="body-sm">
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/dashboard">Dashboard</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/transactions">Transactions</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="data-mono">{tx.referenceId}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <section className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="headline-xl data-mono text-[var(--on-surface)] break-all">{tx.referenceId}</h1>
            <StatusPill status={tx.status} />
            <CopyButton value={tx.referenceId} label="Copy ID" />
          </div>
          <p className="body-md text-[var(--on-surface-variant)] mt-1">
            {formatMoney(tx.amount, tx.currency)} · {tx.methodLabel} · {formatDateLong(tx.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link href="/transactions">
            <Button variant="outline" className="border-[var(--border-subtle)] gap-1">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                arrow_back
              </span>
              Back to ledger
            </Button>
          </Link>
          <Link href={`/support?ref=${encodeURIComponent(tx.referenceId)}`}>
            <Button variant="outline" className="border-[var(--border-subtle)]">
              Contact support
            </Button>
          </Link>
          {tx.status === "FAILED" ? (
            <RetryButton id={tx.id} />
          ) : (
            <RefundDialog
              transactionId={tx.id}
              refundable={refundable}
              currency={tx.currency}
              disabled={refundDisabled}
              autoOpen={sp.refund === "1"}
            />
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Summary */}
        <Card className="lg:col-span-5 bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm">
          <h2 className="headline-md text-[var(--on-surface)] mb-2">Payment summary</h2>
          <div className="divide-y divide-[var(--border-subtle)]">
            <Row label="Amount" value={formatMoney(tx.amount, tx.currency)} mono />
            <Row label="Processing fee" value={`− ${formatMoney(tx.fee, tx.currency)}`} mono />
            <Row label="Net settlement" value={formatMoney(tx.net, tx.currency)} mono />
            {tx.refundedAmount > 0 ? (
              <Row label="Refunded" value={formatMoney(tx.refundedAmount, tx.currency)} mono />
            ) : null}
            <Row label="Channel" value={tx.channel} />
            <Row label="Method" value={tx.methodLabel} />
            <Row label="Risk score" value={`${tx.riskScore} / 100`} mono />
            <Row label="Created" value={formatDateLong(tx.createdAt)} />
            <Row label="Last updated" value={formatDateLong(tx.updatedAt)} />
            <Row label="Description" value={tx.description} />
          </div>
        </Card>

        {/* Customer + timeline */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="headline-md text-[var(--on-surface)]">Customer</h2>
                <p className="body-md text-[var(--on-surface)] mt-2 truncate">{tx.customerName}</p>
                <p className="body-sm text-[var(--on-surface-variant)] truncate">{tx.customerEmail}</p>
              </div>
              <Link href={`/customers/${customerIdFromEmail(tx.customerEmail)}`}>
                <Button variant="outline" className="border-[var(--border-subtle)] shrink-0">
                  View customer
                </Button>
              </Link>
            </div>
            <Separator className="my-4 bg-[var(--border-subtle)]" />
            <div className="flex flex-wrap gap-2">
              <CopyButton value={tx.customerEmail} label="Copy email" />
              <Link href={`/transactions?q=${encodeURIComponent(tx.customerEmail)}`}>
                <Button variant="ghost" size="sm" className="h-7 text-[var(--primary)]">
                  All payments from this customer
                </Button>
              </Link>
            </div>
          </Card>

          <Card className="bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm">
            <h2 className="headline-md text-[var(--on-surface)] mb-4">Event timeline</h2>
            <ol className="relative border-l border-[var(--border-subtle)] pl-6 space-y-5">
              {tx.events.map((e) => (
                <li key={e.id} className="relative">
                  <span
                    className={`absolute -left-[27px] top-1.5 size-2.5 rounded-full ring-4 ring-[var(--surface)] ${EVENT_TONE[e.kind]}`}
                    aria-hidden="true"
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="body-sm font-medium text-[var(--on-surface)]">{e.label}</p>
                    <time className="data-mono text-xs text-[var(--on-surface-variant)]" dateTime={e.at}>
                      {formatDateTime(e.at)}
                    </time>
                  </div>
                  <p className="body-sm text-[var(--on-surface-variant)] text-xs mt-0.5">{e.detail}</p>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4 mb-3">
              <h2 className="headline-md text-[var(--on-surface)]">Raw payload</h2>
              <CopyButton value={JSON.stringify(tx, null, 2)} label="Copy JSON" />
            </div>
            <pre className="data-mono text-xs overflow-x-auto rounded-lg bg-[var(--surface-container-low)] p-4 text-[var(--on-surface-variant)]">
              {JSON.stringify(
                {
                  id: tx.id,
                  reference_id: tx.referenceId,
                  status: tx.status,
                  amount: tx.amount,
                  currency: tx.currency,
                  fee: tx.fee,
                  net: tx.net,
                  channel: tx.channel,
                  customer: { name: tx.customerName, email: tx.customerEmail },
                  created_at: tx.createdAt,
                  updated_at: tx.updatedAt,
                },
                null,
                2
              )}
            </pre>
          </Card>
        </div>
      </div>
    </main>
  );
}
