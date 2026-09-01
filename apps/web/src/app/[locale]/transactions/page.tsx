import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DataTable,
  DataTableContent,
  TableHeadCell,
  TableCellMono,
} from "@/components/layout/data-table";
import { listLedgerEntries } from "@/server/dal/ledger";

// HIGH fidelity — screens/desktop/transaction_ledger_desktop + mobile/transaction_ledger
// Header Export CSV + Create Payment / Metrics Total Volume +12.4% / Toolbar Selects + Input calendar hint / Table 7 cols group-hover fix

const prototypeRows = [
  {
    id: "txn_8x9a2b3c",
    ref: "txn_8x9a2b3c",
    date: "Oct 24, 14:23 UTC",
    method: "Visa \u2022\u2022\u2022\u2022 4242",
    customer: "hello@example.com",
    amount: "$1,250.00",
    status: "Succeeded",
  },
  {
    id: "txn_7y8b1c4d",
    ref: "txn_7y8b1c4d",
    date: "Oct 24, 13:45 UTC",
    method: "ACH \u2022\u2022\u2022\u2022 9012",
    customer: "acme_corp@domain.com",
    amount: "$45,000.00",
    status: "Processing",
  },
  {
    id: "txn_6z7c0d5e",
    ref: "txn_6z7c0d5e",
    date: "Oct 24, 11:12 UTC",
    method: "Mastercard \u2022\u2022\u2022\u2022 5555",
    customer: "user342@mail.net",
    amount: "$89.99",
    status: "Failed",
  },
  {
    id: "txn_5w6d9e6f",
    ref: "txn_5w6d9e6f",
    date: "Oct 23, 16:50 UTC",
    method: "Amex \u2022\u2022\u2022\u2022 1005",
    customer: "premium_sub@example.com",
    amount: "$999.00",
    status: "Succeeded",
  },
  {
    id: "txn_4v5e8f7g",
    ref: "txn_4v5e8f7g",
    date: "Oct 23, 09:15 UTC",
    method: "Visa \u2022\u2022\u2022\u2022 4242",
    customer: "hello@example.com",
    amount: "$25.00",
    status: "Refunded",
  },
];

function statusPill(status: string) {
  const s = status.toLowerCase();
  if (s === "succeeded" || s === "success" || s === "refunded") {
    return "bg-[var(--success-status)]/10 text-[var(--success-status)]";
  }
  if (s === "processing" || s === "pending") {
    return "bg-[var(--pending-status)]/10 text-[var(--pending-status)]";
  }
  return "bg-[var(--failed-status)]/10 text-[var(--failed-status)]";
}

