import { NextResponse, type NextRequest } from "next/server";
import {
  listTransactions,
  toCsv,
  type Channel,
  type TransactionStatus,
} from "@/server/data/transactions";

// CSV export endpoint backing the "Export CSV" / "Download report" buttons.
// Mirrors the ledger filters so what you see is what you export.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const { rows } = await listTransactions({
    status: (sp.get("status") as TransactionStatus | "ALL") ?? "ALL",
    channel: (sp.get("channel") as Channel | "ALL") ?? "ALL",
    range: (sp.get("range") as "7d" | "30d" | "90d" | "all") ?? "all",
    q: sp.get("q") ?? "",
    page: 1,
    pageSize: 100,
  });

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
