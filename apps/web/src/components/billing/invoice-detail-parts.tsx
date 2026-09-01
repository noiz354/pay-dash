import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "@/components/common/copy-button";
import { InvoiceStatusPill } from "@/components/billing/invoice-status-pill";
import { PayInvoiceDialog } from "@/components/billing/pay-invoice-dialog";
import { DownloadInvoiceButton } from "@/components/billing/download-invoice-button";
import { formatDateLong, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { isPayable } from "@/lib/invoice-status";
import type { Invoice, InvoiceLineItem, InvoicePaymentEvent } from "@/server/data/invoices";

// --- header -----------------------------------------------------------------

export function InvoiceHeader({ invoice }: { invoice: Invoice }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="headline-xl data-mono text-[var(--on-surface)]">{invoice.number}</h1>
          <InvoiceStatusPill status={invoice.status} />
          <CopyButton value={invoice.number} label="Copy invoice ID" />
        </div>
        <p className="body-md mt-2 text-[var(--on-surface-variant)]">
          {invoice.periodLabel} · Issued {formatDateLong(invoice.issuedAt)} · Due{" "}
          {formatDateLong(invoice.dueAt)}
        </p>
        {invoice.notes ? (
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">{invoice.notes}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <DownloadInvoiceButton invoiceId={invoice.id} invoiceNumber={invoice.number} />
        {isPayable(invoice.status) ? (
          <PayInvoiceDialog
            invoiceId={invoice.id}
            invoiceNumber={invoice.number}
            amount={invoice.amount}
            currency={invoice.currency}
            dueLabel={formatDateLong(invoice.dueAt)}
          />
        ) : (
          <Link href="/billing">
            <Button variant="outline" className="border-[var(--border-subtle)]">
              Back to billing
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

// --- totals -----------------------------------------------------------------

export function InvoiceTotals({ invoice }: { invoice: Invoice }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <span className="label-caps text-[var(--on-surface-variant)]">Invoice total</span>
        <div className="mt-2 headline-lg data-mono text-[var(--on-surface)]">
          {formatMoney(invoice.amount, invoice.currency)}
        </div>
      </Card>
      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <span className="label-caps text-[var(--on-surface-variant)]">Transactions billed</span>
        <div className="mt-2 headline-lg data-mono text-[var(--on-surface)]">
          {formatNumber(invoice.transactionCount)}
        </div>
      </Card>
      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <span className="label-caps text-[var(--on-surface-variant)]">Volume processed</span>
        <div className="mt-2 headline-lg data-mono text-[var(--on-surface)]">
          {formatMoney(invoice.processedVolume, invoice.currency)}
        </div>
      </Card>
      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <span className="label-caps text-[var(--on-surface-variant)]">Effective rate</span>
        <div className="mt-2 headline-lg data-mono text-[var(--on-surface)]">
          {invoice.processedVolume ? ((invoice.amount / invoice.processedVolume) * 100).toFixed(2) : "0.00"}%
        </div>
      </Card>
    </div>
  );
}

// --- line items -------------------------------------------------------------

export function InvoiceLineItems({
  items,
  invoice,
}: {
  items: InvoiceLineItem[];
  invoice: Invoice;
}) {
  const subtotal = items.reduce((a, li) => a + li.amount, 0);

  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-0">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
        <h2 className="headline-md text-[var(--on-surface)]">Line items</h2>
        <Link
          href={`/transactions?range=all`}
          className="body-sm text-[var(--primary)] underline-offset-2 hover:underline"
        >
          View billed transactions
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="body-sm px-4 py-6 text-[var(--on-surface-variant)]">
          No billable activity in this period.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Invoice line items</caption>
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-container-low)] label-caps">
                <th scope="col" className="px-4 py-2 font-semibold text-[var(--on-surface-variant)]">Item</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold text-[var(--on-surface-variant)]">Qty</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold text-[var(--on-surface-variant)]">Unit</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold text-[var(--on-surface-variant)]">Amount</th>
              </tr>
            </thead>
            <tbody className="body-sm divide-y divide-[var(--border-subtle)]">
              {items.map((li) => (
                <tr key={li.id}>
                  <td className="px-4 py-3">
                    <span className="block text-[var(--on-surface)]">{li.label}</span>
                    <span className="block text-xs text-[var(--on-surface-variant)]">{li.detail}</span>
                  </td>
                  <td className="px-4 py-3 text-right data-mono text-[var(--on-surface-variant)]">
                    {formatNumber(li.quantity)}
                  </td>
                  <td className="px-4 py-3 text-right data-mono text-[var(--on-surface-variant)]">
                    {formatMoney(li.unitAmount, invoice.currency)}
                  </td>
                  <td className="px-4 py-3 text-right data-mono text-[var(--on-surface)]">
                    {formatMoney(li.amount, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Separator />
      <div className="flex items-center justify-between px-4 py-3">
        <span className="label-caps text-[var(--on-surface-variant)]">Total</span>
        <span className="data-mono text-[18px] font-semibold text-[var(--on-surface)]">
          {formatMoney(subtotal || invoice.amount, invoice.currency)}
        </span>
      </div>
    </Card>
  );
}

// --- timeline ---------------------------------------------------------------

const TONE: Record<InvoicePaymentEvent["kind"], string> = {
  info: "bg-[var(--primary)]",
  success: "bg-[var(--success-status)]",
  warning: "bg-[var(--pending-status)]",
  error: "bg-[var(--failed-status)]",
};

export function InvoicePaymentTimeline({ events }: { events: InvoicePaymentEvent[] }) {
  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <h2 className="headline-md text-[var(--on-surface)]">Payment timeline</h2>
      {events.length === 0 ? (
        <p className="body-sm mt-2 text-[var(--on-surface-variant)]">Nothing has happened on this invoice yet.</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE[e.kind]}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="body-sm font-medium text-[var(--on-surface)]">{e.label}</p>
                <p className="body-sm text-[var(--on-surface-variant)]">{e.detail}</p>
                <p className="data-mono text-xs text-[var(--outline)]">{formatDateTime(e.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
