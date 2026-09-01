import * as React from "react";
import { formatDateTime } from "@/lib/format";
import type { PayoutEvent } from "@/server/data/payouts";

const TONES: Record<PayoutEvent["kind"], { dot: string; icon: string }> = {
  info: { dot: "bg-[var(--outline)]", icon: "info" },
  success: { dot: "bg-[var(--success-status)]", icon: "check_circle" },
  warning: { dot: "bg-[var(--pending-status)]", icon: "warning" },
  error: { dot: "bg-[var(--failed-status)]", icon: "error" },
};

// Audit trail for a batch — created, scheduled, released, retried, cancelled.
export function BatchTimeline({ events }: { events: PayoutEvent[] }) {
  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-6">
      <h2 className="headline-md mb-4 text-[var(--on-surface)]">Activity</h2>
      <ol className="space-y-4">
        {events.map((event) => (
          <li key={event.id} className="flex gap-3">
            <span className="mt-1 flex flex-col items-center">
              <span className={`h-2.5 w-2.5 rounded-full ${TONES[event.kind].dot}`} aria-hidden="true" />
              <span className="mt-1 w-px flex-1 bg-[var(--border-subtle)]" aria-hidden="true" />
            </span>
            <div className="pb-1">
              <p className="label-md text-[var(--on-surface)]">{event.label}</p>
              <p className="body-sm text-[var(--on-surface-variant)]">{event.detail}</p>
              <p className="body-sm text-xs text-[var(--outline)]">{formatDateTime(event.at)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
