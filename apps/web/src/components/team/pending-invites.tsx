"use client";

import * as React from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/common/empty-state";
import { formatRelative } from "@/lib/format";
import { INVITE_TTL_DAYS, MEMBER_STATUS_LABELS, ROLE_LABELS } from "@/lib/team-roles";
import type { Member } from "@/server/data/team";
import {
  resendInviteAction,
  revokeInviteAction,
  type ActionState,
} from "@/server/actions/team";

type DirectAction = (
  _prev: ActionState | undefined,
  formData: FormData,
) => Promise<ActionState>;

// Pending Invites tab (ADR-0022): derived from members with status INVITED —
// the prototype's tab declared "no pending invitations" while its own
// Members tab listed an Invited member. Now the two agree by construction,
// and Resend / Revoke are real actions.
export function PendingInvites({ invites }: { invites: Member[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const run = (id: string, action: DirectAction) => {
    if (busyId) return;
    setBusyId(id);
    const fd = new FormData();
    fd.set("id", id);
    action(undefined, fd)
      .then((res) => {
        if (res.status === "success") toast.success(res.message);
        else toast.error(res.message);
        router.refresh();
      })
      .finally(() => setBusyId(null));
  };

  if (invites.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-10">
        <EmptyState
          icon="mark_email_read"
          title="No pending invitations"
          description="Invites you send appear here until they are accepted, revoked or expired."
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)]">
      <ul className="divide-y divide-[var(--border-subtle)]">
        {invites.map((m) => (
          <li key={m.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[var(--primary-fixed)] text-xs font-bold uppercase text-[var(--primary-fixed-dim)]">
                {m.name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase() ?? "")
                  .join("")}
              </div>
              <div>
                <div className="body-sm font-medium text-[var(--on-surface)]">{m.name}</div>
                <div className="body-sm text-xs text-[var(--on-surface-variant)]">
                  {m.email} · {ROLE_LABELS[m.role]} · invited{" "}
                  {m.invitedAt ? formatRelative(m.invitedAt) : "recently"} (expires in {INVITE_TTL_DAYS}{" "}
                  days)
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-[var(--pending-status)]/10 px-2 py-0.5 text-xs font-medium text-[var(--pending-status)] border-[var(--pending-status)]/20">
                {MEMBER_STATUS_LABELS[m.status]}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-[var(--outline-variant)]"
                disabled={busyId !== null}
                onClick={() => run(m.id, resendInviteAction)}
              >
                {busyId === m.id ? <Spinner className="size-3.5" /> : null} Resend
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-[var(--failed-status)]/30 text-[var(--failed-status)]"
                disabled={busyId !== null}
                onClick={() => run(m.id, revokeInviteAction)}
              >
                Revoke
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
