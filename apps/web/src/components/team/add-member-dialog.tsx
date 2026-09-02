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
import { TEAM_ROLES } from "@/lib/team-roles";
import { inviteMemberAction, type ActionState } from "@/server/actions/team";

// Add Member (ADR-0022): a real dialog backed by a server action. The invite
// lands in INVITED and shows up under Pending Invites — the app's own
// outbound record, not a silent success.
const initialState: ActionState = { status: "idle", message: "" };

export function AddMemberDialog() {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState(inviteMemberAction, initialState);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  const handled = React.useRef<ActionState | null>(null);
  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") setSentTo(state.message);
  }, [state]);

  const reset = () => setSentTo(null);

  return (
    <Dialog open={open} onOpenChange={(next) => {
      setOpen(next);
      if (!next) reset();
    }}>
      <DialogTrigger
        render={
          <Button className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] flex items-center gap-2 whitespace-nowrap">
            <span className="material-symbols-outlined text-[18px] shrink-0" aria-hidden="true">
              person_add
            </span>
            <span>Add Member</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md bg-[var(--surface)]">
        {sentTo ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="headline-md text-[var(--on-surface)]">Invite sent</DialogTitle>
              <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
                The invite appears under Pending Invites and expires in 7 days.
              </DialogDescription>
            </DialogHeader>
            <p className="body-sm text-[var(--on-surface)]">{sentTo}</p>
            <DialogFooter className="pt-0 gap-2">
              <Button variant="outline" className="border-[var(--border-subtle)]" onClick={reset}>
                Invite another
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
              <DialogTitle className="headline-md text-[var(--on-surface)]">Add member</DialogTitle>
              <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
                Invite someone to the dashboard. They start in Pending Invites with the role you pick.
              </DialogDescription>
            </DialogHeader>
            <form action={formAction} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="member-name" className="body-sm text-[var(--on-surface-variant)]">
                  Full name
                </Label>
                <Input
                  id="member-name"
                  name="name"
                  placeholder="e.g. Anna Wijaya"
                  className="border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-email" className="body-sm text-[var(--on-surface-variant)]">
                  Email
                </Label>
                <Input
                  id="member-email"
                  name="email"
                  type="email"
                  placeholder="e.g. anna@acmecorp.com"
                  className="border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-role" className="body-sm text-[var(--on-surface-variant)]">
                  Role
                </Label>
                <NativeSelect
                  id="member-role"
                  name="role"
                  defaultValue="ANALYST"
                  className="w-full border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]"
                >
                  {TEAM_ROLES.map((r) => (
                    <NativeSelectOption key={r.value} value={r.value}>
                      {r.label} — {r.description}
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
                <SendInviteButton />
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SendInviteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)]">
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Sending…
        </span>
      ) : (
        "Send invite"
      )}
    </Button>
  );
}
