import { NextResponse } from "next/server";
import { guardExport } from "@/server/services/export-guard";
import { getBatch, recipientsToCsv } from "@/server/data/payouts";

// Per-batch recipient export — reconciliation and re-upload of failed rows.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  // BE-004: fail-closed export guard
  const guard = await guardExport(_request, "report.export");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const batch = await getBatch(id);
  if (!batch) return new NextResponse("Batch not found", { status: 404 });

  return new NextResponse(recipientsToCsv(batch), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${batch.id}-recipients.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
