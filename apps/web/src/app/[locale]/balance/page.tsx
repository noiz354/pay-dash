import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const history = [
  { date: "Oct 24, 2023", time: "14:32:01 WIB", desc: "Withdrawal to BCA", icon: "arrow_upward", status: "Pending", amount: "-45.200.000,00", amountClass: "", showStrikethrough: false },
  { date: "Oct 24, 2023", time: "09:15:22 WIB", desc: "Incoming Transfer - PT Sej...", fullDesc: "Incoming Transfer - PT Sejahtera", icon: "arrow_downward", status: "Succeeded", amount: "+120.500.000,00", amountClass: "text-[var(--success-status)]", showStrikethrough: false },
  { date: "Oct 23, 2023", time: "16:45:00 WIB", desc: "Platform Fee Deduction", icon: "receipt_long", status: "Succeeded", amount: "-2.450.000,00", amountClass: "", showStrikethrough: false },
  { date: "Oct 22, 2023", time: "10:05:12 WIB", desc: "Withdrawal to Mandiri", icon: "arrow_upward", status: "Failed", amount: "-50.000.000,00", amountClass: "text-[var(--outline)]", showStrikethrough: true },
  // Mobile prototype rows
  { date: "2023-10-27 14:32", time: "", desc: "Settlement (Batch #9822)", icon: "receipt_long", status: "Settlement", amount: "+ IDR 45.500.000", amountClass: "text-emerald-600", showStrikethrough: false },
];

