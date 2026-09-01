import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const customers = [
  {
    name: "Acme Corporation",
    email: "contact@acmecorp.com",
    ref: "REF-10042",
    added: "Oct 24, 2023",
    status: "Active" as const,
    ltv: ",520.00",
    initials: "AC",
    avatarClass: "bg-[var(--primary-container)] text-[var(--on-primary-container)]",
  },
  {
    name: "Global Logistics Ltd.",
    email: "billing@globallogistics.com",
    ref: "REF-10056",
    added: "Oct 22, 2023",
    status: "Active" as const,
    ltv: ",250.50",
    initials: "GL",
    avatarClass: "bg-[var(--secondary-container)] text-[var(--on-secondary-container)]",
  },
  {
    name: "Stark Industries",
    email: "tony@stark.com",
    ref: "REF-10088",
    added: "Oct 15, 2023",
    status: "Review" as const,
    ltv: ",900.00",
    initials: "ST",
    avatarClass: "bg-[var(--tertiary-fixed)] text-[var(--on-tertiary-fixed)]",
  },
];

function StatusPill({ status }: { status: (typeof customers)[number]["status"] }) {
  if (status === "Active") {
    return (
      <Badge className="rounded-full bg-[var(--success-status)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--success-status)] label-caps border-transparent hover:bg-[var(--success-status)]/10">
        Active
      </Badge>
    );
  }
  if (status === "Review") {
    return (
      <Badge className="rounded-full bg-[var(--pending-status)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--pending-status)] label-caps border-transparent hover:bg-[var(--pending-status)]/10">
        Review
      </Badge>
    );
  }
  return (
    <Badge className="rounded-full bg-[var(--failed-status)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--failed-status)] label-caps border-transparent hover:bg-[var(--failed-status)]/10">
      {status}
    </Badge>
  );
}

export default function CustomersPage() {
  return (
    <main className="mx-auto w-full max-w-[var(--container-max)] p-[var(--gutter)]">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="headline-lg text-[var(--on-surface)]">Customers</h1>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">Manage and view all customer records and payment history.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-9 gap-2 border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] font-medium text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]">
            <span className="material-symbols-outlined text-[18px]">download</span>
            Export
          </Button>
          <Button size="sm" className="h-9 gap-2 shadow-sm">
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add Customer
          </Button>
        </div>
      </div>
      <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] shadow-sm">
        <div className="flex flex-col items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] px-4 py-3 sm:flex-row">
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button variant="outline" size="sm" className="h-7 gap-2 border-[var(--border-subtle)] bg-white px-3 py-1.5 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]">
              <span className="material-symbols-outlined text-[16px]">filter_list</span>
              Filter
            </Button>
            <div className="mx-2 hidden h-4 w-px bg-[var(--border-subtle)] sm:block" aria-hidden="true" />
            <span className="body-sm text-[var(--on-surface-variant)]">2,104 Total</span>
          </div>
          <div className="relative w-full sm:w-64">
            <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]" style={{ fontSize: 16 }} aria-hidden="true">search</span>
            <Input placeholder="Search by name or email..." className="h-8 w-full bg-[var(--surface-canvas)] pl-8 pr-3 border-[var(--border-subtle)]" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table className="w-full text-left">
            <TableHeader className="sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--surface-container-low)]">
              <TableRow className="hover:bg-transparent border-b-0">
                <TableHead scope="col" className="w-12 px-4 py-3 text-center label-caps font-semibold text-[var(--on-surface-variant)]"><Checkbox aria-label="Select all customers" className="border-[var(--outline-variant)] data-[state=checked]:bg-[var(--primary)] data-[state=checked]:border-[var(--primary)]" /></TableHead>
                <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Customer</TableHead>
                <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Reference ID</TableHead>
                <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Added</TableHead>
                <TableHead scope="col" className="px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]">Status</TableHead>
                <TableHead scope="col" className="px-4 py-3 text-right label-caps font-semibold text-[var(--on-surface-variant)]">LTV</TableHead>
                <TableHead scope="col" className="w-12 px-4 py-3 label-caps font-semibold text-[var(--on-surface-variant)]"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[var(--border-subtle)] bg-[var(--surface-container-lowest)]">
              {customers.map((c) => (
                <TableRow key={c.ref} className="group hover:bg-[var(--surface-canvas)] transition-colors">
                  <TableCell className="px-4 py-3 text-center"><Checkbox aria-label={"Select " + c.name} className="border-[var(--outline-variant)] opacity-50 group-hover:opacity-100 data-[state=checked]:opacity-100 data-[state=checked]:bg-[var(--primary)] data-[state=checked]:border-[var(--primary)]" /></TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 shrink-0 rounded"><AvatarFallback className={"rounded text-xs font-semibold " + c.avatarClass}>{c.initials}</AvatarFallback></Avatar>
                      <div className="min-w-0">
                        <div className="body-md truncate font-medium text-[var(--on-surface)]">{c.name}</div>
                        <div className="body-sm truncate text-[var(--on-surface-variant)]">{c.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3"><span className="data-mono text-[var(--on-surface-variant)]">{c.ref}</span></TableCell>
                  <TableCell className="px-4 py-3 body-sm whitespace-nowrap text-[var(--on-surface-variant)]">{c.added}</TableCell>
                  <TableCell className="px-4 py-3"><StatusPill status={c.status} /></TableCell>
                  <TableCell className="px-4 py-3 text-right data-mono text-[var(--on-surface)]">{c.ltv}</TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <button type="button" aria-label={"More actions for " + c.name} className="inline-flex rounded p-1 text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)] transition-colors group-hover:text-[var(--on-surface)]">
                      <span className="material-symbols-outlined hidden md:inline" style={{ fontSize: 20 }} aria-hidden="true">more_horiz</span>
                      <span className="material-symbols-outlined md:hidden" style={{ fontSize: 20 }} aria-hidden="true">chevron_right</span>
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] px-4 py-3">
          <span className="body-sm text-[var(--on-surface-variant)]"><span className="hidden md:inline">Showing 1 to 3 of 2,104 results</span><span className="md:hidden">Showing 1 to 3 of 45 entries</span></span>
          <div className="flex items-center gap-1">
            <button type="button" disabled aria-label="Previous page" className="inline-flex rounded border border-[var(--border-subtle)] p-1 text-[var(--outline)] hover:bg-[var(--surface-container-low)] disabled:opacity-50 disabled:pointer-events-none"><span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">chevron_left</span></button>
            <button type="button" aria-label="Next page" className="inline-flex rounded border border-[var(--border-subtle)] p-1 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"><span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">chevron_right</span></button>
          </div>
        </div>
      </div>
    </main>
  );
}
