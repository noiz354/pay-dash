"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { setDataSourceAction } from "@/server/actions/runtime";
import type { DataSource } from "@/server/settings/runtime-settings";

const DATA_SOURCE_OPTIONS: { value: DataSource; label: string; description: string }[] = [
  {
    value: "memory",
    label: "In-memory demo store",
    description: "Ephemeral data that resets on restart — ideal for demos.",
  },
  {
    value: "postgres",
    label: "PostgreSQL / Cloud SQL",
    description: "Persistent store backed by the production database.",
  },
];

export function McpDataSourceControl({ value }: { value: DataSource }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const commit = async (next: string) => {
    if (next === value || busy) return;
    setBusy(true);
    const result = await setDataSourceAction(next);
    setBusy(false);
    if (result.status === "success") {
      toast.success(result.message);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div className="px-6 py-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="material-symbols-outlined text-[20px] text-[var(--on-surface-variant)]" aria-hidden="true">
          storage
        </span>
        <div>
          <p className="label-md text-[var(--on-surface)]">Data source</p>
          <p className="body-sm text-[var(--on-surface-variant)]">
            Where the MCP server reads and writes its working data.
          </p>
        </div>
      </div>

      <RadioGroup
        value={value}
        onValueChange={commit}
        disabled={busy}
        className="space-y-2 pl-9"
      >
        {DATA_SOURCE_OPTIONS.map((option) => (
          <Label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--outline-variant)] p-3 hover:bg-[var(--surface-container-low)] has-[[data-checked]]:border-[var(--primary)] has-[[data-checked]]:bg-[var(--primary-fixed)]/20"
          >
            <RadioGroupItem value={option.value} id={`ds-${option.value}`} />
            <span>
              <span className="body-sm font-medium text-[var(--on-surface)]">{option.label}</span>
              <span className="body-sm block text-xs text-[var(--on-surface-variant)]">
                {option.description}
              </span>
            </span>
          </Label>
        ))}
      </RadioGroup>

      <p className="body-sm mt-3 pl-9 text-xs text-[var(--on-surface-variant)]">
        Takes effect immediately — no redeploy needed. Current effective source:{" "}
        <span className="data-mono text-[var(--on-surface)]">
          {DATA_SOURCE_OPTIONS.find((o) => o.value === value)?.label ?? value}
        </span>
      </p>
    </div>
  );
}
