"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Per-invoice statement download.
 * The prototype's `picture_as_pdf` button had no handler; this hits the real
 * export route with pending + success/error feedback. The generated statement
 * is a CSV (honest about what the sandbox can produce) with the same file name
 * shape a PDF would have.
 */
export function DownloadInvoiceButton({
  invoiceId,
  invoiceNumber,
  iconOnly = false,
  className,
}: {
  invoiceId: string;
  invoiceNumber: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const [isPending, setPending] = React.useState(false);

  const download = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPending(true);
    const toastId = toast.loading(`Preparing ${invoiceNumber}…`);
    try {
      const res = await fetch(`/api/exports/invoices/${encodeURIComponent(invoiceId)}`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoiceNumber}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Statement downloaded", { id: toastId, description: invoiceNumber });
    } catch {
      toast.error("Download failed", { id: toastId, description: "Please try again in a moment." });
    } finally {
      setPending(false);
    }
  };

  if (iconOnly) {
    return (
      <span data-row-interactive>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={download}
          disabled={isPending}
          aria-disabled={isPending}
          aria-label={`Download statement for ${invoiceNumber}`}
          title="Download statement"
          className={cn("h-8 w-8 text-[var(--primary)] hover:text-[var(--surface-tint)] disabled:opacity-50", className)}
        >
          {isPending ? (
            <Spinner className="size-4" />
          ) : (
            <span className="material-symbols-outlined" aria-hidden="true">
              picture_as_pdf
            </span>
          )}
        </Button>
      </span>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={download}
      disabled={isPending}
      aria-disabled={isPending}
      className={cn("gap-2 border-[var(--border-subtle)] disabled:opacity-60", className)}
    >
      {isPending ? (
        <Spinner className="size-4" />
      ) : (
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          download
        </span>
      )}
      {isPending ? "Preparing…" : "Download statement"}
    </Button>
  );
}
