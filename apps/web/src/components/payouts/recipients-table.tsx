"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { RecipientStatusPill } from "@/components/payouts/recipient-status-pill";
import { EmptyState } from "@/components/common/empty-state";
import { retryRecipientAction } from "@/server/actions/payouts";
import { formatMoney, formatDateTime } from "@/lib/format";
import type { Recipient } from "@/server/data/payouts";

/**
 * Per-recipient outcome — the level of detail a payout operator actually needs
 * and the prototype never rendered. Failed rows explain themselves and can be
 * retried individually with a pending state on just that row.
 */
export function RecipientsTable({
  batchId,
  recipients,
  currency,
}: {
  batchId: string;
  recipients: Recipient[];
  currency: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = React.useState("");
  const [retrying, setRetrying] = React.useState<string | null>(null);

  const rows = React.useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return recipients;
    return recipients.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        r.accountNumber.includes(term) ||
        r.reference.toLowerCase().includes(term)
    );
  }, [filter, recipients]);

  const retry = async (recipientId: string) => {
    setRetrying(recipientId);
    const data = new FormData();
    data.set("batchId", batchId);
    data.set("recipientId", recipientId);
    const result = await retryRecipientAction(undefined, data);
    setRetrying(null);
    if (result.status === "success") toast.success(result.message);
    else toast.error(result.message);
    router.refresh();
  };

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface)]/50 px-6 py-4">
        <div>
          <h2 className="headline-md text-[var(--on-surface)]">Recipients</h2>
          <p className="body-sm text-[var(--on-surface-variant)]">
            {recipients.length} row{recipients.length === 1 ? "" : "s"} in this batch
          </p>
        </div>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name, account or reference"
          aria-label="Filter recipients"
          className="h-8 w-64 border-[var(--outline-variant)] bg-[var(--surface)]"
        />
      </div>

      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon="person_search"
            title={recipients.length ? "No recipients match that filter" : "This batch has no recipients"}
            description={
              recipients.length
                ? "Clear the filter to see every row."
                : "Add recipients before releasing the batch."
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left">
            <thead className="bg-[var(--surface-bright)]">
              <tr className="border-b border-[var(--border-subtle)]">
                <th scope="col" className="label-caps px-6 py-3 text-[var(--on-surface-variant)]">Recipient</th>
                <th scope="col" className="label-caps px-6 py-3 text-[var(--on-surface-variant)]">Account</th>
                <th scope="col" className="label-caps px-6 py-3 text-right text-[var(--on-surface-variant)]">Amount</th>
                <th scope="col" className="label-caps px-6 py-3 text-[var(--on-surface-variant)]">Status</th>
                <th scope="col" className="label-caps px-6 py-3 text-right text-[var(--on-surface-variant)]">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {rows.map((row) => (
                <tr key={row.id} data-testid={`recipient-row-${row.id}`}>
                  <td className="px-6 py-3">
                    <div className="label-md text-[var(--on-surface)]">{row.name}</div>
                    {row.reference ? (
                      <div className="body-sm text-xs text-[var(--on-surface-variant)]">{row.reference}</div>
                    ) : null}
                  </td>
                  <td className="data-mono px-6 py-3 text-xs text-[var(--on-surface-variant)]">
                    {row.bank} · {row.accountNumber}
                  </td>
                  <td className="data-mono px-6 py-3 text-right text-[var(--on-surface)]">
                    {formatMoney(row.amount, currency)}
                  </td>
                  <td className="px-6 py-3">
                    <RecipientStatusPill status={row.status} />
                    {row.failureReason ? (
                      <div className="body-sm mt-1 text-xs text-[var(--failed-status)]">{row.failureReason}</div>
                    ) : null}
                    {row.paidAt ? (
                      <div className="body-sm mt-1 text-xs text-[var(--on-surface-variant)]">
                        {formatDateTime(row.paidAt)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {row.status === "FAILED" || row.status === "RETURNED" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={retrying === row.id}
                        aria-label={`Retry ${row.name}`}
                        onClick={() => retry(row.id)}
                        className="h-8 border-[var(--border-subtle)]"
                      >
                        {retrying === row.id ? (
                          <span className="flex items-center gap-2">
                            <Spinner className="size-3.5" /> Retrying…
                          </span>
                        ) : (
                          "Retry"
                        )}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
