"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { toggleAutoWithdrawalAction, type ActionState } from "@/server/actions/payouts";

const initialState: ActionState<{ automated: boolean }> = { status: "idle", message: "" };

function ToggleSwitch({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  // The base-ui Switch is a button-role span, not a native submit control, so
  // the click hands off to the surrounding form explicitly.
  return (
    <span className="relative inline-flex items-center gap-2">
      <Switch
        checked={enabled}
        disabled={pending}
        aria-label="Toggle Auto-Withdrawal"
        onCheckedChange={() => {}}
        onClick={(event) => (event.currentTarget as HTMLElement).closest("form")?.requestSubmit()}
      />
      {pending ? <Spinner className="size-3.5 text-[var(--on-surface-variant)]" /> : null}
    </span>
  );
}

/**
 * The switch finally saves something: it submits a server action that flips
 * `automated` on the real payout schedule (ADR-0011), so the card, the
 * settings page and the schedule form all read the same truth afterwards.
 */
export function AutoWithdrawalToggle({ enabled }: { enabled: boolean }) {
  const [state, formAction] = useActionState(toggleAutoWithdrawalAction, initialState);
  const handled = React.useRef<ActionState<{ automated: boolean }> | null>(null);

  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="automated" value={enabled ? "off" : "on"} />
      <ToggleSwitch enabled={enabled} />
    </form>
  );
}
