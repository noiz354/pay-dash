"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, formatNumber } from "@/lib/format";
import { rejectionsToCsv, type ParsedRecipients } from "@/lib/payout-csv";

/**
 * "23 valid, 2 invalid" before a single rupiah moves.
 * The prototype accepted a file (visually) and told you nothing. This shows the
 * parse result row by row, with the reason each rejected line failed and a
 * one-click export of just those lines so they can be fixed and re-uploaded.
 */
export function RecipientPreviewTable({
  parsed,
  currency = "IDR",
  fileName,
}: {
  parsed: ParsedRecipients;
  currency?: string;
  fileName?: string;
}) {
  const [tab, setTab] = React.useState<"valid" | "invalid">(parsed.valid.length ? "valid" : "invalid");

  const downloadRejections = () => {
    const blob = new Blob([rejectionsToCsv(parsed.invalid)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rejected-rows-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-[var(--border-subtle)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-bright)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-[var(--status-success-bg)] text-[var(--success-status)]">
            {formatNumber(parsed.valid.length)} valid
          </Badge>
          <Badge
            className={
              parsed.invalid.length
                ? "bg-[var(--status-error-bg)] text-[var(--failed-status)]"
                : "bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]"
            }
          >
            {formatNumber(parsed.invalid.length)} invalid
          </Badge>
          <span className="body-sm text-[var(--on-surface-variant)]">
            {fileName ? `${fileName} · ` : ""}Total {formatMoney(parsed.totalAmount, currency)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={tab === "valid" ? "default" : "outline"}
            size="sm"
            className="h-7"
            onClick={() => setTab("valid")}
          >
            Valid
          </Button>
          <Button
            type="button"
            variant={tab === "invalid" ? "default" : "outline"}
            size="sm"
            className="h-7"
            onClick={() => setTab("invalid")}
          >
            Rejected
          </Button>
          {parsed.invalid.length ? (
            <Button type="button" variant="ghost" size="sm" className="h-7" onClick={downloadRejections}>
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                download
              </span>
              Rejected rows
            </Button>
          ) : null}
        </div>
      </div>

      <div className="max-h-72 overflow-auto">
        {tab === "valid" ? (
          parsed.valid.length ? (
            <table className="w-full min-w-[36rem] text-left">
              <thead className="sticky top-0 bg-[var(--surface-container-low)]">
                <tr>
                  <th scope="col" className="label-caps px-4 py-2 text-[var(--on-surface-variant)]">Line</th>
                  <th scope="col" className="label-caps px-4 py-2 text-[var(--on-surface-variant)]">Recipient</th>
                  <th scope="col" className="label-caps px-4 py-2 text-[var(--on-surface-variant)]">Account</th>
                  <th scope="col" className="label-caps px-4 py-2 text-right text-[var(--on-surface-variant)]">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {parsed.valid.map((row) => (
                  <tr key={`${row.line}-${row.accountNumber}`}>
                    <td className="data-mono px-4 py-2 text-xs text-[var(--on-surface-variant)]">{row.line}</td>
                    <td className="body-sm px-4 py-2 text-[var(--on-surface)]">
                      {row.name}
                      {row.reference ? (
                        <span className="body-sm ml-2 text-xs text-[var(--on-surface-variant)]">{row.reference}</span>
                      ) : null}
                    </td>
                    <td className="data-mono px-4 py-2 text-xs text-[var(--on-surface-variant)]">
                      {row.bank} · {row.accountNumber}
                    </td>
                    <td className="data-mono px-4 py-2 text-right text-[var(--on-surface)]">
                      {formatMoney(row.amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="body-sm p-4 text-[var(--on-surface-variant)]">No valid rows in this file.</p>
          )
        ) : parsed.invalid.length ? (
          <table className="w-full min-w-[36rem] text-left">
            <thead className="sticky top-0 bg-[var(--surface-container-low)]">
              <tr>
                <th scope="col" className="label-caps px-4 py-2 text-[var(--on-surface-variant)]">Line</th>
                <th scope="col" className="label-caps px-4 py-2 text-[var(--on-surface-variant)]">Reason</th>
                <th scope="col" className="label-caps px-4 py-2 text-[var(--on-surface-variant)]">Row</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {parsed.invalid.map((row) => (
                <tr key={`${row.line}-${row.reason}`}>
                  <td className="data-mono px-4 py-2 text-xs text-[var(--failed-status)]">{row.line}</td>
                  <td className="body-sm px-4 py-2 text-[var(--on-surface)]">{row.reason}</td>
                  <td className="data-mono max-w-[18rem] truncate px-4 py-2 text-xs text-[var(--on-surface-variant)]">
                    {row.raw}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="body-sm p-4 text-[var(--on-surface-variant)]">Every row parsed cleanly.</p>
        )}
      </div>
    </div>
  );
}
