"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { CopyButton } from "@/components/common/copy-button";
import { simulateWebhookAction, type ActionState } from "@/server/actions/webhooks";
import { SIMULATABLE_WEBHOOK_EVENTS, KNOWN_WEBHOOK_EVENTS } from "@/lib/webhook-status";
import { cn } from "@/lib/utils";

const initialState: ActionState<{ id: string; eventId: string; deduped: boolean }> = {
  status: "idle",
  message: "",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] disabled:opacity-60 min-w-[9.5rem]"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Recording…
        </span>
      ) : (
        "Send callback"
      )}
    </Button>
  );
}

// TEST MODE simulator (ADR-0014). Stands in for the provider and POSTs a
// callback through the same recordInbound pipeline the route uses — so a
// simulated callback appears in the log exactly as a real one would.
// `invoice.issued` is deliberately an unhandled type.
export function SimulateWebhookDialog({
  defaultOpen = false,
  triggerLabel = "Simulate callback",
}: {
  defaultOpen?: boolean;
  triggerLabel?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [state, formAction] = useActionState(simulateWebhookAction, initialState);
  const [createdId, setCreatedId] = React.useState<string | null>(null);
  const [createdEventId, setCreatedEventId] = React.useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const removeSimParam = React.useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has("simulate")) return;
    params.delete("simulate");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const onOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) removeSimParam();
    },
    [removeSimParam]
  );

  const handled = React.useRef<ActionState<{ id: string; eventId: string; deduped: boolean }> | null>(null);
  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success" && state.data) {
      setCreatedId(state.data.id);
      setCreatedEventId(state.data.eventId);
      router.refresh();
    }
  }, [state, router]);

  const goToEvent = (id: string) => {
    onOpenChange(false);
    router.push(`/webhooks/${id}`);
  };

  const resetForAnother = () => {
    setCreatedId(null);
    setCreatedEventId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] flex items-center gap-2 whitespace-nowrap">
            <span className="material-symbols-outlined text-[18px] shrink-0" aria-hidden="true">
              send
            </span>
            <span>{triggerLabel}</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg bg-[var(--surface)]">
        {createdId && createdEventId ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="headline-md text-[var(--on-surface)]">Callback recorded</DialogTitle>
              <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
                The event went through the same pipeline the endpoint uses — dedupe and all.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-low)] p-4 space-y-3">
              <div>
                <div className="label-caps text-[11px] text-[var(--on-surface-variant)]">Event id</div>
                <div className="flex items-center gap-2">
                  <div className="data-mono text-sm text-[var(--on-surface)]">{createdEventId}</div>
                  <CopyButton value={createdEventId} label="Copy" />
                </div>
              </div>
              <div>
                <div className="label-caps text-[11px] text-[var(--on-surface-variant)]">Callback URL</div>
                <div className="data-mono text-xs text-[var(--on-surface)]">POST /api/webhooks/xendit</div>
              </div>
            </div>

            <DialogFooter className="pt-0 gap-2">
              <Button variant="outline" className="border-[var(--border-subtle)]" onClick={resetForAnother}>
                Send another
              </Button>
              <Button variant="outline" className="border-[var(--border-subtle)]" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              <Button
                className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)]"
                onClick={() => goToEvent(createdId)}
              >
                View event
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="headline-md text-[var(--on-surface)]">Simulate a webhook callback</DialogTitle>
              <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
                TEST MODE — stands in for the provider. The callback is verified-free but runs the same
                dedupe + persist pipeline as a real POST.
              </DialogDescription>
            </DialogHeader>

            <form action={formAction} className="space-y-4">
              <div>
                <Label htmlFor="webhook-event" className="label-caps text-[var(--on-surface-variant)]">
                  Event type
                </Label>
                <NativeSelect id="webhook-event" name="event" defaultValue="payment.succeeded" className="mt-1.5 w-full">
                  {SIMULATABLE_WEBHOOK_EVENTS.map((e) => (
                    <NativeSelectOption key={e} value={e}>
                      {e}
                      {(KNOWN_WEBHOOK_EVENTS as readonly string[]).includes(e) ? "" : " (unhandled)"}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <p className="body-sm text-[var(--on-surface-variant)] text-xs mt-1.5">
                  <span className="data-mono">invoice.issued</span> has no handler branch — it lands in the log
                  flagged as unhandled.
                </p>
              </div>

              <div>
                <Label htmlFor="webhook-reference" className="label-caps text-[var(--on-surface-variant)]">
                  Ledger reference <span className="normal-case text-[var(--outline)]">(optional)</span>
                </Label>
                <Input
                  id="webhook-reference"
                  name="reference"
                  placeholder="e.g. txn_… of the payment this callback is about"
                  autoComplete="off"
                  className={cn("mt-1.5 data-mono text-xs")}
                />
              </div>

              {state.status === "error" ? (
                <p className="body-sm text-[var(--failed-status)]" role="alert">
                  {state.message}
                </p>
              ) : null}

              <DialogFooter className="pt-2">
                <DialogClose
                  render={
                    <Button type="button" variant="outline" className="border-[var(--border-subtle)]">
                      Cancel
                    </Button>
                  }
                />
                <SubmitButton />
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
