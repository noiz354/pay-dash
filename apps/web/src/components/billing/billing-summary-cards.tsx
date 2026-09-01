import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PayInvoiceDialog } from "@/components/billing/pay-invoice-dialog";
import { formatDateLong, formatMoney, formatPercent } from "@/lib/format";
import type { BillingSummary, Invoice } from "@/server/data/invoices";

/**
 * The summary bento from the prototype, now fed by real data.
 * "Next Invoice Date" and "Current Month Accrued Fees" were hard-coded strings;
 * both are derived from the ledger, and two new cards give the previously
 * unanswerable questions a home: what do I owe, and what did I last pay?
 */
export function BillingSummaryCards({
  summary,
  nextPayable,
}: {
  summary: BillingSummary;
  nextPayable?: Invoice | null;
}) {
  return (
    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:w-auto xl:grid-cols-4">
      <Card className="flex min-w-[200px] flex-col gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4">
        <span className="label-caps uppercase text-[var(--outline)]">Next Invoice Date</span>
        <span className="mt-1 data-mono text-[20px] font-semibold text-[var(--on-surface)]">
          {formatDateLong(summary.nextInvoiceDate)}
        </span>
        <div className="body-sm mt-2 flex items-center gap-1 text-[var(--on-surface-variant)]">
          <span className="material-symbols-outlined text-[16px] text-[var(--primary)]" aria-hidden="true">
            event
          </span>
          <Link href="/settings/merchant" className="hover:text-[var(--primary)] hover:underline">
            {summary.autoDebitEnabled ? "Auto-debit scheduled" : "Auto-debit off — set it up"}
          </Link>
        </div>
      </Card>

      <Card className="flex min-w-[240px] flex-col gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4">
        <span className="label-caps uppercase text-[var(--outline)]">Current Month Accrued Fees</span>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="body-sm text-[var(--on-surface-variant)]">{summary.currency}</span>
          <span className="data-mono text-[24px] font-bold text-[var(--on-surface)]">
            {new Intl.NumberFormat("id-ID").format(summary.accruedThisMonth)}
          </span>
        </div>
        <div className="body-sm mt-2 flex items-center gap-1">
          <span
            className={`material-symbols-outlined text-[16px] ${
              summary.accruedDelta <= 0 ? "text-[var(--success-status)]" : "text-[var(--pending-status)]"
            }`}
            aria-hidden="true"
          >
            {summary.accruedDelta <= 0 ? "trending_down" : "trending_up"}
          </span>
          <span
            className={`font-medium ${
              summary.accruedDelta <= 0 ? "text-[var(--success-status)]" : "text-[var(--pending-status)]"
            }`}
          >
            {formatPercent(summary.accruedDelta)}
          </span>
          <span className="ml-1 text-[var(--outline)]">vs last month</span>
        </div>
      </Card>

      <Card
        className={`flex min-w-[220px] flex-col gap-1 rounded-xl border p-4 ${
          summary.overdueCount > 0
            ? "border-[var(--failed-status)]/40 bg-[var(--failed-status)]/[0.04]"
            : "border-[var(--border-subtle)] bg-[var(--surface-container-lowest)]"
        }`}
      >
        <span className="label-caps uppercase text-[var(--outline)]">Outstanding</span>
        <span className="mt-1 data-mono text-[20px] font-semibold text-[var(--on-surface)]">
          {formatMoney(summary.outstandingAmount, summary.currency)}
        </span>
        <div className="mt-2">
          {summary.outstandingCount === 0 ? (
            <span className="body-sm text-[var(--success-status)]">All settled</span>
          ) : nextPayable ? (
            <PayInvoiceDialog
              invoiceId={nextPayable.id}
              invoiceNumber={nextPayable.number}
              amount={nextPayable.amount}
              currency={nextPayable.currency}
              dueLabel={formatDateLong(nextPayable.dueAt)}
              triggerLabel={`Pay ${nextPayable.number}`}
              triggerClassName="h-8 px-2 text-xs"
              variant="outline"
            />
          ) : (
            <span className="body-sm text-[var(--on-surface-variant)]">
              {summary.outstandingCount} invoice{summary.outstandingCount === 1 ? "" : "s"} open
            </span>
          )}
        </div>
      </Card>

      <Card className="flex min-w-[200px] flex-col gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4">
        <span className="label-caps uppercase text-[var(--outline)]">Last Payment</span>
        <span className="mt-1 data-mono text-[20px] font-semibold text-[var(--on-surface)]">
          {summary.lastPaidAt ? formatMoney(summary.lastPaidAmount, summary.currency) : "—"}
        </span>
        <span className="body-sm mt-2 text-[var(--on-surface-variant)]">
          {summary.lastPaidAt ? formatDateLong(summary.lastPaidAt) : "No payments recorded yet"}
        </span>
      </Card>
    </div>
  );
}

/**
 * Escalation banner for overdue invoices — the prototype rendered "Overdue" as
 * a badge with no way to act on it.
 */
export function OverdueBanner({ invoice }: { invoice: Invoice }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-[var(--failed-status)]/40 bg-[var(--failed-status)]/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-[20px] text-[var(--failed-status)]" aria-hidden="true">
          warning
        </span>
        <div>
          <p className="body-md font-medium text-[var(--on-surface)]">
            {invoice.number} is overdue — {formatMoney(invoice.amount, invoice.currency)}
          </p>
          <p className="body-sm text-[var(--on-surface-variant)]">
            Due {formatDateLong(invoice.dueAt)}. Settle it to avoid a service interruption.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link href={`/billing/${invoice.id}`}>
          <Button variant="outline" className="border-[var(--border-subtle)]">
            View invoice
          </Button>
        </Link>
        <PayInvoiceDialog
          invoiceId={invoice.id}
          invoiceNumber={invoice.number}
          amount={invoice.amount}
          currency={invoice.currency}
          dueLabel={formatDateLong(invoice.dueAt)}
        />
      </div>
    </div>
  );
}
