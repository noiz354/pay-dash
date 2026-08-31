import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-[1440px] p-[var(--gutter)]">
      <h1 className="headline-xl">Dashboard — Kinetic Ledger</h1>
      <p className="body-sm text-[var(--on-surface-variant)]">Server Component by default; prototype: screens/desktop/dashboard_home_desktop + screens/mobile/dashboard_home</p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle className="label-caps text-[var(--on-surface-variant)]">Total Volume</CardTitle></CardHeader><CardContent><div className="data-mono text-right">IDR 12,340,000.00</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="label-caps text-[var(--on-surface-variant)]">Pending</CardTitle></CardHeader><CardContent><div className="data-mono text-right">IDR 540,000.00</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="label-caps text-[var(--on-surface-variant)]">Success Rate</CardTitle></CardHeader><CardContent><div className="data-mono text-right">98.2%</div></CardContent></Card>
      </div>
      {/* ponytail: table density demo — label-caps sticky, data-mono right-aligned */}
      <Card className="mt-6 overflow-hidden">
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--surface-container)]">
              <tr className="label-caps text-[var(--on-surface-variant)]">
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              <tr><td className="data-mono px-4 py-3">txn_001</td><td className="data-mono px-4 py-3 text-right">IDR 1,000,000.00</td><td className="px-4 py-3"><span className="rounded-full bg-[var(--success-status)]/10 px-2 py-1 text-xs font-semibold text-[var(--success-status)]">Succeeded</span></td></tr>
              <tr><td className="data-mono px-4 py-3">txn_002</td><td className="data-mono px-4 py-3 text-right">IDR 250,000.00</td><td className="px-4 py-3"><span className="rounded-full bg-[var(--pending-status)]/10 px-2 py-1 text-xs font-semibold text-[var(--pending-status)]">Pending</span></td></tr>
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
