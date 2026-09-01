import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export default function SubscriptionsPage() {
  return (
    <main className="mx-auto w-full max-w-[var(--container-max)] p-[var(--gutter)] space-y-0">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Subscriptions</h1>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">Manage recurring billing and customer plans.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" aria-label="Export subscriptions" className="h-9 gap-2 border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 body-sm font-medium text-[var(--on-surface)] hover:bg-[var(--surface-container-low)] shadow-sm">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">download</span>
            Export
          </Button>
          <Button aria-label="Create Subscription" className="h-9 gap-2 bg-[var(--primary)] px-4 body-sm font-medium text-[var(--on-primary)] shadow-sm hover:bg-[var(--on-primary-fixed-variant)]">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
            Create Subscription
          </Button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
          <div className="mb-2 flex items-start justify-between">
            <h2 className="label-caps uppercase tracking-wider text-[var(--on-surface-variant)]">Active Plans</h2>
            <span className="material-symbols-outlined text-[20px] text-[var(--success-status)]" aria-hidden="true">trending_up</span>
          </div>
          <div className="mb-1 headline-xl text-[var(--on-surface)]">1,248</div>
          <div className="flex items-center gap-1 body-sm">
            <span className="font-medium text-[var(--success-status)]">+12%</span>
            <span className="text-[var(--on-surface-variant)]">vs last month</span>
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
          <div className="mb-2 flex items-start justify-between">
            <h2 className="label-caps uppercase tracking-wider text-[var(--on-surface-variant)]">Pending Setup</h2>
            <span className="material-symbols-outlined text-[20px] text-[var(--pending-status)]" aria-hidden="true">schedule</span>
          </div>
          <div className="mb-1 headline-xl text-[var(--on-surface)]">42</div>
          <div className="flex items-center gap-1 body-sm">
            <span className="text-[var(--on-surface-variant)]">Awaiting customer action</span>
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
          <div className="mb-2 flex items-start justify-between">
            <h2 className="label-caps uppercase tracking-wider text-[var(--on-surface-variant)]">Inactive/Failed</h2>
            <span className="material-symbols-outlined text-[20px] text-[var(--failed-status)]" aria-hidden="true">error</span>
          </div>
          <div className="mb-1 headline-xl text-[var(--on-surface)]">18</div>
          <div className="flex items-center gap-1 body-sm">
            <span className="font-medium text-[var(--failed-status)]">-3</span>
            <span className="text-[var(--on-surface-variant)]">recovered this week</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] shadow-sm">
        <div className="flex flex-col items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface-bright)] p-4 sm:flex-row">
          <div className="relative w-full sm:w-72">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--outline)] text-[18px]" aria-hidden="true">search</span>
            <Input placeholder="Search subscriptions..." aria-label="Search subscriptions" className="h-9 w-full border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] pl-9 pr-4 body-sm focus-visible:border-[var(--primary)]" />
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="outline" aria-label="Filter subscriptions" className="h-9 gap-2 border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 body-sm text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">filter_list</span>
              Filter
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="w-full text-left">
            <TableHeader className="sticky top-0 border-b border-[var(--border-subtle)] bg-[var(--surface-container-low)]">
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Customer</TableHead>
                <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Plan ID</TableHead>
                <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Status</TableHead>
                <TableHead scope="col" className="px-4 py-3 text-right label-caps font-semibold text-[var(--on-surface-variant)]">Amount (IDR)</TableHead>
                <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Interval</TableHead>
                <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Created Date</TableHead>
                <TableHead scope="col" className="px-4 py-3 text-right label-caps font-semibold text-[var(--on-surface-variant)]"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[var(--border-subtle)] body-sm text-[var(--on-surface)]">
              <TableRow className="group h-12 transition-colors hover:bg-[var(--surface-container-lowest)]">
                <TableCell className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src="https://lh3.googleusercontent.com/aida-public/AB6AXuB7okpmF6SodBh3cOiZJpPu18HtYW27aQizVuUGnTL5J-MwsITw9Gam-YfMH9loilcEr1nM5UkUlIk16Ej1g5DYk5I1FIOAnRjxZ6VJkE22qWm8D817EnFKemdBx-54GWBlpr6cAOPw1Q3wVSEuPh8-5VGjAunyrWICTncEbdvWg43oMCbJGuNTA8pFOGXG1z2mRGPx4QQzOwWTbmbG6yK4h4LpMrEZ-6fReLHu1beZxMTYt7cj5uzz" alt="TechFlow Solutions" />
                      <AvatarFallback className="bg-[var(--surface-variant)] text-xs">TF</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-[var(--on-surface)]">TechFlow Solutions</span>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-2 data-mono text-[var(--on-surface-variant)]">sub_1Mvw8K</TableCell>
                <TableCell className="px-4 py-2">
                  <Badge className="rounded-full border border-[var(--success-status)]/20 bg-[var(--success-status)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--success-status)] hover:bg-[var(--success-status)]/10">Active</Badge>
                </TableCell>
                <TableCell className="px-4 py-2 text-right data-mono">15,000,000</TableCell>
                <TableCell className="px-4 py-2 text-[var(--on-surface-variant)]">Monthly</TableCell>
                <TableCell className="px-4 py-2 text-[var(--on-surface-variant)]">Oct 24, 2023</TableCell>
                <TableCell className="px-4 py-2 text-right">
                  <Button variant="ghost" size="icon" aria-label="Actions for TechFlow Solutions" className="h-8 w-8 p-1 text-[var(--on-surface-variant)] opacity-0 transition-opacity hover:text-[var(--primary)] group-hover:opacity-100 focus:opacity-100">
                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">more_vert</span>
                  </Button>
                </TableCell>
              </TableRow>
              <TableRow className="group h-12 transition-colors hover:bg-[var(--surface-container-lowest)]">
                <TableCell className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src="https://lh3.googleusercontent.com/aida-public/AB6AXuBUWbHc5W85Tp6EP5bLa0z-wQhHrrOqaiyXKXXKQ3HsOaVCyK4PCwPnyBD6qB30TF__SMOVj0joqnCEoVVETKPoJMRNq2FK3G5Y2Bgc9JBZxKH4yxZJZlryyNwJ5_kRTyJCnS4vnX_dPxWtM1AM5rsTn30jFZ8YU-qTuG3eDLNK1w7B6wZo-fZelk4sVY5u6wZ3_TVZRiEjW_PdKXBL5jj2yjMG9nw6-HFiA9p7WkomMmwq0KvAIpVj" alt="Global Dynamics Inc." />
                      <AvatarFallback className="bg-[var(--surface-variant)] text-xs">GD</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-[var(--on-surface)]">Global Dynamics Inc.</span>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-2 data-mono text-[var(--on-surface-variant)]">sub_9Xqa2L</TableCell>
                <TableCell className="px-4 py-2">
                  <Badge className="rounded-full border border-[var(--pending-status)]/20 bg-[var(--pending-status)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--pending-status)] hover:bg-[var(--pending-status)]/10">Pending Setup</Badge>
                </TableCell>
                <TableCell className="px-4 py-2 text-right data-mono">120,000,000</TableCell>
                <TableCell className="px-4 py-2 text-[var(--on-surface-variant)]">Yearly</TableCell>
                <TableCell className="px-4 py-2 text-[var(--on-surface-variant)]">Oct 23, 2023</TableCell>
                <TableCell className="px-4 py-2 text-right">
                  <Button variant="ghost" size="icon" aria-label="Actions for Global Dynamics" className="h-8 w-8 p-1 text-[var(--on-surface-variant)] opacity-0 transition-opacity hover:text-[var(--primary)] group-hover:opacity-100 focus:opacity-100">
                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">more_vert</span>
                  </Button>
                </TableCell>
              </TableRow>
              <TableRow className="group h-12 bg-[var(--surface-container-low)]/30 transition-colors hover:bg-[var(--surface-container-lowest)]">
                <TableCell className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-[var(--primary-fixed)] font-bold text-[var(--primary-fixed-dim)]">N</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-[var(--on-surface)]">Nexus Industries</span>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-2 data-mono text-[var(--on-surface-variant)]">sub_4Bnt7P</TableCell>
                <TableCell className="px-4 py-2">
                  <Badge className="rounded-full border border-[var(--failed-status)]/20 bg-[var(--failed-status)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--failed-status)] hover:bg-[var(--failed-status)]/10">Past Due</Badge>
                </TableCell>
                <TableCell className="px-4 py-2 text-right data-mono">8,500,000</TableCell>
                <TableCell className="px-4 py-2 text-[var(--on-surface-variant)]">Monthly</TableCell>
                <TableCell className="px-4 py-2 text-[var(--on-surface-variant)]">Oct 20, 2023</TableCell>
                <TableCell className="px-4 py-2 text-right">
                  <Button variant="ghost" size="icon" aria-label="Actions for Nexus Industries" className="h-8 w-8 p-1 text-[var(--on-surface-variant)] opacity-0 transition-opacity hover:text-[var(--primary)] group-hover:opacity-100 focus:opacity-100">
                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">more_vert</span>
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4 body-sm text-[var(--on-surface-variant)]">
          <span>Showing 1 to 10 of 1,290 entries</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled className="h-8 border-[var(--outline-variant)] px-2 py-1 disabled:opacity-50">Previous</Button>
            <Button variant="outline" size="sm" className="h-8 border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-2 py-1 font-medium text-[var(--on-surface)]">1</Button>
            <Button variant="outline" size="sm" className="h-8 border-[var(--outline-variant)] px-2 py-1 hover:bg-[var(--surface-container-low)]">2</Button>
            <Button variant="outline" size="sm" className="h-8 border-[var(--outline-variant)] px-2 py-1 hover:bg-[var(--surface-container-low)]">3</Button>
            <span className="px-2 py-1">...</span>
            <Button variant="outline" size="sm" className="h-8 border-[var(--outline-variant)] px-2 py-1 hover:bg-[var(--surface-container-low)]">Next</Button>
          </div>
        </div>
      </div>
    </main>
  );
}
