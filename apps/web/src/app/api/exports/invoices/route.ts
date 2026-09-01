import { NextResponse, type NextRequest } from "next/server";
import { invoicesToCsv, listInvoices } from "@/server/data/invoices";
import type { InvoiceStatus } from "@/lib/invoice-status";

// Statement export backing the "Export Statement" button; mirrors the invoice
// filters currently in the URL so what you see is what you export.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const { rows } = await listInvoices({
    q: sp.get("q") ?? "",
    status: (sp.get("status") as InvoiceStatus | "ALL") ?? "ALL",
    range: (sp.get("range") as "3m" | "6m" | "12m" | "all") ?? "all",
    sort: (sp.get("sort") as "recent" | "amount" | "due") ?? "recent",
    page: 1,
    pageSize: 100,
  });

  return new NextResponse(invoicesToCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="statement-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
