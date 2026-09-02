"use client";

import * as React from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import type { Transaction } from "@/server/data/transactions";
import type { PayoutBatch } from "@/server/data/payouts";
import type { Customer } from "@/server/data/customers";
import {
  buildReportCsv,
  columnsFor,
  customersToReportRows,
  CUSTOMER_COLUMNS,
  CUSTOMER_STATUS_OPTIONS,
  defaultSelection,
  payoutsToReportRows,
  PAYOUT_COLUMNS,
  PAYOUT_STATUS_OPTIONS,
  parseAmountFilter,
  ReportSource,
  ReportTone,
  runQuery,
  statusTone,
  transactionsToReportRows,
  TX_COLUMNS,
  TX_STATUS_OPTIONS,
} from "@/lib/report-options";

// The real builder (ADR-0020): every control runs a query over the app's own
// rows and the CSV export downloads exactly what the preview shows.

const SOURCES: { value: ReportSource; label: string; icon: string }[] = [
  { value: "transactions", label: "Transactions", icon: "sync_alt" },
  { value: "payouts", label: "Payouts", icon: "account_balance_wallet" },
  { value: "customers", label: "Customers", icon: "group" },
];

const TONE_CHIP: Record<ReportTone, string> = {
  success: "bg-[var(--status-success-bg)] text-[var(--success-status)] border-[var(--success-status)]/20",
  pending:
    "bg-[var(--pending-status)]/10 text-[var(--pending-status)] border-[var(--pending-status)]/20",
  failed: "bg-[var(--status-error-bg)] text-[var(--failed-status)] border-[var(--failed-status)]/20",
  neutral:
    "bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] border-[var(--outline-variant)]",
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ReportBuilder({
  transactions,
  batches,
  customers,
}: {
  transactions: Transaction[];
  batches: PayoutBatch[];
  customers: Customer[];
}) {
  const [source, setSource] = React.useState<ReportSource>("transactions");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [amountMin, setAmountMin] = React.useState("");
  const [amountMax, setAmountMax] = React.useState("");
  const [selection, setSelection] = React.useState<Record<string, boolean>>(
    defaultSelection(TX_COLUMNS)
  );

  const rowsBySource = React.useMemo(
    () => ({
      transactions: transactionsToReportRows(transactions),
      payouts: payoutsToReportRows(batches),
      customers: customersToReportRows(customers),
    }),
    [transactions, batches, customers]
  );

  const dataset = React.useMemo(() => {
    const base = { rows: rowsBySource[source] };
    return {
      ...base,
      source,
      columns:
        source === "transactions"
          ? TX_COLUMNS
          : source === "payouts"
            ? PAYOUT_COLUMNS
            : CUSTOMER_COLUMNS,
      statusOptions:
        source === "transactions"
          ? TX_STATUS_OPTIONS
          : source === "payouts"
            ? PAYOUT_STATUS_OPTIONS
            : CUSTOMER_STATUS_OPTIONS,
      amountLabel:
        source === "transactions"
          ? "Amount"
          : source === "payouts"
            ? "Batch total"
            : "Lifetime value",
    };
  }, [source, rowsBySource]);

  const filtered = React.useMemo(
    () =>
      runQuery(dataset, {
        from,
        to,
        status,
        amountMin: parseAmountFilter(amountMin),
        amountMax: parseAmountFilter(amountMax),
      }),
    [dataset, from, to, status, amountMin, amountMax]
  );

  const cols = React.useMemo(() => columnsFor(dataset, selection), [dataset, selection]);

  const switchSource = (next: ReportSource) => {
    setSource(next);
    const colsForNext =
      next === "transactions" ? TX_COLUMNS : next === "payouts" ? PAYOUT_COLUMNS : CUSTOMER_COLUMNS;
    setSelection(defaultSelection(colsForNext));
    setStatus("");
  };

  const clearFilters = () => {
    setFrom("");
    setTo("");
    setStatus("");
    setAmountMin("");
    setAmountMax("");
  };

  const reset = () => {
    clearFilters();
    setSelection(defaultSelection(dataset.columns));
  };

  const applyPreset = (preset: "7d" | "30d" | "ytd") => {
    const now = new Date();
    const fromDate =
      preset === "ytd"
        ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
        : new Date(now.getTime() - (preset === "7d" ? 7 : 30) * 86_400_000);
    setFrom(isoDate(fromDate));
    setTo(isoDate(now));
  };

  const exportCsv = () => {
    const csv = buildReportCsv(dataset, filtered, selection);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kinetic-${source}-${isoDate(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 border border-[var(--outline-variant)] rounded-xl overflow-hidden bg-[var(--surface-container-lowest)] shadow-sm lg:min-h-[640px]">
      {/* Config — every control runs a real query over the app's own rows */}
      <section className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] flex flex-col shrink-0 lg:overflow-y-auto">
        <div className="p-6 space-y-8 flex-1">
          {/* Data Source */}
          <div className="space-y-3">
            <Label className="label-caps text-[var(--on-surface)] flex items-center gap-2">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                dataset
              </span>
              Data Source
            </Label>
            <RadioGroup
              value={source}
              onValueChange={(v) => switchSource(v as ReportSource)}
              className="space-y-2"
            >
              {SOURCES.map((s) => (
                <Label
                  key={s.value}
                  className="flex items-center gap-2 p-2 rounded-lg border border-[var(--outline-variant)] hover:bg-[var(--surface-container-low)] cursor-pointer has-[[data-checked]]:border-[var(--primary)] has-[[data-checked]]:bg-[var(--primary-fixed)]/20"
                >
                  <RadioGroupItem value={s.value} id={`ds-${s.value}`} />
                  <span className="material-symbols-outlined text-[var(--primary)]" style={{ fontSize: 16 }}>
                    {s.icon}
                  </span>
                  <span className="body-sm font-medium">{s.label}</span>
                </Label>
              ))}
            </RadioGroup>
            <p className="body-sm text-xs text-[var(--on-surface-variant)]">
              Disputes have no separate model in this app — refund facts live in the transaction
              ledger (status REFUNDED).
            </p>
          </div>

          {/* Date Range */}
          <div className="space-y-3">
            <Label className="label-caps text-[var(--on-surface)] flex items-center gap-2">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                calendar_today
              </span>
              Date Range
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="body-sm text-[var(--on-surface-variant)] block mb-1">Start</span>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-9"
                  aria-label="Start date"
                />
              </div>
              <div>
                <span className="body-sm text-[var(--on-surface-variant)] block mb-1">End</span>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-9"
                  aria-label="End date"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => applyPreset("7d")}>
                7D
              </Button>
              <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => applyPreset("30d")}>
                30D
              </Button>
              <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => applyPreset("ytd")}>
                YTD
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="space-y-3">
            <Label className="label-caps text-[var(--on-surface)]">Filters</Label>
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label htmlFor="report-status" className="body-sm text-[var(--on-surface-variant)]">
                  Status
                </Label>
                <NativeSelect
                  id="report-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]"
                >
                  <NativeSelectOption value="">Any status</NativeSelectOption>
                  {dataset.statusOptions.map((o) => (
                    <NativeSelectOption key={o.value} value={o.value}>
                      {o.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="report-amount-min" className="body-sm text-[var(--on-surface-variant)]">
                    {dataset.amountLabel} min
                  </Label>
                  <Input
                    id="report-amount-min"
                    type="number"
                    min="0"
                    value={amountMin}
                    onChange={(e) => setAmountMin(e.target.value)}
                    className="h-8 data-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="report-amount-max" className="body-sm text-[var(--on-surface-variant)]">
                    Max
                  </Label>
                  <Input
                    id="report-amount-max"
                    type="number"
                    min="0"
                    value={amountMax}
                    onChange={(e) => setAmountMax(e.target.value)}
                    className="h-8 data-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Columns */}
          <div className="space-y-3">
            <Label className="label-caps text-[var(--on-surface)] flex items-center gap-2">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                view_column
              </span>
              Columns
            </Label>
            <div className="space-y-1">
              {dataset.columns.map((c) => (
                <Label
                  key={c.key}
                  className="flex items-center gap-2 p-1.5 hover:bg-[var(--surface-container-low)] rounded cursor-pointer font-normal"
                >
                  <Checkbox
                    checked={selection[c.key]}
                    onCheckedChange={(checked) =>
                      setSelection((prev) => ({ ...prev, [c.key]: checked === true }))
                    }
                    aria-label={c.label}
                  />
                  <span className="body-sm">{c.label}</span>
                </Label>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-[var(--outline-variant)] flex gap-3">
          <Button variant="outline" className="flex-1 h-9" onClick={reset}>
            Reset
          </Button>
        </div>
      </section>

      {/* Preview — the filtered rows, exactly as they would export */}
      <section className="flex-1 flex flex-col overflow-hidden bg-[var(--surface-canvas)] min-h-[480px]">
        <div className="h-16 border-b border-[var(--outline-variant)] bg-[var(--surface)] flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <span className="headline-md font-semibold">Preview</span>
            <span className="body-sm text-[var(--on-surface-variant)] bg-[var(--surface-container-low)] px-2 py-0.5 rounded border border-[var(--outline-variant)]">
              {filtered.length} of {dataset.rows.length} rows
            </span>
          </div>
          <Button
            className="h-9 gap-2 bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)]"
            onClick={exportCsv}
            disabled={filtered.length === 0}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              download
            </span>
            Export CSV
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <Card className="overflow-hidden border-[var(--border-subtle)]">
            {filtered.length === 0 ? (
              <div className="p-10">
                <EmptyState
                  icon="filter_alt_off"
                  title="No rows match these filters"
                  description="Widen the date range or clear the status and amount filters."
                  action={
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  }
                />
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader className="bg-[var(--surface-container-low)] sticky top-0">
                    <TableRow>
                      {cols.map((c) => (
                        <TableHead
                          key={c.key}
                          className={`label-caps text-[var(--on-surface-variant)] ${c.align === "right" ? "text-right" : ""}`}
                        >
                          {c.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((row) => (
                      <TableRow key={row.id} className="hover:bg-[var(--surface-container)]/30">
                        {cols.map((c) => {
                          const v = row.values[c.key];
                          const isIdCell = c.key === "reference_id" || c.key === "batch" || c.key === "name";
                          return (
                            <TableCell
                              key={c.key}
                              className={`body-sm ${c.align === "right" ? "text-right" : ""} ${c.key === "status" ? "" : "text-[var(--on-surface)]"}`}
                            >
                              {c.key === "status" ? (
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full border body-sm ${TONE_CHIP[statusTone(dataset.source, row.status)]}`}
                                >
                                  {v?.display}
                                </span>
                              ) : isIdCell && row.href ? (
                                <Link
                                  href={row.href}
                                  className={`data-mono text-[var(--primary)] hover:underline ${row.id.length > 20 ? "break-all" : ""}`}
                                >
                                  {v?.display}
                                </Link>
                              ) : (
                                <span className={isIdCell ? "data-mono" : c.align === "right" ? "data-mono" : ""}>
                                  {v?.display}
                                </span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="border-t border-[var(--outline-variant)] px-4 py-2">
                  <span className="body-sm text-[var(--on-surface-variant)]">
                    The CSV export contains exactly these rows and columns.
                  </span>
                </div>
              </>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}
