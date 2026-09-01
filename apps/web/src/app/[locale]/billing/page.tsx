import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";

const invoices = [
  { id: "INV-2023-08-4421", period: "Aug 01, 2023 - Aug 31, 2023", amount: "14,200,500", status: "Paid", icon: "check_circle" },
  { id: "INV-2023-09-5102", period: "Sep 01, 2023 - Sep 30, 2023", amount: "13,050,000", status: "Pending", icon: "schedule" },
  { id: "INV-2023-07-3990", period: "Jul 01, 2023 - Jul 31, 2023", amount: "2,450,000", status: "Overdue", icon: "warning" },
];

function StatusBadge({ status, icon }: { status: string; icon: string }) {
  const cls =
    status === "Paid"
      ? "bg-[var(--success-status)]/10 text-[var(--success-status)]"
      : status === "Pending"
        ? "bg-[var(--pending-status)]/10 text-[var(--pending-status)]"
        : "bg-[var(--failed-status)]/10 text-[var(--failed-status)]";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-[12px] ${cls}`}>
      <span className="material-symbols-outlined text-[12px]" aria-hidden="true" data-weight="fill">
        {icon}
      </span>
      {status}
    </span>
  );
}

export default function BillingPage() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      {/* Breadcrumbs — billing_invoices:201-205 */}
      <nav className="flex body-sm text-[var(--outline)] items-center gap-2" aria-label="Breadcrumb">
        <Link href="/dashboard" className="hover:text-[var(--primary)] transition-colors">Enterprise</Link>
        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">chevron_right</span>
        <span className="text-[var(--on-surface)] font-medium">Billing & Invoices</span>
      </nav>

      {/* Page Header & Summary Bento — 207-236 */}
      <div className="flex flex-col xl:flex-row gap-6 justify-between items-start xl:items-end">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Billing History</h1>
          <p className="body-md text-[var(--on-surface-variant)] max-w-2xl mt-2">Review past platform service invoices and track current accruals.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
          <Card className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl p-4 flex flex-col gap-1 min-w-[200px]">
            <span className="label-caps text-[var(--outline)] uppercase">Next Invoice Date</span>
            <span className="data-mono text-[20px] font-semibold text-[var(--on-surface)] mt-1">Oct 01, 2023</span>
            <div className="flex items-center gap-1 mt-2 body-sm text-[var(--on-surface-variant)]">
              <span className="material-symbols-outlined text-[16px] text-[var(--primary)]" aria-hidden="true">event</span>
              <span>Auto-debit scheduled</span>
            </div>
          </Card>
          <Card className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl p-4 flex flex-col gap-1 min-w-[240px]">
            <span className="label-caps text-[var(--outline)] uppercase">Current Month Accrued Fees</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="body-sm text-[var(--on-surface-variant)]">IDR</span>
              <span className="data-mono text-[24px] font-bold text-[var(--on-surface)]">12,450,000</span>
            </div>
            <div className="flex items-center gap-1 mt-2 body-sm">
              <span className="material-symbols-outlined text-[16px] text-[var(--success-status)]" aria-hidden="true">trending_down</span>
              <span className="text-[var(--success-status)] font-medium">-4.2%</span>
              <span className="text-[var(--outline)] ml-1">vs last month</span>
            </div>
          </Card>
        </div>
      </div>

      {/* Data Table Container — 238-332 */}
      <Card className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-lg overflow-hidden shadow-sm p-0">
        <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--surface-bright)]">
          <Button variant="outline" className="px-3 py-1.5 border border-[var(--border-subtle)] rounded-md body-sm font-medium hover:bg-[var(--surface-container)] flex items-center gap-2 text-[var(--on-surface-variant)]">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">filter_list</span> Filter
          </Button>
          <Button className="px-3 py-1.5 bg-[var(--primary)] text-[var(--on-primary)] rounded-md body-sm font-medium hover:bg-[var(--surface-tint)] shadow-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">download</span> Export Statement
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[800px]">
            <TableHeader className="bg-[var(--surface-container)] label-caps sticky top-0 border-b border-[var(--border-subtle)]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-[var(--cell-x)] font-semibold">Invoice ID</TableHead>
                <TableHead className="px-[var(--cell-x)] font-semibold">Billing Period</TableHead>
                <TableHead className="px-[var(--cell-x)] font-semibold text-right">Amount (IDR)</TableHead>
                <TableHead className="px-[var(--cell-x)] font-semibold text-center">Status</TableHead>
                <TableHead className="px-[var(--cell-x)] font-semibold text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="body-sm divide-y divide-[var(--border-subtle)]">
              {invoices.map((inv) => (
                <TableRow key={inv.id} className="hover:bg-[var(--surface-container-low)] transition-colors group">
                  <TableCell className="px-[var(--cell-x)] py-[var(--cell-y)]">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[var(--outline)] text-[16px]" aria-hidden="true">receipt</span>
                      <Link href={`/billing/${inv.id}`} className="data-mono text-[var(--primary)] font-medium cursor-pointer hover:underline">
                        {inv.id}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="px-[var(--cell-x)] py-[var(--cell-y)] text-[var(--on-surface)]">{inv.period}</TableCell>
                  <TableCell className="px-[var(--cell-x)] py-[var(--cell-y)] text-right data-mono text-[var(--on-surface)]">{inv.amount}</TableCell>
                  <TableCell className="px-[var(--cell-x)] py-[var(--cell-y)] text-center">
                    <StatusBadge status={inv.status} icon={inv.icon} />
                  </TableCell>
                  <TableCell className="px-[var(--cell-x)] py-[var(--cell-y)] text-right">
                    <Button variant="ghost" size="icon" className="text-[var(--primary)] hover:text-[var(--surface-tint)] w-8 h-8" aria-label={`Download PDF for ${inv.id}`} title="Download PDF">
                      <span className="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </main>
  );
}
