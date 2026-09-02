import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ClickableRow } from "@/components/transactions/clickable-row";
import { TablePagination } from "@/components/transactions/table-pagination";
import { WebhookStatusPill } from "@/components/webhooks/webhook-status-pill";
import { formatDateTime, formatRelative } from "@/lib/format";
import { WEBHOOK_SOURCE_LABELS } from "@/lib/webhook-status";
import type { WebhookEvent } from "@/server/data/webhooks";

interface WebhooksTableProps {
  rows: WebhookEvent[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  hasFilters: boolean;
}

// Callback log table. Every row is a ClickableRow to /webhooks/[id] (the row
// id, not the event id — replays create new rows for the same event id).
export function WebhooksTable({ rows, total, page, pageCount, pageSize, hasFilters }: WebhooksTableProps) {
  if (rows.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={hasFilters ? "filter_alt_off" : "webhook"}
          title={hasFilters ? "No callbacks match these filters" : "No webhook callbacks yet"}
          description={
            hasFilters
              ? "Try a different search, or clear the status and event filters."
              : "Nothing has arrived at /api/webhooks/xendit yet. Simulate one in TEST MODE, or POST with your x-callback-token."
          }
          action={
            hasFilters ? (
              <Link href="/webhooks">
                <Button variant="outline" className="border-[var(--border-subtle)]">
                  Clear filters
                </Button>
              </Link>
            ) : (
              <Link href="/webhooks?simulate=1">
                <Button className="bg-[var(--primary)] text-[var(--on-primary)]">
                  Simulate a callback
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
        <table className="w-full min-w-[52rem] text-left">
          <caption className="sr-only">Webhook callbacks. Activate a row to open its details page.</caption>
          <thead className="bg-[var(--surface-bright)]">
            <tr className="border-b border-[var(--border-subtle)]">
              <th scope="col" className="label-caps w-1/5 px-4 py-3 text-[var(--on-surface-variant)]">
                Status
              </th>
              <th scope="col" className="label-caps px-4 py-3 text-[var(--on-surface-variant)]">
                Event
              </th>
              <th scope="col" className="label-caps w-1/6 px-4 py-3 text-[var(--on-surface-variant)]">
                Source
              </th>
              <th scope="col" className="label-caps w-1/4 px-4 py-3 text-right text-[var(--on-surface-variant)]">
                Received
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)] body-sm">
            {rows.map((e) => (
              <ClickableRow
                key={e.id}
                href={`/webhooks/${e.id}`}
                label={`Open callback ${e.eventId}`}
                data-testid={`webhook-row-${e.id}`}
              >
                <td className="px-4 py-3 align-top">
                  <WebhookStatusPill status={e.status} />
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="data-mono text-xs text-[var(--on-surface)] flex items-center gap-1.5">
                    {e.type}
                    {e.unhandled ? (
                      <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5 text-[10px] text-[var(--on-surface-variant)]">
                        unhandled
                      </span>
                    ) : null}
                    <span className="material-symbols-outlined text-[14px] opacity-0 transition-opacity group-hover:opacity-100 text-[var(--on-surface-variant)]">
                      arrow_forward
                    </span>
                  </div>
                  <div className="data-mono text-[11px] text-[var(--on-surface-variant)] mt-0.5 truncate max-w-[280px]" title={e.eventId}>
                    {e.eventId}
                  </div>
                </td>
                <td className="px-4 py-3 align-top text-[var(--on-surface-variant)]">
                  {WEBHOOK_SOURCE_LABELS[e.source]}
                </td>
                <td className="px-4 py-3 align-top text-right text-[var(--on-surface-variant)] whitespace-nowrap">
                  <div className="data-mono text-xs">{formatDateTime(e.receivedAt)}</div>
                  <div className="text-[11px]">{formatRelative(e.receivedAt)}</div>
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
