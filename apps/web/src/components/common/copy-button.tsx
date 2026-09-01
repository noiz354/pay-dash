"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Copy-to-clipboard with an optimistic "copied" state + toast confirmation.
export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("h-7 gap-1.5 px-2 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success("Copied to clipboard", { description: value });
          setTimeout(() => setCopied(false), 1600);
        } catch {
          toast.error("Clipboard unavailable in this browser");
        }
      }}
      aria-label={`${label} ${value}`}
    >
      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
        {copied ? "check" : "content_copy"}
      </span>
      <span className="body-sm">{copied ? "Copied" : label}</span>
    </Button>
  );
}
