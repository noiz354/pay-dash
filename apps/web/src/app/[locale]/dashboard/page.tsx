import { Link } from "@/i18n/navigation";
import { MetricCard } from "@/components/layout/metric-card";
import { DataTable, DataTableContent, TableHeadCell, TableCellMono } from "@/components/layout/data-table";
import { Hero3DWrapper } from "@/components/three/hero-wrapper";
import { AnalyticsChart } from "@/components/dashboard/analytics-chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6 pb-12">
      {/* Welcome Section — screens/desktop/dashboard_home_desktop:228-240 */}
      <section className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Welcome back, Sarah</h1>
          <p className="body-md text-[var(--on-surface-variant)] mt-1">Here&apos;s what&apos;s happening with your accounts today.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-[var(--border-subtle)] bg-[var(--surface)] hover:bg-[var(--surface-container-low)]">Download Report</Button>
          <Link href="/transactions">
            <Button className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] flex items-center gap-2 whitespace-nowrap">
              <span className="material-symbols-outlined text-[18px] shrink-0" aria-hidden="true">add</span> <span>New Transaction</span>
            </Button>
          </Link>
        </div>
      </section>

      {/* Bento Grid — screens/desktop/dashboard_home_desktop:242-349 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Setup Progress — lg:col-span-4 */}
        <Card className="lg:col-span-4 bg-[var(--surface)] border-[var(--border-subtle)] p-5 flex flex-col shadow-sm min-w-0 overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <h3 className="headline-md text-[var(--on-surface)]">Setup Progress</h3>
            <span className="label-caps text-[var(--primary)] bg-[var(--primary-container)]/10 px-2 py-0.5 rounded">60%</span>
          </div>
          <div className="w-full bg-[var(--surface-container-high)] rounded-full h-1.5 mb-6">
            <div className="bg-[var(--primary)] h-1.5 rounded-full" style={{ width: "60%" }} aria-valuenow={60} aria-valuemin={0} aria-valuemax={100} role="progressbar" />
          </div>
          <div className="space-y-4 flex-1 min-w-0">
            <div className="flex gap-3 items-start min-w-0">
              <span className="material-symbols-outlined text-[var(--success-status)] text-[20px] mt-0.5 shrink-0" aria-hidden="true">check_circle</span>
              <p className="body-sm font-medium text-[var(--on-surface-variant)] line-through break-words min-w-0">Verify Business Details</p>
            </div>
            <div className="flex gap-3 items-start min-w-0">
              <span className="material-symbols-outlined text-[var(--success-status)] text-[20px] mt-0.5 shrink-0" aria-hidden="true">check_circle</span>
              <p className="body-sm font-medium text-[var(--on-surface-variant)] line-through break-words min-w-0">Connect Bank Account</p>
            </div>
            <div className="flex gap-3 items-start bg-[var(--surface-container-low)] p-2 rounded -mx-2 border border-[var(--primary)]/20 min-w-0 overflow-hidden">
              <span className="material-symbols-outlined text-[var(--primary)] text-[20px] mt-0.5 shrink-0" aria-hidden="true">radio_button_unchecked</span>
              <div className="min-w-0 flex-1">
                <p className="body-sm font-medium text-[var(--on-surface)] break-words">Configure Routing Rules</p>
                <p className="body-sm text-[var(--on-surface-variant)] text-[12px] mt-0.5 break-words">Set up intelligent payment routing to optimize costs.</p>
              </div>
            </div>
            <div className="flex gap-3 items-start min-w-0">
              <span className="material-symbols-outlined text-[var(--outline)] text-[20px] mt-0.5 shrink-0" aria-hidden="true">radio_button_unchecked</span>
              <p className="body-sm font-medium text-[var(--on-surface)] break-words min-w-0">Enable Webhooks</p>
            </div>
          </div>
        </Card>

        {/* Metrics Group — lg:col-span-8 */}
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm flex flex-col justify-between">
            <div>
              <p className="label-caps text-[var(--on-surface-variant)] mb-1">Total Volume</p>
              <h4 className="data-mono text-[28px] font-bold text-[var(--on-surface)] leading-none">$1.24M</h4>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="flex items-center gap-1 text-[var(--success-status)] bg-[var(--success-status)]/10 px-1.5 py-0.5 rounded data-mono text-[11px] whitespace-nowrap">
                <span className="material-symbols-outlined text-[14px] shrink-0" aria-hidden="true">trending_up</span> +12.5%
              </span>
              <span className="body-sm text-[12px] text-[var(--on-surface-variant)]">vs last month</span>
            </div>
          </Card>
          <Card className="bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm flex flex-col justify-between">
            <div>
              <p className="label-caps text-[var(--on-surface-variant)] mb-1">Active Subscriptions</p>
              <h4 className="data-mono text-[28px] font-bold text-[var(--on-surface)] leading-none">8,402</h4>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="flex items-center gap-1 text-[var(--success-status)] bg-[var(--success-status)]/10 px-1.5 py-0.5 rounded data-mono text-[11px] whitespace-nowrap">
                <span className="material-symbols-outlined text-[14px] shrink-0" aria-hidden="true">trending_up</span> +4.2%
              </span>
              <span className="body-sm text-[12px] text-[var(--on-surface-variant)]">vs last month</span>
            </div>
          </Card>
          <Card className="bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm flex flex-col justify-between">
            <div>
              <p className="label-caps text-[var(--on-surface-variant)] mb-1">Failed Transactions</p>
              <h4 className="data-mono text-[28px] font-bold text-[var(--on-surface)] leading-none">0.8%</h4>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="flex items-center gap-1 text-[var(--failed-status)] bg-[var(--failed-status)]/10 px-1.5 py-0.5 rounded data-mono text-[11px] whitespace-nowrap">
                <span className="material-symbols-outlined text-[14px] shrink-0" aria-hidden="true">trending_up</span> +0.1%
              </span>
              <span className="body-sm text-[12px] text-[var(--on-surface-variant)]">vs last month</span>
            </div>
          </Card>

          {/* Quick Actions Grid — spans 8 col area */}
          <div className="sm:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-4 mt-2">
            {[
              { label: "Create Invoice", icon: "receipt_long", href: "/billing" },
              { label: "Add Customer", icon: "person_add", href: "/customers" },
              { label: "Payouts", icon: "account_balance", href: "/payouts/bulk" },
              { label: "API Keys", icon: "api", href: "/settings/api-keys" },
            ].map((a) => (
              <Link key={a.label} href={a.href} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg p-4 flex flex-col items-center justify-center gap-2 hover:bg-[var(--surface-container-low)] hover:border-[var(--primary)]/50 group transition-colors min-w-0">
                <span className="material-symbols-outlined text-[var(--on-surface-variant)] group-hover:text-[var(--primary)] shrink-0" aria-hidden="true">{a.icon}</span>
                <span className="body-sm font-medium text-[var(--on-surface)] text-center break-words">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <Hero3DWrapper />

      {/* Transaction Analytics — Area chart with gradient, IDR scale, tooltips, loading/empty states */}
      <AnalyticsChart />

      {/* DataTable — label-caps sticky, data-mono right-aligned — fixed AMOUNTSTATUS merge */}
      <DataTable className="mt-6">
        <DataTableContent>
          <table className="w-full text-sm table-fixed min-w-[480px]">
            <thead className="sticky top-0 bg-[var(--surface-container-low)]">
              <tr className="label-caps text-[var(--on-surface-variant)]">
                <TableHeadCell className="w-[160px]">ID</TableHeadCell>
                <TableHeadCell className="w-[140px] text-right">Amount</TableHeadCell>
                <TableHeadCell className="w-[120px]">Status</TableHeadCell>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              <tr><TableCellMono>txn_001</TableCellMono><TableCellMono className="text-right">IDR 1,000,000.00</TableCellMono><td className="px-[var(--cell-x)] py-[var(--cell-y)]"><span className="rounded-full bg-[var(--success-status)]/10 px-2 py-1 text-xs font-semibold text-[var(--success-status)]">Succeeded</span></td></tr>
              <tr><TableCellMono>txn_002</TableCellMono><TableCellMono className="text-right">IDR 250,000.00</TableCellMono><td className="px-[var(--cell-x)] py-[var(--cell-y)]"><span className="rounded-full bg-[var(--pending-status)]/10 px-2 py-1 text-xs font-semibold text-[var(--pending-status)]">Pending</span></td></tr>
            </tbody>
          </table>
        </DataTableContent>
      </DataTable>
    </main>
  );
}
