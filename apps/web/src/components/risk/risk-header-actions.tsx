"use client";

import * as React from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  deployRiskAction,
  discardDraftAction,
  type ActionState,
} from "@/server/actions/risk";

type DirectAction = (
  _prev: ActionState | undefined,
  formData: FormData,
) => Promise<ActionState>;

// Draft/deploy workflow (ADR-0023) — the prototype's two inert header
// buttons, now real: they are enabled exactly when a draft exists.
export function RiskHeaderActions({ hasDraft }: { hasDraft: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"deploy" | "discard" | null>(null);

  const run = (key: "deploy" | "discard", action: DirectAction) => {
    if (busy) return;
    setBusy(key);
    action(undefined, new FormData())
      .then((res) => {
        if (res.status === "success") toast.success(res.message);
        else toast.error(res.message);
        router.refresh();
      })
      .finally(() => setBusy(null));
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        className="h-9 bg-[var(--surface-container)] border-[var(--border-subtle)] text-[var(--on-surface)] label-caps hover:bg-[var(--surface-container-high)]"
        disabled={!hasDraft || busy !== null}
        onClick={() => run("discard", discardDraftAction)}
      >
        {busy === "discard" ? <Spinner className="size-4" /> : null} Discard Draft
      </Button>
      <Button
        className="h-9 bg-[var(--primary)] text-[var(--on-primary)] label-caps shadow-sm hover:bg-[var(--surface-tint)]"
        disabled={!hasDraft || busy !== null}
        onClick={() => run("deploy", deployRiskAction)}
      >
        {busy === "deploy" ? <Spinner className="size-4" /> : null} Deploy Changes
      </Button>
    </div>
  );
}
