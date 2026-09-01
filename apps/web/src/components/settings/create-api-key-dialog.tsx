"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { SecretReveal } from "@/components/settings/secret-reveal";
import { KEY_ENVIRONMENTS, KEY_SCOPES, type KeyEnvironment } from "@/lib/settings-options";
import { createApiKeyAction, type ActionState } from "@/server/actions/settings";

type Created = { id: string; secret: string; name: string };
const initialState: ActionState<Created> = { status: "idle", message: "" };

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="min-w-[10rem] bg-[var(--primary)] text-[var(--on-primary)] disabled:opacity-60"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Creating…
        </span>
      ) : (
        "Create key"
      )}
    </Button>
  );
}

/**
 * Create a secret key.
 * The prototype's "create key" button had no dialog at all. This is a two-step
 * flow: name + environment + scopes, then a reveal-once secret panel that can
 * only be dismissed by acknowledging it.
 */
export function CreateApiKeyDialog({
  defaultEnvironment = "TEST",
  triggerLabel = "Create new key",
  triggerClassName,
}: {
  defaultEnvironment?: KeyEnvironment;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [created, setCreated] = React.useState<Created | null>(null);
  const [state, formAction] = useActionState(createApiKeyAction, initialState);
  const handled = React.useRef<ActionState<Created> | null>(null);

  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success" && state.data) {
      setCreated(state.data);
      toast.success(state.message);
      router.refresh();
    } else if (state.status === "error" && !state.fieldErrors) {
      toast.error(state.message);
    }
  }, [state, router]);

  const close = () => {
    setOpen(false);
    setCreated(null);
  };

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => (next ? setOpen(true) : close())}>
      <DialogTrigger
        render={
          <Button className={`gap-2 bg-[var(--primary)] text-[var(--on-primary)] ${triggerClassName ?? ""}`}>
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              add
            </span>
            {triggerLabel}
          </Button>
        }
      />
      <DialogContent className="bg-[var(--surface)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="headline-md text-[var(--on-surface)]">
            {created ? `${created.name} created` : "Create API key"}
          </DialogTitle>
          <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
            {created
              ? "Copy the secret before closing this dialog."
              : "Scope the key to only what the integration needs."}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <SecretReveal secret={created.secret} onAcknowledge={close} />
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="key-name" className="label-caps text-[var(--on-surface-variant)]">
                Key name
              </Label>
              <Input
                id="key-name"
                name="name"
                placeholder="e.g. Checkout service"
                aria-invalid={Boolean(state.fieldErrors?.name)}
                className="h-9 border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]"
              />
              {state.fieldErrors?.name ? (
                <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
                  {state.fieldErrors.name[0]}
                </p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label htmlFor="key-env" className="label-caps text-[var(--on-surface-variant)]">
                Environment
              </Label>
              <NativeSelect id="key-env" name="environment" defaultValue={defaultEnvironment} className="w-full">
                {KEY_ENVIRONMENTS.map((env) => (
                  <NativeSelectOption key={env} value={env}>
                    {env === "LIVE" ? "Live — moves real money" : "Test — sandbox only"}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <fieldset className="space-y-2">
              <legend className="label-caps text-[var(--on-surface-variant)]">Scopes</legend>
              <div className="grid grid-cols-2 gap-2">
                {KEY_SCOPES.map((scope) => (
                  <label
                    key={scope}
                    className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2"
                  >
                    <Checkbox name="scopes" value={scope} defaultChecked={scope === "read"} />
                    <span className="body-sm text-[var(--on-surface)]">{scope}</span>
                  </label>
                ))}
              </div>
              {state.fieldErrors?.scopes ? (
                <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
                  {state.fieldErrors.scopes[0]}
                </p>
              ) : null}
            </fieldset>

            <div className="flex items-start gap-2">
              <Checkbox id="key-confirm" name="confirm" value="on" className="mt-0.5" />
              <Label htmlFor="key-confirm" className="body-sm font-normal text-[var(--on-surface-variant)]">
                I understand the secret is shown once and will store it securely.
              </Label>
            </div>
            {state.fieldErrors?.confirm ? (
              <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
                {state.fieldErrors.confirm[0]}
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
              <CreateButton />
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
