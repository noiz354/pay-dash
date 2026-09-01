import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const rows = [
  { id: "inv_8x9a2b1c", status: "Settled" as const, email: "sarah.jenkins@acmecorp.com", amount: ",250.00" },
  { id: "inv_3k4m5n6p", status: "Pending" as const, email: "finance@globex.io", amount: "2,000.00" },
  { id: "inv_9q8w7e6r", status: "Expired" as const, email: "michael.scott@dundermifflin.com", amount: "50.00" },
  { id: "inv_2z3x4c5v", status: "Settled" as const, email: "billing@starkindustries.com", amount: "5,000.00" },
];

function StatusBadge({ status }: { status: typeof rows[number]["status"] }) {
  if (status === "Settled") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--secondary-container)]/30 px-2 py-0.5 text-xs font-medium text-[var(--tertiary)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--tertiary)]" aria-hidden="true" />
        Settled
      </span>
    );
  }
  if (status === "Pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-variant)] px-2 py-0.5 text-xs font-medium text-[var(--on-surface-variant)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--outline)]" aria-hidden="true" />
        Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--error-container)]/50 px-2 py-0.5 text-xs font-medium text-[var(--on-error-container)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--error)]" aria-hidden="true" />
      Expired
    </span>
  );
}

export default function PaymentLinksPage() {
  return (
    <main className="mx-auto w-full max-w-[var(--container-max)] p-[var(--gutter)] space-y-0">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Payment Links</h1>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">Create and manage single and multiple payment links.</p>
        </div>
        <Button aria-label="Create Link" className="w-full justify-center gap-2 bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] shadow-sm sm:w-auto">
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add</span>
          Create Link
        </Button>
      </div>

      <div className="mb-6 border-b border-[var(--outline-variant)]">
        <nav aria-label="Tabs" className="-mb-px flex gap-8">
          <a aria-current="page" href="#" className="whitespace-nowrap border-b-2 border-[var(--primary)] px-1 py-4 text-sm font-medium text-[var(--primary)] headline-md">
            Single Links
          </a>
          <a href="#" className="whitespace-nowrap border-b-2 border-transparent px-1 py-4 text-sm font-medium text-[var(--on-surface-variant)] hover:border-[var(--outline-variant)] hover:text-[var(--on-surface)] transition-colors headline-md">
            Multiple Links
          </a>
        </nav>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--surface-variant)] bg-[var(--surface-container-lowest)]">
        <div className="flex items-center justify-between border-b border-[var(--surface-variant)] bg-[var(--surface-bright)] p-4">
          <div className="relative w-full max-w-sm">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--outline)] text-[20px]" aria-hidden="true">search</span>
            <Input placeholder="Search by ID or Email" aria-label="Search by ID or Email" className="h-9 w-full bg-[var(--surface-container-lowest)] pl-10 pr-4 border-[var(--outline-variant)] placeholder:text-[var(--outline-variant)] focus-visible:border-[var(--primary)] focus-visible:ring-1 focus-visible:ring-[var(--primary)]" />
          </div>
          <Button variant="outline" size="icon" aria-label="Filter" className="ml-4 h-9 w-9 shrink-0 border-[var(--outline-variant)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]">
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">filter_list</span>
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table className="w-full text-left">
            <TableHeader className="sticky top-0 bg-[var(--surface-container-low)] label-caps">
              <TableRow className="border-b border-[var(--surface-variant)] hover:bg-transparent">
                <TableHead scope="col" className="w-1/4 px-4 py-3 label-caps font-semibold uppercase tracking-wider text-[var(--on-surface-variant)]">External ID</TableHead>
                <TableHead scope="col" className="w-1/6 px-4 py-3 label-caps font-semibold uppercase tracking-wider text-[var(--on-surface-variant)]">Status</TableHead>
                <TableHead scope="col" className="w-1/3 px-4 py-3 label-caps font-semibold uppercase tracking-wider text-[var(--on-surface-variant)]">Payer Email</TableHead>
                <TableHead scope="col" className="w-1/4 px-4 py-3 text-right label-caps font-semibold uppercase tracking-wider text-[var(--on-surface-variant)]">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[var(--surface-variant)]">
              {rows.map((r) => (
                <TableRow key={r.id} className="group cursor-pointer transition-colors hover:bg-[var(--surface-container-low)]/50">
                  <TableCell className="px-4 py-3 data-mono text-[var(--on-surface)]">{r.id}</TableCell>
                  <TableCell className="px-4 py-3"><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="max-w-[200px] truncate px-4 py-3 body-md text-[var(--on-surface-variant)]">{r.email}</TableCell>
                  <TableCell className="px-4 py-3 text-right data-mono text-[var(--on-surface)]">{r.amount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--surface-variant)] bg-[var(--surface-container-lowest)] p-4">
          <span className="body-sm text-[var(--on-surface-variant)]">Showing 1 to 5 of 24 results</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" disabled aria-label="Previous page" className="h-8 w-8 rounded-md border-[var(--outline-variant)] text-[var(--outline)] disabled:opacity-50">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_left</span>
            </Button>
            <Button variant="outline" size="icon" aria-label="Next page" className="h-8 w-8 rounded-md border-[var(--outline-variant)] text-[var(--on-surface)] hover:bg-[var(--surface-container-high)]">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_right</span>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
