"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/common/copy-button";
import { Spinner } from "@/components/ui/spinner";
import { setMcpEnabledAction, rotateMcpTokenAction } from "@/server/actions/runtime";

export function McpServerControl({
  enabled,
  hasCustomToken,
  endpointUrl,
}: {
  enabled: boolean;
  hasCustomToken: boolean;
  endpointUrl: string;
}) {
  const router = useRouter();
  const [checked, setChecked] = React.useState(enabled);
  const [busy, setBusy] = React.useState(false);
  const [rotating, setRotating] = React.useState(false);
  const [newToken, setNewToken] = React.useState<string | null>(null);

  React.useEffect(() => setChecked(enabled), [enabled]);

  const commitEnabled = async (next: boolean) => {
    const previous = checked;
    setChecked(next);
    setBusy(true);
    const result = await setMcpEnabledAction(next);
    setBusy(false);
    if (result.status === "success") {
      toast.success(result.message);
      router.refresh();
    } else {
      setChecked(previous);
      toast.error(result.message);
    }
  };

  const rotate = async () => {
    setRotating(true);
    const result = await rotateMcpTokenAction();
    setRotating(false);
    if (result.status === "success" && result.data) {
      setNewToken(result.data.token);
      toast.success(result.message);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div className="divide-y divide-[var(--border-subtle)]">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-[20px] text-[var(--on-surface-variant)]" aria-hidden="true">
            dns
          </span>
          <div>
            <p className="label-md text-[var(--on-surface)]">Enable MCP server</p>
            <p className="body-sm text-[var(--on-surface-variant)]">
              Expose the tool server to connected AI clients.
            </p>
          </div>
        </div>
        <Switch aria-label="Enable MCP server" checked={checked} disabled={busy} onCheckedChange={commitEnabled} />
      </div>

      <div className="px-6 py-4">
        <p className="label-caps text-[11px] text-[var(--on-surface-variant)]">Endpoint</p>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <span className="data-mono text-sm text-[var(--on-surface)] break-all">{endpointUrl}</span>
          <CopyButton value={endpointUrl} label="Copy URL" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-[20px] text-[var(--on-surface-variant)]" aria-hidden="true">
            key
          </span>
          <div>
            <p className="label-md text-[var(--on-surface)]">Access token</p>
            <p className="body-sm text-[var(--on-surface-variant)]">
              {hasCustomToken ? (
                <span className="data-mono">••••••••</span>
              ) : (
                "Not configured"
              )}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rotating}
          className="h-8 border-[var(--border-subtle)]"
          onClick={rotate}
        >
          {rotating ? (
            <span className="flex items-center gap-2">
              <Spinner className="size-4" /> Generating…
            </span>
          ) : (
            "Generate new token"
          )}
        </Button>
      </div>

      {newToken ? (
        <div className="px-6 py-4">
          <div className="flex items-start gap-2 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4">
            <span className="material-symbols-outlined text-[18px] text-[var(--on-surface-variant)]" aria-hidden="true">
              warning
            </span>
            <div className="flex-1">
              <p className="body-sm text-[var(--on-surface-variant)]">
                This token is shown once — copy it now. The previous token is revoked.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="data-mono flex-1 truncate rounded bg-[var(--surface-container-high)] px-3 py-2 text-sm text-[var(--on-surface)]">
                  {newToken}
                </code>
                <CopyButton value={newToken} label="Copy" />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
