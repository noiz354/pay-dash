import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ClickableRow } from "@/components/transactions/clickable-row";
import { TablePagination } from "@/components/transactions/table-pagination";
import { MovementStatusPill } from "./movement-status-pill";
import { MOVEMENT_TYPE_ICONS } from "@/lib/balance-status";
import { formatMoney, formatRelative, formatDateTime } from "@/lib/format";
import type { Movement, PaginatedMovements } from "@/server/data/balance";

// The balance history the prototype faked with a 5-row const. Rows are
// derived from the ledger and the payout store (ADR-0011); rows that have a
// source record route to it — settlements to /transactions/[id], withdrawals
// to /payouts/[id]. Top-ups have no source record and stay plain rows.
function MovementCells({ movement: m }: { movement: Movement }) {
  const failed = m.status === "FAILED";
  return (
    <>
      <td className="px-4 py-3 align-top">
        <div className="body-sm text-[var(--on-surface)]">{formatDateTime(m.at)}</div>
        <div className="body-sm text-[11px] text-[var(--on-surface-variant)]">{formatRelative(m.at)}</div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]">
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
              {MOVEMENT_TYPE_ICONS[m.type]}
            </span>
          </div>
          <div className="min-w-0">
            <div className="label-md truncate text-[var(--on-surface)]" title={m.label}>
              {m.label}
            </div>
            <div className="body-sm truncate text-[11px] text-[var(--on-surface-variant)]" title={m.note}>
              {m.note ?? m.reference}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <MovementStatusPill status={m.status} />
      </td>
      <td
        className={`px-4 py-3 text-right data-mono align-top ${
          failed
            ? "text-[var(--on-surface-variant)] line-through"
            : m.amount > 0
              ? "text-[var(--success-status)]"
              : "text-[var(--on-surface)]"
        }`}
      >
        {m.amount > 0 ? "+" : "-"}
        {formatMoney(Math.abs(m.amount), m.currency)}
      </td>
    </>
  );
}

export function MovementsTable({ data }: { data: PaginatedMovements }) {
  if (data.rows.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={data.isFiltered ? "filter_alt_off" : "account_balance_wallet"}
          title={data.isFiltered ? "No movements match these filters" : "No balance movements yet"}
          description={
            data.isFiltered
              ? "Try a wider date range or clear the type filter."
              : "Top up your balance or capture a payment and it will show up here."
          }
          action={
            data.isFiltered ? (
              <Link href="/balance">
                <Button variant="outline" className="border-[var(--border-subtle)]">
                  Clear filters
                </Button>
              </Link>
            ) : (
              <Link href="/balance?topup=1">
                <Button className="bg-[var(--primary)] text-[var(--on-primary)]">Top up balance</Button>
              </Link>
            )
          }
        />
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left">
          <thead className="bg-[var(--surface-bright)]">
            <tr className="border-b border-[var(--border-subtle)]">
              <th scope="col" className="label-caps w-1/4 px-4 py-3 text-[var(--on-surface-variant)]">
                Date &amp; Time
              </th>
              <th scope="col" className="label-caps px-4 py-3 text-[var(--on-surface-variant)]">
                Description
              </th>
              <th scope="col" className="label-caps w-1/6 px-4 py-3 text-[var(--on-surface-variant)]">
                Status
              </th>
              <th scope="col" className="label-caps w-1/4 px-4 py-3 text-right text-[var(--on-surface-variant)]">
                Amount (IDR)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {data.rows.map((m) =>
              m.link ? (
                <ClickableRow
                  key={m.id}
                  href={m.link}
                  label={`Open ${m.label}`}
                  data-testid={`movement-row-${m.id}`}
                >
                  <MovementCells movement={m} />
                </ClickableRow>
              ) : (
                <tr key={m.id} data-testid={`movement-row-${m.id}`}>
                  <MovementCells movement={m} />
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
      {data.total > data.pageSize ? (
        <TablePagination
          page={data.page}
          pageCount={data.pageCount}
          total={data.total}
          pageSize={data.pageSize}
        />
      ) : null}
    </div>
  );
}
