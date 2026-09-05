"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { setXenditEnabledAction, testXenditConnectionAction } from "@/server/actions/runtime";

export function McpXenditControl({
  enabled,
  keyConfigured,
}: {
  enabled: boolean;
  keyConfigured: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = React.useState(enabled);
  const [busy, setBusy] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<string | null>(null);

  React.useEffect(() => setChecked(enabled), [enabled]);

  const commitEnabled = async (next: boolean) => {
    const previous = checked;
    setChecked(next);
    setBusy(true);
    const result = await setXenditEnabledAction(next);
    setBusy(false);
    if (result.status === "success") {
      toast.success(result.message);
      router.refresh();
    } else {
      setChecked(previous);
      toast.error(result.message);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testXenditConnectionAction();
    setTesting(false);
    if (result.status === "success") {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
    if (result.data) setTestResult(result.data.detail);
  };

  return (
    <div className="divide-y divide-[var(--border-subtle)]">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-[20px] text-[var(--on-surface-variant)]" aria-hidden="true">
            payments
          </span>
          <div>
            <p className="label-md text-[var(--on-surface)]">Enable live Xendit calls</p>
            <p className="body-sm text-[var(--on-surface-variant)]">
              Allow the MCP server to make real payment requests to Xendit.
            </p>
          </div>
        </div>
        <Switch
          aria-label="Enable live Xendit calls"
          checked={checked}
          disabled={busy}
          onCheckedChange={commitEnabled}
        />
      </div>

      <div className="px-6 py-4">
        <p className="label-caps text-[11px] text-[var(--on-surface-variant)]">Connection status</p>
        <div className="mt-1.5 flex items-start gap-3">
          <span
            className={
              "label-caps inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] " +
              (keyConfigured
                ? "border-[var(--success-status)]/20 bg-[var(--status-success-bg)] text-[var(--success-status)]"
                : "border-[var(--pending-status)]/20 bg-[var(--pending-status)]/10 text-[var(--pending-status)]")
            }
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
              {keyConfigured ? "verified_user" : "warning"}
            </span>
            {keyConfigured ? "Secret key configured" : "No secret key set"}
          </span>
          <span className="label-caps inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-container-low)] px-2.5 py-1 text-[10px] text-[var(--on-surface-variant)]">
            Mode TEST
          </span>
        </div>
        <p className="body-sm mt-2 text-xs text-[var(--on-surface-variant)]">
          Calls run in test mode and never move real money. The secret value is never shown here.
        </p>
      </div>

      <div className="px-6 py-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 border-[var(--border-subtle)]"
          disabled={testing}
          onClick={runTest}
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            wifi_tethering
          </span>
          {testing ? "Testing…" : "Test Connection"}
        </Button>
        {testResult ? (
          <p className="body-sm mt-2 text-xs text-[var(--on-surface-variant)]">{testResult}</p>
        ) : (
          <p className="body-sm mt-2 text-xs text-[var(--on-surface-variant)]">
            Verify connectivity against the Xendit sandbox before going live.
          </p>
        )}
      </div>
    </div>
  );
}
