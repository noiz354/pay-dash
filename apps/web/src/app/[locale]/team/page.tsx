import type { Metadata } from "next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportCsvButton } from "@/components/transactions/export-csv-button";
import { AddMemberDialog } from "@/components/team/add-member-dialog";
import { MembersBoard } from "@/components/team/members-board";
import { PendingInvites } from "@/components/team/pending-invites";
import { TeamFilters } from "@/components/team/team-filters";
import { INVITE_TTL_DAYS } from "@/lib/team-roles";
import { listMembers, roleCatalog } from "@/server/data/team";

// Team & Permissions (ADR-0022). INTEGRATION.md (:97/:122/:318) documents the
// screen with no Xendit source — "Role-based access control is Dashboard-only" —
// so the team is a domain the app itself manages (the webhooks class) and is
// deliberately seeded: six members on the merchant's own @acmecorp.com domain
// (five active, one open invite). The prototype's four hard-coded rows lived
// in the module scope with off-world @ledger.com addresses, a "0 selected"
// bulk bar that was unreachable because its checkboxes had no state, a
// "1 to 4 of 24" pagination, placeholder Roles/Pending Invites tabs — and an
// Invited member contradicting the "no pending invitations" tab.
export const metadata: Metadata = {
  title: "Team & Permissions — Kinetic Ledger",
  description:
    "Your dashboard team — real members, real roles, real invites. RBAC is dashboard-owned.",
};

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

async function MembersTab({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const role = (one(sp.role) as "ADMIN" | "DEVELOPER" | "ANALYST" | "RISK_ANALYST" | "ALL") ?? "ALL";
  const page = Number(one(sp.page) ?? 1) || 1;

  // The Members tab owns ACTIVE + DEACTIVATED; invites live in Pending
  // Invites (ADR-0022) — the prototype listed its one "Invited" member in
  // both places' contradiction.
  const result = await listMembers({
    q,
    role,
    statuses: ["ACTIVE", "DEACTIVATED"],
    page,
    pageSize: 10,
  });

  return (
    <div className="space-y-3">
      <TeamFilters resultCount={result.total} />
      <MembersBoard
        rows={result.rows}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        pageSize={result.pageSize}
        isFiltered={result.isFiltered}
      />
    </div>
  );
}

async function RolesTab() {
  const catalog = await roleCatalog();
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)]">
      <div className="border-b border-[var(--border-subtle)] px-4 py-3">
        <p className="body-sm text-[var(--on-surface-variant)]">
          Roles are dashboard-defined — INTEGRATION.md:318 (RBAC is Dashboard-only). Member counts
          count active members only.
        </p>
      </div>
      <Table>
        <TableHeader className="label-caps sticky top-0 bg-[var(--surface-container-low)]">
          <TableRow>
            <TableHead>Role</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead className="text-right">Members</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {catalog.map((r) => (
            <TableRow key={r.value}>
              <TableCell>
                <span className="inline-flex items-center gap-1.5 rounded bg-[var(--surface-container)] px-2 py-1 text-xs font-medium text-[var(--on-surface)]">
                  <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                    {r.icon}
                  </span>
                  {r.label}
                </span>
              </TableCell>
              <TableCell className="body-sm text-[var(--on-surface-variant)]">{r.description}</TableCell>
              <TableCell className="body-sm text-[var(--on-surface-variant)]">
                <div className="flex max-w-md flex-wrap gap-1">
                  {r.permissions.map((p) => (
                    <span
                      key={p}
                      className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-container-low)] px-2 py-0.5 text-xs"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </TableCell>
              <TableCell className="data-mono text-right">{r.members}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

async function PendingTab() {
  const result = await listMembers({ statuses: ["INVITED"], pageSize: 100 });
  return <PendingInvites invites={result.rows} />;
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Team &amp; Permissions</h1>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
            Manage user access, roles, and invitations. Invites expire in {INVITE_TTL_DAYS} days.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportCsvButton
            label="Export"
            endpoint="/api/exports/team"
            filePrefix="team"
            className="h-9 border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4"
          />
          <AddMemberDialog />
        </div>
      </div>

      <Tabs defaultValue="members">
        <TabsList variant="line" className="border-b border-[var(--border-subtle)]">
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="pending">Pending Invites</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-0">
          <MembersTab searchParams={searchParams} />
        </TabsContent>
        <TabsContent value="roles" className="space-y-0">
          <RolesTab />
        </TabsContent>
        <TabsContent value="pending" className="space-y-0">
          <PendingTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}
