import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ClickableRow } from "@/components/transactions/clickable-row";
import { TablePagination } from "@/components/transactions/table-pagination";
import { LinkStatusPill } from "@/components/links/link-status-pill";
import { formatMoney, formatRelative, formatDateTime } from "@/lib/format";
import { LINK_KIND_LABELS } from "@/lib/link-status";
import type { LinkRow, PaymentLink } from "@/server/data/links";

interface LinksTableProps {
  rows: LinkRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  /** Active kind tab — drives the "no links yet" CTA. */
  kind: PaymentLink["kind"];
  hasFilters: boolean;
}

// Payment-link table. Every row is a ClickableRow to /payments/links/[id];
// the empty state differs by cause (filters vs. no links for this kind).
export function LinksTable({ rows, total, page, pageCount, pageSize, kind, hasFilters }: LinksTableProps) {
  if (rows.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={hasFilters ? "filter_alt_off" : "qr_code_2"}
          title={
            hasFilters
              ? "No links match these filters"
              : kind === "single"
                ? "No single-amount links yet"
                : "No multiple-item links yet"
          }
          description={
            hasFilters
              ? "Try a different search, or clear the status filter."
              : "Create a link and send it to a customer — every payment on it lands in your ledger with its own record."
          }
          action={
            hasFilters ? (
              <Link href={`/payments/links?kind=${kind}`}>
                <Button variant="outline" className="border-[var(--border-subtle)]">
                  Clear filters
                </Button>
              </Link>
            ) : (
              <Link href={`/payments/links?kind=${kind}&new=1`}>
                <Button className="bg-[var(--primary)] text-[var(--on-primary)]">
                  Create a {kind} link
                </Button>
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
        <table className="w-full min-w-[56rem] text-left">
          <caption className="sr-only">Payment links. Activate a row to open its details page.</caption>
          <thead className="bg-[var(--surface-bright)]">
            <tr className="border-b border-[var(--border-subtle)]">
              <th scope="col" className="label-caps w-1/4 px-4 py-3 text-[var(--on-surface-variant)]">
                Link
              </th>
              <th scope="col" className="label-caps w-1/6 px-4 py-3 text-[var(--on-surface-variant)]">
                Status
              </th>
              <th scope="col" className="label-caps w-1/4 px-4 py-3 text-[var(--on-surface-variant)]">
                Payer
              </th>
              <th scope="col" className="label-caps px-4 py-3 text-[var(--on-surface-variant)]">
                Items
              </th>
              <th scope="col" className="label-caps w-1/5 px-4 py-3 text-right text-[var(--on-surface-variant)]">
                Total (IDR)
              </th>
              <th scope="col" className="label-caps w-1/6 px-4 py-3 text-[var(--on-surface-variant)]">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)] body-sm">
            {rows.map((row) => (
              <ClickableRow
                key={row.id}
                href={`/payments/links/${row.id}`}
                label={`Open link ${row.id}`}
                data-testid={`link-row-${row.id}`}
              >
                <td className="px-4 py-3 align-top">
                  <div className="data-mono text-xs text-[var(--on-surface)] flex items-center gap-1.5">
                    {row.id}
                    <span className="material-symbols-outlined text-[14px] opacity-0 transition-opacity group-hover:opacity-100 text-[var(--on-surface-variant)]">
                      arrow_forward
                    </span>
                  </div>
                  <div className="body-sm text-[11px] text-[var(--on-surface-variant)]">
                    {LINK_KIND_LABELS[row.kind]}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <LinkStatusPill status={row.status} />
                </td>
                <td className="px-4 py-3 align-top text-[var(--on-surface-variant)] max-w-[220px] truncate">
                  {row.payerEmail ?? "—"}
                </td>
                <td className="px-4 py-3 align-top text-[var(--on-surface-variant)] max-w-[320px]">
                  <span className="block truncate" title={row.items.map((i) => i.label).join(", ")}>
                    {row.items.length === 1
                      ? row.items[0]?.label
                      : `${row.items.length} items — ${row.items.map((i) => i.label).join(", ")}`}
                  </span>
                </td>
                <td className="px-4 py-3 text-right data-mono align-top font-medium tabular-nums text-[var(--on-surface)]">
                  {formatMoney(row.total, "IDR")}
                </td>
                <td className="px-4 py-3 align-top text-[var(--on-surface-variant)] whitespace-nowrap">
                  <div>{formatDateTime(row.createdAt)}</div>
                  <div className="text-[11px]">{formatRelative(row.createdAt)}</div>
                </td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
      </div>
      {total > pageSize ? (
        <TablePagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} />
      ) : null}
    </div>
  );
}
