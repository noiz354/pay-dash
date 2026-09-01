import { NextResponse, type NextRequest } from "next/server";
import { customersToCsv, listCustomers } from "@/server/data/customers";
import type { CustomerStatus } from "@/lib/customer-status";

// CSV export endpoint backing the customer directory "Export" button.
// Mirrors the directory filters so what you see is what you export.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const { rows } = await listCustomers({
    q: sp.get("q") ?? "",
    status: (sp.get("status") as CustomerStatus | "ALL") ?? "ALL",
    sort: (sp.get("sort") as "recent" | "ltv" | "name") ?? "recent",
    page: 1,
    pageSize: 100,
  });

  return new NextResponse(customersToCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
