"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
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
import {
  BLOCKLIST_REASON_LABELS,
  BLOCKLIST_REASONS,
  BLOCKLIST_TYPES,
  type BlocklistType,
} from "@/lib/blocklist-options";
import { addBlocklistAction, type ActionState } from "@/server/actions/blocklist";

// Add to Blocklist (ADR-0024) — shared by /fraud and /fraud/blocklist; one
// dialog, one store. Values are validated per type on the server.
const initialState: ActionState = { status: "idle", message: "" };

const VALUE_PLACEHOLDER: Record<BlocklistType, string> = {
  IP: "e.g. 203.0.113.42",
  CARD: "e.g. 4533220110123456",
  EMAIL: "e.g. example.com",
};

const VALUE_LABEL: Record<BlocklistType, string> = {
  IP: "IP address",
  CARD: "Card number",
  EMAIL: "Email domain",
};

export function AddBlocklistDialog() {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState(addBlocklistAction, initialState);
  const [added, setAdded] = React.useState<string | null>(null);
  const [type, setType] = React.useState<BlocklistType>("IP");

  const handled = React.useRef<ActionState | null>(null);
  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") setAdded(state.message);
  }, [state]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setAdded(null);
      }}
    >
      <DialogTrigger
        render={
          <Button className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] flex items-center gap-2 whitespace-nowrap">
            <span className="material-symbols-outlined text-[18px] shrink-0" aria-hidden="true">
              add
            </span>
            <span>Add to Blocklist</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md bg-[var(--surface)]">
        {added ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="headline-md text-[var(--on-surface)]">Added</DialogTitle>
              <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
                The entry is live on both fraud pages.
              </DialogDescription>
            </DialogHeader>
            <p className="body-sm text-[var(--on-surface)]">{added}</p>
            <DialogFooter className="pt-0 gap-2">
              <Button variant="outline" className="border-[var(--border-subtle)]" onClick={() => setAdded(null)}>
                Add another
              </Button>
              <DialogClose
                render={
                  <Button className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)]">
                    Done
                  </Button>
                }
              />
            </DialogFooter>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="headline-md text-[var(--on-surface)]">Add to blocklist</DialogTitle>
              <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
                Block an IP address, card number or email domain.
              </DialogDescription>
            </DialogHeader>
            <form action={formAction} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bl-type" className="body-sm text-[var(--on-surface-variant)]">
                  Type
                </Label>
                <NativeSelect
                  id="bl-type"
                  name="type"
                  value={type}
                  onChange={(e) => setType(e.target.value as BlocklistType)}
                  className="w-full border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]"
                >
                  {BLOCKLIST_TYPES.map((t) => (
                    <NativeSelectOption key={t} value={t}>
                      {t === "IP" ? "IP address" : t === "CARD" ? "Card number" : "Email domain"}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bl-value" className="body-sm text-[var(--on-surface-variant)]">
                  {VALUE_LABEL[type]}
                </Label>
                <Input
                  id="bl-value"
                  name="value"
                  placeholder={VALUE_PLACEHOLDER[type]}
                  className="border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bl-reason" className="body-sm text-[var(--on-surface-variant)]">
                  Reason
                </Label>
                <NativeSelect
                  id="bl-reason"
                  name="reason"
                  defaultValue="MANUAL_ENTRY"
                  className="w-full border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]"
                >
                  {BLOCKLIST_REASONS.map((r) => (
                    <NativeSelectOption key={r} value={r}>
                      {BLOCKLIST_REASON_LABELS[r]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              {state.status === "error" ? (
                <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
                  {state.message}
                </p>
              ) : null}
              <DialogFooter className="pt-2 gap-2">
                <DialogClose
                  render={
                    <Button type="button" variant="outline" className="border-[var(--border-subtle)]">
                      Cancel
                    </Button>
                  }
                />
                <AddBlocklistButton />
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddBlocklistButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)]">
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Adding…
        </span>
      ) : (
        "Add"
      )}
    </Button>
  );
}
