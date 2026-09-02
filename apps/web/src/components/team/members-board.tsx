"use client";

import * as React from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/transactions/table-pagination";
import { EmptyState } from "@/components/common/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { formatRelative } from "@/lib/format";
import {
  MEMBER_STATUS_LABELS,
  ROLE_LABELS,
  TEAM_ROLES,
  type MemberStatus,
  type TeamRole,
} from "@/lib/team-roles";
import type { Member } from "@/server/data/team";
import {
  changeRoleAction,
  deactivateAction,
  reactivateAction,
  resendInviteAction,
  revokeInviteAction,
  type ActionState,
} from "@/server/actions/team";

// Members tab (ADR-0022): real selection, real bulk Change Role / Deactivate,
// a real ⋮ menu per row, real last-active (formatRelative over timestamps).
// The prototype's "0 selected" bar was unreachable because its checkboxes
// had no state — here the checkboxes ARE the state.

const STATUS_CHIP: Record<MemberStatus, string> = {
  ACTIVE:
    "bg-[var(--status-success-bg)] text-[var(--success-status)] border-[var(--success-status)]/20",
  INVITED:
    "bg-[var(--pending-status)]/10 text-[var(--pending-status)] border-[var(--pending-status)]/20",
  DEACTIVATED:
    "bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] border-[var(--outline-variant)]",
};

type DirectAction = (
  _prev: ActionState | undefined,
  formData: FormData,
) => Promise<ActionState>;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function MembersBoard({
  rows,
  total,
  page,
  pageCount,
  pageSize,
  isFiltered,
}: {
  rows: Member[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  isFiltered: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = React.useState<TeamRole>("ADMIN");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // Selection is per-page; a re-render after any mutation starts clean.
  React.useEffect(() => {
    setSelected(new Set());
  }, [rows]);

  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)));
  };
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Every server action is a useActionState pair (prev, formData); the client
  // passes `undefined` for prev and drives its own busy/toast/refresh state.
  const run = (action: DirectAction, ids: string[], role?: TeamRole) => {
    if (busyId !== null || ids.length === 0) return;
    setBusyId(ids[0] ?? "bulk");
    const fd = new FormData();
    ids.forEach((id) => fd.append("ids", id));
    if (ids.length === 1) fd.set("id", ids[0]);
    if (role) fd.set("role", role);
    action(undefined, fd)
      .then((res) => {
        if (res.status === "success") toast.success(res.message);
        else toast.error(res.message);
        setSelected(new Set());
        router.refresh();
      })
      .finally(() => setBusyId(null));
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)]">
      {/* Bulk bar — the selection is real state, so these buttons are real. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-2.5">
        <span className="body-sm text-[var(--on-surface-variant)]" aria-live="polite">
          {selected.size === 0 ? "Nothing selected" : `${selected.size} selected`}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            value={bulkRole}
            onChange={(e) => setBulkRole(e.target.value as TeamRole)}
            aria-label="Bulk change role to"
            className="h-8 w-40 border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-[var(--on-surface)]"
            disabled={selected.size === 0}
          >
            {TEAM_ROLES.map((r) => (
              <NativeSelectOption key={r.value} value={r.value}>
                {r.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            size="sm"
            disabled={selected.size === 0 || busyId !== null}
            onClick={() => run(changeRoleAction, [...selected], bulkRole)}
          >
            {busyId !== null ? <Spinner className="size-3.5" /> : null} Change Role
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selected.size === 0 || busyId !== null}
            className="text-[var(--failed-status)] border-[var(--failed-status)]/30"
            onClick={() => run(deactivateAction, [...selected])}
          >
            Deactivate
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-10">
          <EmptyState
            icon="group_off"
            title={isFiltered ? "No members match these filters" : "No team members yet"}
            description={isFiltered ? "Widen the search or clear the role filter." : "Invite your first member."}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="label-caps sticky top-0 bg-[var(--surface-container-low)]">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allOnPage}
                    onCheckedChange={toggleAll}
                    aria-label="Select all members"
                  />
                </TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Last Active</TableHead>
                <TableHead className="w-12" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id} className="group">
                  <TableCell>
                    <Checkbox
                      checked={selected.has(m.id)}
                      onCheckedChange={() => toggle(m.id)}
                      aria-label={`Select ${m.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[var(--primary-fixed)] text-xs font-bold uppercase text-[var(--primary-fixed-dim)]">
                        {initials(m.name)}
                      </div>
                      <div>
                        <div className="body-sm font-medium text-[var(--on-surface)]">{m.name}</div>
                        <div className="body-sm text-xs text-[var(--on-surface-variant)]">{m.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-container)] px-2 py-1 text-xs font-medium text-[var(--on-surface)]">
                      <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                        {TEAM_ROLES.find((r) => r.value === m.role)?.icon}
                      </span>
                      {ROLE_LABELS[m.role]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CHIP[m.status]}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                      {MEMBER_STATUS_LABELS[m.status]}
                    </span>
                  </TableCell>
                  <TableCell className="data-mono text-right text-[var(--on-surface-variant)]">
                    {m.lastActiveAt ? formatRelative(m.lastActiveAt) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowMenu
                      member={m}
                      busyId={busyId}
                      run={(action, id, role) => run(action, [id], role)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {total > 0 ? (
        <div className="border-t border-[var(--border-subtle)] p-2">
          <TablePagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} />
        </div>
      ) : null}
    </div>
  );
}

function RowMenu({
  member,
  busyId,
  run,
}: {
  member: Member;
  busyId: string | null;
  run: (action: DirectAction, id: string, role?: TeamRole) => void;
}) {
  return (
    <div data-row-interactive>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex rounded p-1 text-[var(--on-surface-variant)] transition-colors opacity-100 md:opacity-0 hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)] group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
          aria-label={`Actions for ${member.name}`}
          disabled={busyId !== null}
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            {busyId !== null ? "progress_activity" : "more_vert"}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {member.status === "INVITED" ? (
            <>
              <DropdownMenuItem onClick={() => run(resendInviteAction, member.id)}>
                Resend invite
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => run(revokeInviteAction, member.id)}>
                Revoke invite
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Change role</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  {TEAM_ROLES.filter((r) => r.value !== member.role).map((r) => (
                    <DropdownMenuItem key={r.value} onClick={() => run(changeRoleAction, member.id, r.value)}>
                      {r.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              {member.status === "ACTIVE" ? (
                <DropdownMenuItem
                  className="text-[var(--failed-status)]"
                  onClick={() => run(deactivateAction, member.id)}
                >
                  Deactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => run(reactivateAction, member.id)}>
                  Reactivate
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
