import { NextResponse } from "next/server";
import { invoiceStatementCsv } from "@/server/data/invoices";

// Single-invoice statement backing the per-row download button.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const csv = await invoiceStatementCsv(decodeURIComponent(id));
  if (!csv) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${decodeURIComponent(id)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
