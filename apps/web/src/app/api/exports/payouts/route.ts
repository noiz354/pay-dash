import { NextResponse, type NextRequest } from "next/server";
import { batchesToCsv, listBatches } from "@/server/data/payouts";
import type { PayoutStatus } from "@/lib/payout-status";

// Backs the "Export Log" button — the batch history CSV, honouring whatever
// filters are currently in the URL so what you see is what you export.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const { rows } = await listBatches({
    q: sp.get("q") ?? "",
    status: (sp.get("status") as PayoutStatus | "ALL") ?? "ALL",
    range: (sp.get("range") as "30d" | "90d" | "12m" | "all") ?? "all",
    sort: (sp.get("sort") as "recent" | "amount" | "recipients") ?? "recent",
    page: 1,
    pageSize: 500,
  });

  return new NextResponse(batchesToCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payout-batches-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
