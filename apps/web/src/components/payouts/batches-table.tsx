import * as React from "react";
import { ClickableRow } from "@/components/transactions/clickable-row";
import { TablePagination } from "@/components/transactions/table-pagination";
import { PayoutStatusPill } from "@/components/payouts/payout-status-pill";
import { BatchRowActions } from "@/components/payouts/batch-row-actions";
import { BatchesEmptyState } from "@/components/payouts/batches-empty-state";
import { formatDateLong, formatMoney, formatNumber } from "@/lib/format";
import type { PaginatedBatches } from "@/server/data/payouts";

/**
 * The payout history table the app never had.
 * Rows route to `/payouts/[id]`, progress is shown as paid/total, and the
 * empty state distinguishes "no batches yet" from "no matches for this filter".
 */
export function BatchesTable({ data }: { data: PaginatedBatches }) {
  if (data.rows.length === 0) {
    return <BatchesEmptyState isFiltered={data.isFiltered} />;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left">
          <thead className="bg-[var(--surface-bright)]">
            <tr className="border-b border-[var(--border-subtle)]">
              <th scope="col" className="label-caps px-4 py-3 text-[var(--on-surface-variant)]">Batch</th>
              <th scope="col" className="label-caps px-4 py-3 text-[var(--on-surface-variant)]">Status</th>
              <th scope="col" className="label-caps px-4 py-3 text-[var(--on-surface-variant)]">Recipients</th>
              <th scope="col" className="label-caps px-4 py-3 text-right text-[var(--on-surface-variant)]">Amount</th>
              <th scope="col" className="label-caps px-4 py-3 text-[var(--on-surface-variant)]">Created</th>
              <th scope="col" className="label-caps px-4 py-3 text-right text-[var(--on-surface-variant)]">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {data.rows.map((batch) => (
              <ClickableRow
                key={batch.id}
                href={`/payouts/${batch.id}`}
                label={`Open ${batch.name}`}
                data-testid={`batch-row-${batch.id}`}
              >
                <td className="px-4 py-3">
                  <div className="label-md text-[var(--on-surface)]">{batch.name}</div>
                  <div className="body-sm data-mono text-xs text-[var(--on-surface-variant)]">
                    {batch.id} · {batch.source}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <PayoutStatusPill status={batch.status} />
                  {batch.failedCount > 0 ? (
                    <div className="body-sm mt-1 text-xs text-[var(--failed-status)]">
                      {batch.failedCount} need attention
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="body-sm data-mono text-[var(--on-surface)]">
                    {formatNumber(batch.paidCount)} / {formatNumber(batch.recipientCount)}
                  </div>
                  <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-[var(--surface-container-high)]">
                    <div
                      className="h-full rounded-full bg-[var(--success-status)]"
                      style={{
                        width: `${
                          batch.recipientCount ? Math.round((batch.paidCount / batch.recipientCount) * 100) : 0
                        }%`,
                      }}
                    />
                  </div>
                </td>
                <td className="data-mono px-4 py-3 text-right text-[var(--on-surface)]">
                  {formatMoney(batch.totalAmount, batch.currency)}
                </td>
                <td className="body-sm px-4 py-3 text-[var(--on-surface-variant)]">
                  {formatDateLong(batch.createdAt)}
                  {batch.scheduledFor ? (
                    <div className="text-xs">Releases {formatDateLong(batch.scheduledFor)}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right">
                  <BatchRowActions id={batch.id} name={batch.name} status={batch.status} />
                </td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={data.page}
        pageCount={data.pageCount}
        total={data.total}
        pageSize={data.pageSize}
      />
    </div>
  );
}
