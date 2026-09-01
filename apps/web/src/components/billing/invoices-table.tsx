import { Link } from "@/i18n/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClickableRow } from "@/components/transactions/clickable-row";
import { InvoiceStatusPill } from "@/components/billing/invoice-status-pill";
import { InvoiceRowActions } from "@/components/billing/invoice-row-actions";
import { DownloadInvoiceButton } from "@/components/billing/download-invoice-button";
import { InvoicesEmptyState } from "@/components/billing/invoices-empty-state";
import { formatMoney } from "@/lib/format";
import type { Invoice } from "@/server/data/invoices";

/**
 * Invoice history table.
 * Keeps the prototype's columns (ID / period / amount / status / action) and
 * its PDF button, but the whole row is now a link to `/[locale]/billing/[id]`,
 * amounts run through `formatMoney`, overdue rows are visually escalated, and
 * the empty state distinguishes "nothing yet" from "nothing matches".
 */
export function InvoicesTable({
  rows,
  isFiltered = false,
  toolbar,
  footer,
  emptyAction,
}: {
  rows: Invoice[];
  isFiltered?: boolean;
  toolbar?: React.ReactNode;
  footer?: React.ReactNode;
  emptyAction?: React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <Card className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-0 shadow-sm">
        {toolbar}
        <InvoicesEmptyState
          className="rounded-none border-0"
          variant={isFiltered ? "no-match" : "no-data"}
          action={isFiltered ? undefined : emptyAction}
        />
        {footer}
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-0 shadow-sm">
      {toolbar}
      <div className="overflow-x-auto">
        <Table className="min-w-[800px]">
          <caption className="sr-only">Invoices. Activate a row to open the full statement.</caption>
          <TableHeader className="sticky top-0 border-b border-[var(--border-subtle)] bg-[var(--surface-container)] label-caps">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-[var(--cell-x)] font-semibold">Invoice ID</TableHead>
              <TableHead className="px-[var(--cell-x)] font-semibold">Billing Period</TableHead>
              <TableHead className="px-[var(--cell-x)] text-right font-semibold">Amount</TableHead>
              <TableHead className="px-[var(--cell-x)] text-center font-semibold">Status</TableHead>
              <TableHead className="px-[var(--cell-x)] text-right font-semibold">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="body-sm divide-y divide-[var(--border-subtle)]">
            {rows.map((inv) => (
              <ClickableRow
                key={inv.id}
                href={`/billing/${inv.id}`}
                label={`Open invoice ${inv.number}`}
                className={
                  inv.status === "OVERDUE"
                    ? "bg-[var(--failed-status)]/[0.04] hover:bg-[var(--failed-status)]/[0.07]"
                    : "hover:bg-[var(--surface-container-low)]"
                }
              >
                <TableCell className="px-[var(--cell-x)] py-[var(--cell-y)]">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-[var(--outline)]" aria-hidden="true">
                      receipt
                    </span>
                    <span className="data-mono font-medium text-[var(--primary)] group-hover:underline">
                      {inv.number}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="px-[var(--cell-x)] py-[var(--cell-y)] text-[var(--on-surface)]">
                  {inv.periodLabel}
                </TableCell>
                <TableCell className="px-[var(--cell-x)] py-[var(--cell-y)] text-right data-mono text-[var(--on-surface)]">
                  {formatMoney(inv.amount, inv.currency)}
                </TableCell>
                <TableCell className="px-[var(--cell-x)] py-[var(--cell-y)] text-center">
                  <InvoiceStatusPill status={inv.status} />
                </TableCell>
                <TableCell className="px-[var(--cell-x)] py-[var(--cell-y)]">
                  <div className="flex items-center justify-end gap-1">
                    <DownloadInvoiceButton invoiceId={inv.id} invoiceNumber={inv.number} iconOnly />
                    <InvoiceRowActions
                      id={inv.id}
                      number={inv.number}
                      status={inv.status}
                      periodStart={inv.periodStart}
                      periodEnd={inv.periodEnd}
                    />
                  </div>
                </TableCell>
              </ClickableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {footer}
    </Card>
  );
}

/** Escape hatch used by billing empty/error states. */
export function BackToBillingLink() {
  return (
    <Link href="/billing">
      <Button variant="outline" className="border-[var(--border-subtle)]">
        Back to billing
      </Button>
    </Link>
  );
}
