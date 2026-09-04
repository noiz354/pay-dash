import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto max-w-[1440px] p-[var(--gutter)]">
      <div className="grid gap-6">
        <div>
          <h1 className="headline-xl">Kinetic Ledger</h1>
          <p className="body-md text-[var(--on-surface-variant)]">Phase 0 scaffold — Next.js + Tailwind + Kinetic tokens. Go to locale dashboard.</p>
        </div>
        <Card>
          <CardHeader><CardTitle>Routes</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link href="/en/dashboard"><Button>Dashboard /en</Button></Link>
            <Link href="/id/dashboard"><Button variant="outline">Dashboard /id</Button></Link>
            <Link href="/ai-journal"><Button variant="outline">Gemini Journal</Button></Link>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card><CardHeader><CardTitle className="label-caps text-[var(--on-surface-variant)]">Balance</CardTitle></CardHeader><CardContent><div className="data-mono text-right text-lg">IDR 0.00</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="label-caps text-[var(--on-surface-variant)]">Transactions</CardTitle></CardHeader><CardContent><div className="data-mono text-right text-lg">0</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="label-caps text-[var(--on-surface-variant)]">Status</CardTitle></CardHeader><CardContent><span className="rounded-full bg-[var(--success-status)]/10 px-2 py-1 text-xs font-semibold text-[var(--success-status)]">TEST MODE</span></CardContent></Card>
        </div>
        <p className="body-sm text-[var(--on-surface-variant)]">Tokens: primary <span className="inline-block h-3 w-3 rounded bg-[var(--primary)] align-middle" /> #003fb1 · surface-canvas #f8fafc · amber #d97706 · data-mono right-aligned · label-caps sticky headers per DESIGN.md</p>
      </div>
    </main>
  );
}
