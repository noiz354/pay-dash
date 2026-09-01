"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { RecipientPreviewTable } from "@/components/payouts/recipient-preview-table";
import { parseRecipientsCsv, RECIPIENT_CSV_TEMPLATE, type ParsedRecipients } from "@/lib/payout-csv";
import { createBatchAction, type ActionState } from "@/server/actions/payouts";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type Created = { id: string; recipients: number; amount: number };
const initialState: ActionState<Created> = { status: "idle", message: "" };

function SubmitButton({ count, amount }: { count: number; amount: number }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || count === 0}
      aria-disabled={pending || count === 0}
      className="min-w-[14rem] bg-[var(--primary)] text-[var(--on-primary)] disabled:opacity-50"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Creating batch…
        </span>
      ) : count ? (
        `Create batch · ${count} recipients · ${formatMoney(amount)}`
      ) : (
        "Add recipients to continue"
      )}
    </Button>
  );
}

/**
 * The real upload flow.
 * Replaces a decorative dashed `<div>` with a keyboard-accessible drop target
 * backed by a file input, client-side parsing and validation, a preview table,
 * and a Server Action that re-parses the same text server-side. Nothing is
 * created until the operator sees exactly what will be paid.
 */
export function BatchUploadDropzone({ defaultName = "" }: { defaultName?: string }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [csv, setCsv] = React.useState("");
  const [fileName, setFileName] = React.useState<string | undefined>(undefined);
  const [dragging, setDragging] = React.useState(false);
  const [state, formAction] = useActionState(createBatchAction, initialState);
  const handled = React.useRef<ActionState<Created> | null>(null);

  const parsed: ParsedRecipients = React.useMemo(() => parseRecipientsCsv(csv), [csv]);

  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success" && state.data) {
      toast.success(state.message, {
        action: { label: "Open batch", onClick: () => router.push(`/payouts/${state.data!.id}`) },
      });
      setCsv("");
      setFileName(undefined);
      router.push(`/payouts/${state.data.id}`);
    } else if (state.status === "error" && !state.fieldErrors) {
      toast.error(state.message);
    }
  }, [state, router]);

  const readFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large", { description: "Keep recipient files under 2 MB." });
      return;
    }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    const result = parseRecipientsCsv(text);
    if (result.invalid.length) {
      toast.warning(`${result.valid.length} valid, ${result.invalid.length} rejected`, {
        description: "Review the rejected rows before creating the batch.",
      });
    } else {
      toast.success(`${result.valid.length} recipients parsed`, { description: file.name });
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([RECIPIENT_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payout-recipients-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded");
  };

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="csv" value={csv} />
      <input type="hidden" name="source" value={fileName ? "CSV upload" : "Manual"} />

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload recipient CSV"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) await readFile(file);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          dragging
            ? "border-[var(--primary)] bg-[var(--primary)]/5"
            : "border-[var(--outline-variant)] bg-[var(--surface-canvas)] hover:border-[var(--primary)] hover:bg-[var(--surface-container-low)]"
        )}
      >
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-container)]">
          <span className="material-symbols-outlined text-[var(--outline)]" aria-hidden="true">
            description
          </span>
        </span>
        <p className="body-sm text-[var(--on-surface)]">Drag &amp; drop a CSV file</p>
        <p className="label-caps text-[var(--outline)]">or click to browse</p>
        {fileName ? (
          <p className="body-sm mt-2 text-[var(--primary)]">{fileName}</p>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          aria-label="Recipient CSV file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await readFile(file);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" className="gap-1 border-[var(--border-subtle)]" onClick={downloadTemplate}>
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            download
          </span>
          Download template
        </Button>
        {csv ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setCsv("");
              setFileName(undefined);
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="csv-paste" className="label-caps text-[var(--on-surface-variant)]">
          …or paste rows directly
        </Label>
        <Textarea
          id="csv-paste"
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setFileName(undefined);
          }}
          rows={4}
          placeholder={"name,bank,account_number,amount,reference\nBudi Santoso,BCA,1234567890,250000,INV-1001"}
          className="data-mono border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-xs"
        />
        {state.fieldErrors?.csv ? (
          <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
            {state.fieldErrors.csv[0]}
          </p>
        ) : null}
      </div>

      {parsed.total > 0 ? (
        <RecipientPreviewTable parsed={parsed} fileName={fileName} />
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="batch-name" className="label-caps text-[var(--on-surface-variant)]">
            Batch name
          </Label>
          <Input
            id="batch-name"
            name="name"
            defaultValue={defaultName}
            placeholder="e.g. Vendor settlement — week 36"
            aria-invalid={Boolean(state.fieldErrors?.name)}
            className="h-9 border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]"
          />
          {state.fieldErrors?.name ? (
            <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
              {state.fieldErrors.name[0]}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="batch-schedule" className="label-caps text-[var(--on-surface-variant)]">
            Release date (optional)
          </Label>
          <Input
            id="batch-schedule"
            name="scheduledFor"
            type="date"
            className="h-9 border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]"
          />
          <p className="body-sm text-xs text-[var(--on-surface-variant)]">
            Leave empty to keep the batch as a draft you release manually.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
        <span className="body-sm text-[var(--on-surface-variant)]" role="status" aria-live="polite">
          {parsed.valid.length
            ? `${parsed.valid.length} recipients · ${formatMoney(parsed.totalAmount)}`
            : "No recipients yet"}
        </span>
        <SubmitButton count={parsed.valid.length} amount={parsed.totalAmount} />
      </div>
    </form>
  );
}
