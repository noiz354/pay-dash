"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/common/empty-state";
import { isValidIpOrCidr } from "@/lib/settings-options";
import { addIpAllowAction, removeIpAllowAction, type ActionState } from "@/server/actions/settings";
import { formatDateLong } from "@/lib/format";

export type IpEntryView = { id: string; value: string; label: string; createdAt: string };

const initialState: ActionState = { status: "idle", message: "" };

function AddButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      className="h-9 bg-[var(--primary)] text-[var(--on-primary)] disabled:opacity-50"
    >
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

/**
 * IP allowlist CRUD.
 * The prototype had an input and an "Add" button that did nothing and no list
 * of existing rules. Adding validates client-side before the action runs,
 * removal is per-row with a pending state, and an empty allowlist explains
 * what "empty" means instead of showing a blank box.
 */
export function IpAllowlistManager({ entries }: { entries: IpEntryView[] }) {
  const router = useRouter();
  const [state, formAction] = useActionState(addIpAllowAction, initialState);
  const [value, setValue] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [removing, setRemoving] = React.useState<string | null>(null);
  const handled = React.useRef<ActionState | null>(null);

  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") {
      toast.success(state.message);
      setValue("");
      setLabel("");
      router.refresh();
    } else if (!state.fieldErrors) {
      toast.error(state.message);
    }
  }, [state, router]);

  const touched = value.trim().length > 0;
  const valid = touched && isValidIpOrCidr(value);

  const remove = async (id: string, ip: string) => {
    setRemoving(id);
    const data = new FormData();
    data.set("id", id);
    const result = await removeIpAllowAction(undefined, data);
    setRemoving(null);
    if (result.status === "success") {
      toast.success(result.message, { description: ip });
      router.refresh();
    } else {
      toast.error(result.message);
    }
  };

  return (
    <section className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--surface)]/50">
        <h2 className="headline-md text-[var(--on-surface)]">IP Allowlist</h2>
        <p className="body-sm text-[var(--on-surface-variant)]">
          When at least one rule exists, live API requests from other addresses are rejected.
        </p>
      </div>

      <div className="p-6 space-y-6">
        <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="ip-value" className="label-caps text-[var(--on-surface-variant)]">
              IP address or CIDR
            </Label>
            <Input
              id="ip-value"
              name="value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 192.168.1.1"
              aria-invalid={touched && !valid}
              className="h-9 border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] data-mono"
            />
            {touched && !valid ? (
              <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
                Enter an IPv4 address or CIDR block (e.g. 198.51.100.0/24)
              </p>
            ) : null}
            {state.fieldErrors?.value ? (
              <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
                {state.fieldErrors.value[0]}
              </p>
            ) : null}
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="ip-label" className="label-caps text-[var(--on-surface-variant)]">
              Label
            </Label>
            <Input
              id="ip-label"
              name="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. HQ office"
              className="h-9 border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]"
            />
          </div>
          <AddButton disabled={!valid} />
        </form>

        {entries.length === 0 ? (
          <EmptyState
            icon="lan"
            title="No IP restrictions"
            description="Every address can call the API with a valid key. Add a rule to lock traffic down to known networks."
          />
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)]">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="data-mono text-sm text-[var(--on-surface)]">{entry.value}</p>
                  <p className="body-sm text-xs text-[var(--on-surface-variant)]">
                    {entry.label} · added {formatDateLong(entry.createdAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={removing === entry.id}
                  aria-label={`Remove ${entry.value}`}
                  onClick={() => remove(entry.id, entry.value)}
                  className="h-8 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
                >
                  {removing === entry.id ? (
                    <Spinner className="size-4" />
                  ) : (
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      delete
                    </span>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
