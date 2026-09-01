import { Link } from "@/i18n/navigation";
import { DataTable, DataTableContent, TableHeadCell, TableCellMono } from "@/components/layout/data-table";
import { ClickableRow } from "@/components/transactions/clickable-row";
import { RowActions } from "@/components/transactions/row-actions";
import { StatusPill } from "@/components/transactions/status-pill";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { CreateTransactionDialog } from "@/components/transactions/create-transaction-dialog";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Transaction } from "@/server/data/transactions";

// Shared ledger table. Rows are links to /[locale]/transactions/[id]; the empty
// state differs depending on whether the emptiness is caused by filters.
export function TransactionsTable({
  rows,
  variant = "full",
  isFiltered = false,
  footer,
  toolbar,
}: {
  rows: Transaction[];
  variant?: "full" | "compact";
  isFiltered?: boolean;
  footer?: React.ReactNode;
  toolbar?: React.ReactNode;
}) {
  const compact = variant === "compact";

  if (rows.length === 0) {
    return (
      <DataTable className="flex flex-col">
        {toolbar}
        <EmptyState
          className="border-0 rounded-none"
          icon={isFiltered ? "filter_alt_off" : "receipt_long"}
          title={isFiltered ? "No transactions match these filters" : "No transactions yet"}
          description={
            isFiltered
              ? "Try widening the date range or clearing the status and channel filters."
              : "Once a payment is processed it will appear here within seconds."
          }
          action={
            isFiltered ? (
              <Link href="/transactions">
                <Button variant="outline" className="border-[var(--border-subtle)]">
                  Clear filters
                </Button>
              </Link>
            ) : (
              <CreateTransactionDialog triggerLabel="Create your first transaction" />
            )
          }
        />
        {footer}
      </DataTable>
    );
  }

  return (
    <DataTable className="flex flex-col">
      {toolbar}
      <DataTableContent>
        <table className="w-full text-left border-collapse">
          <caption className="sr-only">
            Transactions. Activate a row to open its details page.
          </caption>
          <thead>
            <tr className="bg-[var(--surface-container-low)] border-b border-[var(--border-subtle)]">
              <TableHeadCell>Reference ID</TableHeadCell>
              <TableHeadCell>Date &amp; Time</TableHeadCell>
              {!compact ? <TableHeadCell>Method</TableHeadCell> : null}
              <TableHeadCell>Customer</TableHeadCell>
              <TableHeadCell className="text-right">Amount</TableHeadCell>
              <TableHeadCell className="text-right">Status</TableHeadCell>
              <TableHeadCell className="w-10" aria-label="Row actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)] body-sm">
            {rows.map((t) => (
              <ClickableRow
                key={t.id}
                href={`/transactions/${t.id}`}
                label={`Open transaction ${t.referenceId}`}
              >
                <TableCellMono className="text-[var(--on-surface)]">{t.referenceId}</TableCellMono>
                <td className="px-[var(--cell-x,16px)] py-[var(--cell-y,12px)] text-[var(--on-surface-variant)] whitespace-nowrap">
                  {formatDateTime(t.createdAt)}
                </td>
                {!compact ? (
                  <td className="px-[var(--cell-x,16px)] py-[var(--cell-y,12px)] text-[var(--on-surface)] whitespace-nowrap">
                    {t.methodLabel}
                  </td>
                ) : null}
                <td className="px-[var(--cell-x,16px)] py-[var(--cell-y,12px)] text-[var(--on-surface)] whitespace-nowrap">
                  <span className="block truncate max-w-[220px]">{t.customerName}</span>
                  <span className="block truncate max-w-[220px] text-xs text-[var(--on-surface-variant)]">
                    {t.customerEmail}
                  </span>
                </td>
                <TableCellMono className="text-right text-[var(--on-surface)]">
                  {formatMoney(t.amount, t.currency)}
                </TableCellMono>
                <td className="px-[var(--cell-x,16px)] py-[var(--cell-y,12px)] text-right">
                  <StatusPill status={t.status} />
                </td>
                <td className="px-[var(--cell-x,16px)] py-[var(--cell-y,12px)] text-right w-10">
                  <RowActions id={t.id} status={t.status} customerEmail={t.customerEmail} />
                </td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
      </DataTableContent>
      {footer}
    </DataTable>
  );
}
