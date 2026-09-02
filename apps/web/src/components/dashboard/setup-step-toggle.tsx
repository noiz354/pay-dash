"use client";

import * as React from "react";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// One checklist row. The checkbox is a Server Action form with an optimistic
// local state so the tick lands immediately, and the row still exposes a real
// link to the screen where the task gets done. When `locked` is set the step
// is done *by real system state* (e.g. a verified bank account) — the tick is
// rendered as a static badge and the row cannot be unticked, because the
// truth lives in another store, not in this cookie.
export function SetupStepToggle({
  stepId,
  title,
  description,
  href,
  done,
  highlighted,
  action,
  locked,
  lockNote,
}: {
  stepId: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
  highlighted?: boolean;
  action: (formData: FormData) => Promise<void>;
  locked?: boolean;
  lockNote?: string;
}) {
  const [optimisticDone, setOptimisticDone] = React.useOptimistic(done);
  const [isPending, startTransition] = React.useTransition();

  return (
    <div
      className={cn(
        "flex gap-3 items-start rounded p-2 -mx-2 min-w-0 overflow-hidden transition-colors",
        highlighted
          ? "bg-[var(--surface-container-low)] border border-[var(--primary)]/20"
          : "border border-transparent hover:bg-[var(--surface-container-low)]/60"
      )}
    >
      {locked ? (
        <span className="mt-0.5 shrink-0" aria-label={`${title} verified`}>
          <span
            className="material-symbols-outlined text-[20px] text-[var(--success-status)]"
            aria-hidden="true"
          >
            check_circle
          </span>
        </span>
      ) : (
        <form
          action={(formData) => {
            startTransition(async () => {
              setOptimisticDone(!optimisticDone);
              await action(formData);
              toast.success(optimisticDone ? `“${title}” reopened` : `“${title}” marked complete`);
            });
          }}
          className="shrink-0"
        >
          <input type="hidden" name="stepId" value={stepId} />
          <button
            type="submit"
            disabled={isPending}
            aria-pressed={optimisticDone}
            aria-label={optimisticDone ? `Mark ${title} as not done` : `Mark ${title} as done`}
            className="mt-0.5 disabled:opacity-50"
          >
            <span
              className={cn(
                "material-symbols-outlined text-[20px]",
                optimisticDone ? "text-[var(--success-status)]" : highlighted ? "text-[var(--primary)]" : "text-[var(--outline)]"
              )}
              aria-hidden="true"
            >
              {optimisticDone ? "check_circle" : "radio_button_unchecked"}
            </span>
          </button>
        </form>
      )}

      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className={cn(
            "body-sm font-medium break-words hover:underline",
            locked || optimisticDone ? "text-[var(--on-surface-variant)] line-through" : "text-[var(--on-surface)]"
          )}
        >
          {title}
        </Link>
        {lockNote ? (
          <span className="mt-1 inline-flex items-center gap-1 label-caps text-[10px] text-[var(--success-status)] bg-[var(--success-status)]/10 px-1.5 py-0.5 rounded">
            <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
              verified_user
            </span>
            {lockNote}
          </span>
        ) : highlighted && !optimisticDone && !locked ? (
          <p className="body-sm text-[var(--on-surface-variant)] text-[12px] mt-0.5 break-words">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
