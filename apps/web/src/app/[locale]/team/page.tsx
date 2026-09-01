import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const members = [
  {
    id: "1",
    name: "Sarah Anderson",
    email: "sarah.a@ledger.com",
    initials: "SA",
    role: "Admin",
    roleIcon: "shield_person",
    status: "Active",
    lastActive: "2 mins ago",
  },
  {
    id: "2",
    name: "Michael Chen",
    email: "m.chen@ledger.com",
    initials: "MC",
    role: "Developer",
    roleIcon: "code",
    status: "Active",
    lastActive: "1 hour ago",
  },
  {
    id: "3",
    name: "Elena Jenkins",
    email: "elena.j@ledger.com",
    initials: "EJ",
    role: "Analyst",
    roleIcon: "monitoring",
    status: "Invited",
    lastActive: "—",
  },
  {
    id: "4",
    name: "Sarah Chen",
    email: "sarah.c@ledgerscale.io",
    initials: "SC",
    role: "Risk Analyst",
    roleIcon: "monitoring",
    status: "Active",
    lastActive: "Yesterday",
  },
];

export default function TeamPage() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      {/* Page header — desktop:306-318 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="headline-xl">Team &amp; Permissions</h1>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
            Manage user access, roles, and administrative privileges.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" aria-label="Export members">
            Export
          </Button>
          <Button aria-label="Add member">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              person_add
            </span>
            Add Member
          </Button>
        </div>
      </div>

      <Tabs defaultValue="members">
        <TabsList variant="line" className="border-b border-[var(--border-subtle)]">
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="pending">Pending Invites</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-0">
          {/* Toolbar — Filter + bulk 0 selected */}
          <div className="flex flex-col gap-4 rounded-t-lg border border-[var(--border-subtle)] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full items-center gap-3 sm:w-auto">
              <div className="relative w-full sm:w-64">
                <span
                  className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--on-surface-variant)]"
                  aria-hidden="true"
                >
                  search
                </span>
                <Input placeholder="Filter members..." className="pl-9" aria-label="Filter members" />
              </div>
              <Button variant="outline" size="sm" aria-label="Filter by role">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  filter_list
                </span>
                Filter
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  arrow_drop_down
                </span>
              </Button>
            </div>
            <div className="flex items-center gap-2 opacity-50" aria-live="polite">
              <span className="body-sm mr-2 text-[var(--on-surface-variant)]">0 selected</span>
              <Button variant="outline" size="sm" disabled>
                Change Role
              </Button>
              <Button variant="outline" size="sm" disabled className="text-[var(--destructive)]">
                Deactivate
              </Button>
            </div>
          </div>

          {/* Data table — checkbox / Member / Role shield / Last Active mono / more_vert group-hover */}
          <div className="overflow-hidden rounded-b-lg border-x border-b border-[var(--border-subtle)] bg-white">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="label-caps sticky top-0 bg-[var(--surface-container-low)]">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox aria-label="Select all members" />
                    </TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Last Active</TableHead>
                    <TableHead className="w-12" aria-label="Actions" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id} className="group">
                      <TableCell>
                        <Checkbox aria-label={`Select ${m.name}`} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[var(--primary-container)] text-xs font-bold uppercase text-[var(--on-primary-container)]">
                            {m.initials}
                          </div>
                          <div>
                            <div className="body-sm font-medium">{m.name}</div>
                            <div className="body-sm text-xs text-[var(--on-surface-variant)]">{m.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-container)] px-2 py-1 text-xs font-medium">
                          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                            {m.roleIcon}
                          </span>
                          {m.role}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            m.status === "Active"
                              ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                              : "inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                          }
                        >
                          <span
                            className={
                              m.status === "Active" ? "h-1.5 w-1.5 rounded-full bg-emerald-500" : "h-1.5 w-1.5 rounded-full bg-amber-500"
                            }
                            aria-hidden="true"
                          />
                          {m.status}
                        </span>
                      </TableCell>
                      <TableCell className="data-mono text-right text-[var(--on-surface-variant)]">{m.lastActive}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                          aria-label={`Actions for ${m.name}`}
                        >
                          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                            more_vert
                          </span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Pagination 1-4 of 24 */}
            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-white px-4 py-3">
              <span className="body-sm text-[var(--on-surface-variant)]">
                Showing <span className="data-mono font-medium text-[var(--on-surface)]">1</span> to{" "}
                <span className="data-mono font-medium text-[var(--on-surface)]">4</span> of{" "}
                <span className="data-mono font-medium text-[var(--on-surface)]">24</span> members
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-sm" disabled aria-label="Previous page">
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    chevron_left
                  </span>
                </Button>
                <Button variant="outline" size="icon-sm" aria-label="Next page">
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    chevron_right
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="roles">
          <p className="body-sm p-4 text-[var(--on-surface-variant)]">Roles — configure permissions per role.</p>
        </TabsContent>
        <TabsContent value="pending">
          <p className="body-sm p-4 text-[var(--on-surface-variant)]">Pending Invites — no pending invitations.</p>
        </TabsContent>
      </Tabs>
    </main>
  );
}
