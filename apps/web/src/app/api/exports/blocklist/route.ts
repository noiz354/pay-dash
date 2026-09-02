import { NextResponse, type NextRequest } from "next/server";
import { isBlocklistType } from "@/lib/blocklist-options";
import { blocklistToCsv, listBlocklist } from "@/server/data/blocklist";

// CSV export endpoint backing the fraud pages' "Export" button (ADR-0024).
// Mirrors the panel filters in the URL (`type`, `q`) so what you see is what
// you export — same contract as /api/exports/customers.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  // the URL carries the lowercase tab value ("card") — normalise to the enum
  const rawType = (sp.get("type") ?? "ALL").toUpperCase();
  const { rows } = await listBlocklist({
    type: isBlocklistType(rawType) ? rawType : "ALL",
    q: sp.get("q") ?? "",
    page: 1,
    pageSize: 100,
  });

  return new NextResponse(blocklistToCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="blocklist-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
