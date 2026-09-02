"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Switch } from "@/components/ui/switch";
import { updateDeveloperToggleAction } from "@/server/actions/settings";

// Optimistic developer toggle: flips instantly, persists via a Server Action,
// reverts with an error toast if the write fails.
export function DeveloperToggle({
  field,
  label,
  description,
  icon,
  enabled,
}: {
  field: "sandboxMode";
  label: string;
  description: string;
  icon: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = React.useState(enabled);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => setChecked(enabled), [enabled]);

  const commit = async (next: boolean) => {
    const previous = checked;
    setChecked(next);
    setBusy(true);
    const data = new FormData();
    data.set("field", field);
    if (next) data.set("enabled", "on");
    const result = await updateDeveloperToggleAction(undefined, data);
    setBusy(false);
    if (result.status === "success") {
      toast.success(result.message);
      router.refresh();
    } else {
      setChecked(previous);
      toast.error(result.message);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-[20px] text-[var(--on-surface-variant)]" aria-hidden="true">
          {icon}
        </span>
        <div>
          <p className="label-md text-[var(--on-surface)]">{label}</p>
          <p className="body-sm text-[var(--on-surface-variant)]">{description}</p>
        </div>
      </div>
      <Switch aria-label={label} checked={checked} disabled={busy} onCheckedChange={commit} />
    </div>
  );
}