export default async function TransactionsPage() {
  let entries: Array<{ id: string; referenceId?: string | null; amount: unknown; currency: string; status: string; createdAt: Date; description?: string | null }> = [];
  try {
    entries = (await listLedgerEntries({ take: 20 })) as unknown as typeof entries;
  } catch {
    // DB not ready — fallback to prototype rows
  }

  const rows =
    entries.length > 0
      ? entries.map((e) => {
          const d = new Date(e.createdAt);
          const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "2-digit" }) + ", " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) + " UTC";
          return {
            id: e.id,
            ref: e.referenceId ?? e.id.slice(0, 12),
            date: dateStr,
            method: e.description ?? "QRIS",
            customer: "\u2014",
            amount: Number(e.amount as unknown as number).toLocaleString("en-US", { style: "currency", currency: e.currency ?? "USD" }),
            status: e.status,
          };
        })
      : prototypeRows;

  return (
    <main className="mx-auto w-full max-w-container-max p-gutter space-y-6 bg-[var(--surface-canvas)]">
      {/* Page Header — desktop:282 flex justify-between items-end */}
      <div className="flex flex-col gap-6 pt-2">
        <div className="flex justify-between items-end gap-4">
          <div>
            <h1 className="headline-xl text-[var(--on-surface)]">Transaction Ledger</h1>
            <p className="body-md text-[var(--on-surface-variant)] mt-1">Review and manage recent processing activity.</p>
          </div>
          <div className="flex gap-3 shrink-0">
            <Button
              variant="outline"
              className="h-9 rounded border border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)] hover:bg-[var(--surface-container-low)] font-medium"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              Export CSV
            </Button>
            <Button className="h-9 rounded bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] font-semibold shadow-sm">
              Create Payment
            </Button>
          </div>
        </div>

        {/* Metrics — desktop: 3 cols Total Volume $2,450,892 +12.4% trending_up / Successful 14,239 / Failed 24 / 18 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg p-5 flex flex-col justify-between">
            <span className="label-caps text-[var(--on-surface-variant)]">Total Volume (30d)</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="headline-lg data-mono text-[var(--on-surface)]">$2,450,892.00</span>
              <span className="body-sm text-[var(--success-status)] flex items-center gap-0.5 font-medium">
                <span className="material-symbols-outlined text-[14px]">trending_up</span>
                12.4%
              </span>
            </div>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg p-5 flex flex-col justify-between">
            <span className="label-caps text-[var(--on-surface-variant)]">Successful Transactions</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="headline-lg data-mono text-[var(--on-surface)]">14,239</span>
              <span className="body-sm text-[var(--on-surface-variant)]">count</span>
            </div>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg p-5 flex flex-col justify-between">
            <span className="label-caps text-[var(--on-surface-variant)]">Failed / Pending</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="headline-lg data-mono text-[var(--failed-status)]">24</span>
              <span className="body-md text-[var(--on-surface-variant)]">/</span>
              <span className="headline-lg data-mono text-[var(--pending-status)]">18</span>
            </div>
          </div>
        </div>
      </div>

      {/* DataTable — toolbar + 7 cols + pagination — desktop:255 / 282 */}
      <DataTable className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg overflow-hidden flex flex-col">
        {/* Toolbar — Status:All Date:Last 7 Days Channel:All More filters + Filter this view Input + calendar hint */}
        <div className="flex flex-wrap gap-4 justify-between items-center p-4 border-b border-[var(--border-subtle)] bg-[var(--surface)]">
          <div className="flex flex-wrap gap-2 items-center">
            <Select defaultValue="all">
              <SelectTrigger size="sm" className="h-8 border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]">
                <SelectValue placeholder="Status: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Status: All</SelectItem>
                <SelectItem value="succeeded">Status: Succeeded</SelectItem>
                <SelectItem value="processing">Status: Processing</SelectItem>
                <SelectItem value="failed">Status: Failed</SelectItem>
                <SelectItem value="refunded">Status: Refunded</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="7d">
              <SelectTrigger size="sm" className="h-8 border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]">
                <SelectValue placeholder="Date: Last 7 Days" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Date: Last 7 Days</SelectItem>
                <SelectItem value="30d">Date: Last 30 Days</SelectItem>
                <SelectItem value="90d">Date: Last 90 Days</SelectItem>
                <SelectItem value="custom">Date: Custom</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="all">
              <SelectTrigger size="sm" className="h-8 border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]">
                <SelectValue placeholder="Channel: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Channel: All</SelectItem>
                <SelectItem value="card">Channel: Card</SelectItem>
                <SelectItem value="ach">Channel: ACH</SelectItem>
                <SelectItem value="va">Channel: Virtual Account</SelectItem>
                <SelectItem value="qris">Channel: QRIS</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-8 text-[var(--primary)] hover:bg-[var(--surface-container-low)]">
              More filters
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] text-[16px]">search</span>
              <Input
                placeholder="Filter this view..."
                className="h-8 w-full pl-8 pr-8 bg-[var(--surface-canvas)] border-[var(--outline-variant)] text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]"
              />
              <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] text-[16px]">calendar_today</span>
            </div>
          </div>
        </div>

        <DataTableContent>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--surface-container-low)] border-b border-[var(--border-subtle)]">
                <TableHeadCell className="w-12 sticky top-0 bg-[var(--surface-container-low)]">
                  <Checkbox aria-label="Select all" />
                </TableHeadCell>
                <TableHeadCell className="sticky top-0 bg-[var(--surface-container-low)]">Reference ID</TableHeadCell>
                <TableHeadCell className="sticky top-0 bg-[var(--surface-container-low)]">Date &amp; Time</TableHeadCell>
                <TableHeadCell className="sticky top-0 bg-[var(--surface-container-low)]">Method</TableHeadCell>
                <TableHeadCell className="sticky top-0 bg-[var(--surface-container-low)]">Customer</TableHeadCell>
                <TableHeadCell className="sticky top-0 bg-[var(--surface-container-low)] text-right">Amount</TableHeadCell>
                <TableHeadCell className="sticky top-0 bg-[var(--surface-container-low)] text-right">Status</TableHeadCell>
                <TableHeadCell className="w-10 sticky top-0 bg-[var(--surface-container-low)]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] body-sm">
              {rows.map((r) => (
                <tr key={r.id} className="group hover:bg-[var(--surface-container-low)]/50 transition-colors">
                  <td className="px-[var(--cell-x,16px)] py-[var(--cell-y,12px)]">
                    <Checkbox aria-label={"Select " + r.ref} />
                  </td>
                  <TableCellMono className="text-[var(--on-surface)]">{r.ref}</TableCellMono>
                  <td className="px-[var(--cell-x,16px)] py-[var(--cell-y,12px)] text-[var(--on-surface-variant)] whitespace-nowrap">{r.date}</td>
                  <td className="px-[var(--cell-x,16px)] py-[var(--cell-y,12px)] text-[var(--on-surface)] whitespace-nowrap">{r.method}</td>
                  <td className="px-[var(--cell-x,16px)] py-[var(--cell-y,12px)] text-[var(--on-surface)] whitespace-nowrap">{r.customer}</td>
                  <TableCellMono className="text-right text-[var(--on-surface)]">{r.amount}</TableCellMono>
                  <td className="px-[var(--cell-x,16px)] py-[var(--cell-y,12px)] text-right">
                    <span className={"inline-flex items-center px-2 py-0.5 rounded-full label-caps font-bold " + statusPill(r.status)}>{r.status}</span>
                  </td>
                  <td className="px-[var(--cell-x,16px)] py-[var(--cell-y,12px)] text-right w-10">
                    <button className="text-[var(--on-surface-variant)] opacity-0 group-hover:opacity-100 hover:text-[var(--on-surface)] transition-all" aria-label="More actions">
                      <span className="material-symbols-outlined text-[18px]">more_horiz</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableContent>

        {/* Pagination — Showing 1 to 5 of 14,263 Page 1 of 2853 */}
        <div className="flex justify-between items-center p-4 border-t border-[var(--border-subtle)] bg-[var(--surface)] body-sm text-[var(--on-surface-variant)]">
          <div>Showing 1 to {rows.length} of 14,263 results</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" disabled className="h-8 w-8 rounded border border-[var(--outline-variant)] bg-[var(--surface)]">
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </Button>
            <span className="px-2">Page 1 of 2853</span>
            <Button variant="outline" size="icon-sm" className="h-8 w-8 rounded border border-[var(--outline-variant)] bg-[var(--surface)] hover:bg-[var(--surface-container-low)]">
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </Button>
          </div>
        </div>
      </DataTable>
    </main>
  );
}
