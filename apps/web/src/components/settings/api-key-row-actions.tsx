"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { SecretReveal } from "@/components/settings/secret-reveal";
import { revokeApiKeyAction, rollApiKeyAction } from "@/server/actions/settings";
import type { KeyStatus } from "@/lib/settings-options";

type Mode = "revoke" | "roll" | null;

/**
 * Row menu for a secret key. The prototype rendered a `more_vert` icon with no
 * menu behind it; every destructive path here is confirmed, pending-aware and
 * ends in a toast, and rolling surfaces the replacement secret exactly once.
 */
export function ApiKeyRowActions({
  id,
  name,
  status,
  maskedSecret,
}: {
  id: string;
  name: string;
  status: KeyStatus;
  maskedSecret: string;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>(null);
  const [confirmed, setConfirmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [rolledSecret, setRolledSecret] = React.useState<string | null>(null);

  const close = () => {
    setMode(null);
    setConfirmed(false);
    setRolledSecret(null);
  };

  const submit = async () => {
    if (!mode || !confirmed) return;
    setBusy(true);
    const data = new FormData();
    data.set("id", id);
    data.set("confirm", "on");
    const result =
      mode === "revoke" ? await revokeApiKeyAction(undefined, data) : await rollApiKeyAction(undefined, data);
    setBusy(false);
    if (result.status === "success") {
      toast.success(result.message);
      router.refresh();
      if (mode === "roll" && "data" in result && result.data) {
        setRolledSecret(result.data.secret);
        setConfirmed(false);
        return;
      }
      close();
    } else {
      toast.error(result.message);
    }
  };

  const revoked = status === "REVOKED";

  return (
    <div data-row-interactive>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex rounded p-1 text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)]"
          aria-label={`More actions for ${name}`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">
            more_vert
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={async () => {
              await navigator.clipboard.writeText(maskedSecret);
              toast.success("Masked key copied", {
                description: "Full secrets are only shown at creation time.",
              });
            }}
          >
            Copy masked key
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={async () => {
              await navigator.clipboard.writeText(id);
              toast.success("Key ID copied", { description: id });
            }}
          >
            Copy key ID
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={revoked} onClick={() => setMode("roll")}>
            Roll key…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={revoked} onClick={() => setMode("revoke")}>
            Revoke key…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={mode !== null} onOpenChange={(next: boolean) => (next ? null : close())}>
        <DialogContent className="bg-[var(--surface)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="headline-md text-[var(--on-surface)]">
              {rolledSecret ? `${name} rolled` : mode === "roll" ? `Roll ${name}?` : `Revoke ${name}?`}
            </DialogTitle>
            <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
              {rolledSecret
                ? "The previous secret is revoked. Copy the replacement now."
                : mode === "roll"
                  ? "A replacement key with the same scopes is issued and this secret stops working immediately."
                  : "Any integration using this key starts failing immediately. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>

          {rolledSecret ? (
            <SecretReveal secret={rolledSecret} onAcknowledge={close} />
          ) : (
            <>
              <div className="flex items-start gap-2">
                <Checkbox
                  id={`confirm-${id}`}
                  checked={confirmed}
                  onCheckedChange={(checked: boolean) => setConfirmed(Boolean(checked))}
                  className="mt-0.5"
                />
                <Label htmlFor={`confirm-${id}`} className="body-sm font-normal text-[var(--on-surface-variant)]">
                  I understand traffic using <span className="data-mono">{maskedSecret}</span> will stop working.
                </Label>
              </div>
              <DialogFooter className="pt-2">
                <DialogClose
                  render={
                    <Button type="button" variant="outline" className="border-[var(--border-subtle)]">
                      Cancel
                    </Button>
                  }
                />
                <Button
                  type="button"
                  disabled={!confirmed || busy}
                  aria-disabled={!confirmed || busy}
                  onClick={submit}
                  className="min-w-[9rem] bg-[var(--failed-status,#b3261e)] text-white disabled:opacity-60"
                >
                  {busy ? (
                    <span className="flex items-center gap-2">
                      <Spinner className="size-4" /> Working…
                    </span>
                  ) : mode === "roll" ? (
                    "Roll key"
                  ) : (
                    "Revoke key"
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
