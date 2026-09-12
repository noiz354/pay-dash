import { NextResponse, type NextRequest } from "next/server";
import { guardExport } from "@/server/services/export-guard";
import { listSubscriptions, subscriptionsToCsv } from "@/server/data/subscriptions";
import type { SubscriptionStatus } from "@/lib/subscription-status";

// CSV export endpoint backing the subscriptions page "Export" button
// (ADR-0021). Mirrors the directory filters so what you see is what you
// export — same contract as /api/exports/customers.
export async function GET(request: NextRequest) {
  // BE-004: fail-closed export guard (JRN-017)
  const guard = await guardExport(request, "report.export");
  if (!guard.ok) return guard.response;

  const sp = request.nextUrl.searchParams;
  const { rows } = await listSubscriptions({
    q: sp.get("q") ?? "",
    status: (sp.get("status") as SubscriptionStatus | "ALL") ?? "ALL",
    sort: (sp.get("sort") as "recent" | "amount") ?? "recent",
    page: 1,
    pageSize: 100,
  });

  return new NextResponse(subscriptionsToCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subscriptions-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