export default function BalancePage() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Balance & History</h1>
          <p className="body-md text-[var(--on-surface-variant)] mt-1">Manage your funds and view recent ledger movements.</p>
        </div>
        <Button variant="outline" className="hidden md:flex h-9 px-4 bg-[var(--surface)] border border-[var(--outline-variant)] shadow-sm hover:bg-[var(--surface-container-low)] items-center gap-2">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">download</span> Export CSV
        </Button>
      </div>

      {/* Mobile download button */}
      <div className="md:hidden flex justify-end">
        <Button variant="outline" size="icon" className="w-8 h-8 rounded-full bg-[var(--surface-container-high)]" aria-label="Download">
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">download</span>
        </Button>
      </div>

      {/* Top Row: Balance & Auto-Withdrawal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Balance Card — desktop: lg:col-span-2, prototype 257-288 */}
        <Card className="lg:col-span-2 bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-[var(--primary-container)]/5 rounded-full blur-2xl" aria-hidden="true" />
          <div className="relative z-10">
            <h3 className="label-caps text-[var(--on-surface-variant)] mb-2">Available Balance (IDR)</h3>
            <div className="flex items-baseline gap-2">
              <span className="headline-xl text-[var(--on-surface)]">Rp 1.240.500.000</span>
              <span className="body-md text-[var(--on-surface-variant)]">,00</span>
            </div>
            <div className="flex items-center gap-4 mt-6">
              <div>
                <p className="label-caps text-[var(--outline)] mb-1">Pending Clearance</p>
                <p className="data-mono text-[var(--on-surface-variant)]">Rp 45.200.000,00</p>
              </div>
              <div className="w-px h-8 bg-[var(--border-subtle)]" />
              <div>
                <p className="label-caps text-[var(--outline)] mb-1">Last Payout</p>
                <p className="data-mono text-[var(--on-surface-variant)]">Today, 09:00 AM</p>
              </div>
            </div>
            {/* Mobile variant amount fallback */}
            <div className="lg:hidden mt-4 data-mono text-[40px] leading-tight font-bold tracking-tight">IDR 1.005.870.599</div>
          </div>
          <div className="flex gap-3 mt-8 relative z-10">
            <Button className="h-10 px-6 bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--surface-tint)] shadow-sm flex-1 justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add_circle</span> Top Up
            </Button>
            <Button variant="outline" className="h-10 px-6 bg-[var(--surface)] border border-[var(--outline-variant)] hover:bg-[var(--surface-container-low)] flex-1 justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">account_balance_wallet</span> Withdraw
            </Button>
          </div>
        </Card>

        {/* Auto-Withdrawal — 289-316 */}
        <Card className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl p-6 shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-full bg-[var(--secondary-container)] flex items-center justify-center text-[var(--on-secondary-container)]">
              <span className="material-symbols-outlined" aria-hidden="true">autorenew</span>
            </div>
            <Switch defaultChecked aria-label="Toggle Auto-Withdrawal" />
          </div>
          <h3 className="headline-md text-[var(--on-surface)] mb-2">Auto-Withdrawal</h3>
          <p className="body-sm text-[var(--on-surface-variant)] mb-4">Automatically transfer available funds to your designated bank account on a schedule.</p>
          <div className="mt-auto bg-[var(--surface)] p-3 rounded border border-[var(--border-subtle)]">
            <div className="flex justify-between items-center mb-1">
              <span className="label-caps text-[var(--outline)]">Schedule</span>
              <span className="body-sm font-medium text-[var(--on-surface)]">Daily</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="label-caps text-[var(--outline)]">Destination</span>
              <span className="body-sm font-medium text-[var(--on-surface)] truncate max-w-[120px]" title="BCA ****4910">BCA ****4910</span>
            </div>
          </div>
          <Button variant="ghost" className="w-full mt-4 h-8 text-[var(--primary)] hover:text-[var(--surface-tint)] gap-1">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">edit</span> Configure
          </Button>
          <a href="#" className="hidden body-sm font-medium text-[var(--primary)] hover:underline items-center gap-1 mt-2 justify-center">
            Set up schedule <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_forward</span>
          </a>
        </Card>
      </div>

      {/* Recent Movements — 318-444 */}
      <Card className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl shadow-sm overflow-hidden flex flex-col p-0">
        <div className="p-4 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--surface-canvas)]">
          <h3 className="headline-md text-[var(--on-surface)]">Recent Movements</h3>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:flex items-center">
              <span className="material-symbols-outlined text-[var(--outline)] text-[16px] absolute left-2" aria-hidden="true">filter_list</span>
              <Select defaultValue="all">
                <SelectTrigger className="h-8 pl-8 pr-8 bg-[var(--surface)] border border-[var(--outline-variant)] w-[140px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="topup">Top Up</SelectItem>
                  <SelectItem value="withdrawal">Withdrawal</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="h-8 px-3 bg-[var(--surface)] border border-[var(--outline-variant)] hidden sm:flex">View All</Button>
            <Button variant="ghost" className="sm:hidden text-[var(--primary)] body-sm">View all</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-[var(--surface-container-low)] border-b border-[var(--border-subtle)]">
                <th className="py-3 px-[var(--cell-x)] label-caps text-[var(--on-surface-variant)] w-1/4">Date & Time</th>
                <th className="py-3 px-[var(--cell-x)] label-caps text-[var(--on-surface-variant)] w-1/4">Description</th>
                <th className="py-3 px-[var(--cell-x)] label-caps text-[var(--on-surface-variant)] w-1/6">Status</th>
                <th className="py-3 px-[var(--cell-x)] label-caps text-[var(--on-surface-variant)] text-right w-1/4">Amount (IDR)</th>
              </tr>
            </thead>
            <tbody className="body-sm text-[var(--on-surface)]">
              {history.slice(0,4).map((r, i) => (
                <tr key={i} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-canvas)] transition-colors group h-12">
                  <td className="py-2 px-[var(--cell-x)]">
                    <div className="flex flex-col">
                      <span>{r.date}</span>
                      <span className="text-[var(--on-surface-variant)] text-[11px]">{r.time}</span>
                    </div>
                  </td>
                  <td className="py-2 px-[var(--cell-x)]">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[var(--surface-container-highest)] flex items-center justify-center text-[var(--on-surface-variant)]">
                        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">{r.icon}</span>
                      </div>
                      <span className="font-medium truncate max-w-[200px]" title={r.fullDesc ?? r.desc}>{r.desc}</span>
                    </div>
                  </td>
                  <td className="py-2 px-[var(--cell-x)]">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${r.status === "Succeeded" ? "bg-[var(--success-status)]/10 text-[var(--success-status)] border-[var(--success-status)]/20" : r.status === "Pending" ? "bg-[var(--pending-status)]/10 text-[var(--pending-status)] border-[var(--pending-status)]/20" : r.status === "Failed" ? "bg-[var(--failed-status)]/10 text-[var(--failed-status)] border-[var(--failed-status)]/20" : "bg-[var(--surface-variant)] text-[var(--on-surface-variant)] border-[var(--outline-variant)]"}`}>{r.status}</span>
                  </td>
                  <td className={`py-2 px-[var(--cell-x)] text-right data-mono ${r.amountClass}`}>
                    {r.showStrikethrough ? <span className="line-through">{r.amount}</span> : r.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
