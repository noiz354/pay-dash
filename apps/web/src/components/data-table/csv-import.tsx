"use client";
import * as React from "react";
import { parseRecipientsCsv, RECIPIENT_CSV_TEMPLATE, type ParsedRecipients } from "@/lib/payout-csv";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// CSV import flow: select → validate → preview → submit → progress → result with failed.csv
export function CsvImport({
  onSubmit,
  submitting = false,
}: {
  onSubmit: (valid: ParsedRecipients["valid"]) => Promise<{ succeeded: number; failed: number; failedRows?: ParsedRecipients["invalid"] } | void>;
  submitting?: boolean;
}) {
  const [parsed, setParsed] = React.useState<ParsedRecipients | null>(null);
  const [result, setResult] = React.useState<{ succeeded: number; failed: number; failedRows?: ParsedRecipients["invalid"] } | null>(null);
  const [fileName, setFileName] = React.useState<string>("");

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    // Validate type/size
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setParsed({ valid: [], invalid: [{ line: 0, raw: f.name, reason: "File must be .csv" }], total: 0, totalAmount: 0 });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setParsed({ valid: [], invalid: [{ line: 0, raw: String(f.size), reason: "File too large — max 5MB" }], total: 0, totalAmount: 0 });
      return;
    }
    const text = await f.text();
    const p = parseRecipientsCsv(text);
    setParsed(p);
    setResult(null);
  };

  const downloadFailed = () => {
    if (!parsed?.invalid.length && !result?.failedRows?.length) return;
    const rows = result?.failedRows ?? parsed!.invalid;
    const header = "line,raw,reason";
    const body = rows.map((r) => `${r.line},"${r.raw.replace(/"/g, '""')}","${r.reason.replace(/"/g, '""')}"`).join("\n");
    const csv = `${header}\n${body}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "failed.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async () => {
    if (!parsed?.valid.length) return;
    const r = await onSubmit(parsed.valid);
    if (r) setResult(r);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 border-dashed">
        <label className="flex flex-col items-center gap-2 py-6 cursor-pointer">
          <span className="material-symbols-outlined text-[32px] text-[var(--on-surface-variant)]" aria-hidden>
            upload_file
          </span>
          <span className="text-sm font-medium">Select CSV file</span>
          <span className="text-xs text-[var(--on-surface-variant)]">name, bank, account_number, amount[, reference] — max 5MB</span>
          <input type="file" accept=".csv" onChange={onFile} className="hidden" aria-label="Select CSV file" />
          {fileName ? <span className="text-xs data-mono bg-[var(--surface-container-high)] px-2 py-1 rounded">{fileName}</span> : null}
        </label>
        <div className="flex gap-2 justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const blob = new Blob([RECIPIENT_CSV_TEMPLATE], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "template.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download template
          </Button>
        </div>
      </Card>

      {parsed ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-[var(--success-container)] text-[var(--on-success-container)] px-3 py-1">
              Valid: {parsed.valid.length}
            </span>
            <span className="rounded-full bg-[var(--error-container)] text-[var(--on-error-container)] px-3 py-1">Invalid: {parsed.invalid.length}</span>
            <span className="rounded-full bg-[var(--surface-container-high)] px-3 py-1">Total: {parsed.total}</span>
          </div>

          {parsed.valid.length > 0 ? (
            <div className="overflow-auto rounded border max-h-[200px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[var(--surface-container-low)]">
                  <tr>
                    <th className="px-2 py-1 text-left">Line</th>
                    <th className="px-2 py-1 text-left">Name</th>
                    <th className="px-2 py-1 text-left">Bank</th>
                    <th className="px-2 py-1 text-left">Account</th>
                    <th className="px-2 py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parsed.valid.slice(0, 20).map((r) => (
                    <tr key={r.line}>
                      <td className="px-2 py-1">{r.line}</td>
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1">{r.bank}</td>
                      <td className="px-2 py-1 data-mono">{r.accountNumber}</td>
                      <td className="px-2 py-1 text-right data-mono">{r.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.valid.length > 20 ? <div className="p-2 text-xs text-center text-[var(--on-surface-variant)]">+ {parsed.valid.length - 20} more valid rows</div> : null}
            </div>
          ) : null}

          {parsed.invalid.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-medium text-[var(--error)]">Invalid rows — will be preserved in failed.csv</div>
              <div className="overflow-auto rounded border border-[var(--error)]/30 max-h-[160px] bg-[var(--error-container)]/10">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[var(--error-container)]/20">
                    <tr>
                      <th className="px-2 py-1 text-left">Line</th>
                      <th className="px-2 py-1 text-left">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsed.invalid.slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1">{r.line}</td>
                        <td className="px-2 py-1">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" size="sm" onClick={downloadFailed} className="gap-1.5">
                <span className="material-symbols-outlined text-[16px]" aria-hidden>
                  download
                </span>
                Download failed.csv ({parsed.invalid.length} rows)
              </Button>
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={submitting || parsed.valid.length === 0} className="gap-1.5">
              {submitting ? "Submitting…" : `Submit ${parsed.valid.length} valid rows`}
            </Button>
            {parsed.invalid.length > 0 && parsed.valid.length > 0 ? <span className="text-xs self-center text-[var(--on-surface-variant)]">Invalid rows preserved — only valid will be submitted</span> : null}
          </div>

          {result ? (
            <Card className="p-4 bg-[var(--surface-container-low)] space-y-2">
              <div className="text-sm font-medium">Result</div>
              <div className="text-xs data-mono">
                Succeeded: {result.succeeded} · Failed: {result.failed}
              </div>
              {result.failed > 0 && result.failedRows ? (
                <Button variant="outline" size="sm" onClick={downloadFailed}>
                  Download failed.csv
                </Button>
              ) : null}
              <div className="text-xs text-[var(--on-surface-variant)]">Valid rows processed, invalid preserved for retry without redoing successes.</div>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
