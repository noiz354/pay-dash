"use client";

import * as React from "react";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ClickableRow } from "@/components/transactions/clickable-row";
import { CustomerAvatar } from "@/components/customers/customer-avatar";
import { CustomerStatusPill } from "@/components/customers/customer-status-pill";
import { CustomerRowActions } from "@/components/customers/customer-row-actions";
import { CustomerEmptyState } from "@/components/customers/customer-empty-state";
import { archiveCustomerAction } from "@/server/actions/customers";
import { formatDateLong, formatMoney } from "@/lib/format";
import type { Customer } from "@/server/data/customers";

/**
 * Customer directory table.
 * Keeps every affordance of the static prototype (select-all checkbox, avatar,
 * reference id, added date, status pill, right-aligned LTV, overflow button)
 * and gives each one a job: rows link to /[locale]/customers/[id], selection
 * drives a bulk action bar, and LTV is formatted currency instead of the
 * prefix-less ",520.00" string.
 */
export function CustomersTable({
  rows,
  isFiltered = false,
  toolbar,
  footer,
  emptyAction,
}: {
  rows: Customer[];
  isFiltered?: boolean;
  toolbar?: React.ReactNode;
  footer?: React.ReactNode;
  emptyAction?: React.ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [isPending, startTransition] = React.useTransition();

  // Drop selections for rows that no longer exist after a filter / page change.
  React.useEffect(() => {
    setSelected((prev) => prev.filter((id) => rows.some((r) => r.id === id)));
  }, [rows]);

  const allSelected = rows.length > 0 && selected.length === rows.length;
  const toggleAll = () => setSelected(allSelected ? [] : rows.map((r) => r.id));
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const archiveSelected = () => {
    startTransition(async () => {
      const results = await Promise.all(
        selected.map((id) => {
          const fd = new FormData();
          fd.set("id", id);
          return archiveCustomerAction(undefined, fd);
        })
      );
      const failed = results.filter((r) => r.status === "error").length;
      if (failed) toast.error(`${failed} of ${results.length} customers could not be archived`);
      else toast.success(`${results.length} customer${results.length === 1 ? "" : "s"} archived`);
      setSelected([]);
      router.refresh();
    });
  };

  const copySelectedEmails = async () => {
    const emails = rows.filter((r) => selected.includes(r.id)).map((r) => r.email);
    await navigator.clipboard.writeText(emails.join(", "));
    toast.success(`${emails.length} email${emails.length === 1 ? "" : "s"} copied`);
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] shadow-sm">
        {toolbar}
        <CustomerEmptyState
          className="rounded-none border-0"
          variant={isFiltered ? "no-match" : "no-data"}
          action={isFiltered ? undefined : emptyAction}
        />
        {footer}
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] shadow-sm">
      {toolbar}

      {selected.length > 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--primary)]/5 px-4 py-2"
          role="region"
          aria-label="Bulk actions"
        >
          <span className="body-sm text-[var(--on-surface)]">
            <span className="data-mono">{selected.length}</span> selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 border-[var(--border-subtle)]" onClick={copySelectedEmails}>
              Copy emails
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-[var(--border-subtle)]"
              disabled={isPending}
              aria-disabled={isPending}
              onClick={archiveSelected}
            >
              {isPending ? "Archiving…" : "Archive"}
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <Table className="w-full text-left">
          <caption className="sr-only">Customers. Activate a row to open the customer profile.</caption>
          <TableHeader className="sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--surface-container-low)]">
            <TableRow className="border-b-0 hover:bg-transparent">
              <TableHead scope="col" className="w-12 px-4 py-3 text-center label-caps font-semibold text-[var(--on-surface-variant)]">
                <Checkbox
                  aria-label="Select all customers"
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  className="border-[var(--outline-variant)] data-[state=checked]:border-[var(--primary)] data-[state=checked]:bg-[var(--primary)]"
                />
              </TableHead>
              <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Customer</TableHead>
              <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Reference ID</TableHead>
              <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Added</TableHead>
              <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Status</TableHead>
              <TableHead scope="col" className="px-4 py-3 text-right label-caps font-semibold text-[var(--on-surface-variant)]">LTV</TableHead>
              <TableHead scope="col" className="w-12 px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-[var(--border-subtle)] bg-[var(--surface-container-lowest)]">
            {rows.map((c) => (
              <ClickableRow
                key={c.id}
                href={`/customers/${c.id}`}
                label={`Open customer ${c.name}`}
                className="hover:bg-[var(--surface-canvas)]"
              >
                <TableCell className="px-4 py-3 text-center">
                  <span data-row-interactive>
                    <Checkbox
                      aria-label={`Select ${c.name}`}
                      checked={selected.includes(c.id)}
                      onCheckedChange={() => toggleOne(c.id)}
                      className="border-[var(--outline-variant)] opacity-50 group-hover:opacity-100 data-[state=checked]:border-[var(--primary)] data-[state=checked]:bg-[var(--primary)] data-[state=checked]:opacity-100"
                    />
                  </span>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <CustomerAvatar name={c.name} initials={c.initials} seed={c.email} />
                    <div className="min-w-0">
                      <div className="body-md truncate font-medium text-[var(--on-surface)]">{c.name}</div>
                      <div className="body-sm truncate text-[var(--on-surface-variant)]">{c.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <span className="data-mono text-[var(--on-surface-variant)]">{c.referenceId}</span>
                </TableCell>
                <TableCell className="px-4 py-3 body-sm whitespace-nowrap text-[var(--on-surface-variant)]">
                  {formatDateLong(c.createdAt)}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <CustomerStatusPill status={c.status} />
                </TableCell>
                <TableCell className="px-4 py-3 text-right data-mono text-[var(--on-surface)]">
                  {formatMoney(c.lifetimeValue, c.currency)}
                </TableCell>
                <TableCell className="px-4 py-3 text-right">
                  <CustomerRowActions id={c.id} name={c.name} email={c.email} status={c.status} />
                </TableCell>
              </ClickableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {footer}
    </div>
  );
}

/** Convenience link used by empty states elsewhere in the app. */
export function BackToCustomersLink() {
  return (
    <Link href="/customers">
      <Button variant="outline" className="border-[var(--border-subtle)]">
        Back to customers
      </Button>
    </Link>
  );
}
