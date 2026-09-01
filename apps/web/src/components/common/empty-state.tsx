import * as React from "react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

// Generic empty-state used by every table / chart / list in the app so the
// "no data" path is never a blank rectangle.
export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  className,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Empty
      className={cn(
        "border border-dashed border-[var(--border-subtle)] bg-[var(--surface-container-low)]/30 py-12",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="bg-[var(--surface-container-high)] text-[var(--on-surface-variant)] size-10"
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            {icon}
          </span>
        </EmptyMedia>
        <EmptyTitle className="headline-md text-[var(--on-surface)]">{title}</EmptyTitle>
        {description ? (
          <EmptyDescription className="body-sm text-[var(--on-surface-variant)]">{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent className="mt-2">{action}</EmptyContent> : null}
    </Empty>
  );
}
