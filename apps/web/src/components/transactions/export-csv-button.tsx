"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

// Export CSV — real download through /api/exports/transactions, honouring the
// filters currently in the URL. Shows pending + success/error feedback.
export function ExportCsvButton({
  label = "Export CSV",
  className,
  respectFilters = true,
  endpoint = "/api/exports/transactions",
  filePrefix = "transactions",
}: {
  label?: string;
  className?: string;
  respectFilters?: boolean;
  /** Any CSV endpoint; defaults to the transaction ledger export. */
  endpoint?: string;
  /** Downloaded file-name prefix, e.g. `customers-2026-09-01.csv`. */
  filePrefix?: string;
}) {
  const searchParams = useSearchParams();
  const [isPending, setPending] = React.useState(false);

  const download = async () => {
    setPending(true);
    const toastId = toast.loading("Preparing your export…");
    try {
      const qs = respectFilters ? searchParams.toString() : "";
      const res = await fetch(`${endpoint}${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Export ready", { id: toastId, description: "The CSV has been downloaded." });
    } catch {
      toast.error("Export failed", { id: toastId, description: "Please try again in a moment." });
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={download}
      disabled={isPending}
      aria-disabled={isPending}
      className={cn(
        "border-[var(--border-subtle)] bg-[var(--surface)] hover:bg-[var(--surface-container-low)] gap-2 disabled:opacity-60",
        className
      )}
    >
      {isPending ? <Spinner className="size-4" /> : (
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          download
        </span>
      )}
      {isPending ? "Preparing…" : label}
    </Button>
  );
}
