import { NextResponse } from "next/server";
import { guardExport, UNRESOLVED_ORGANIZATION_ID } from "@/server/services/export-guard";
import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { getBatch, recipientsToCsv } from "@/server/data/payouts";

// Per-batch recipient export — reconciliation and re-upload of failed rows.
//
// Wave 7B Q4 — tenant-bound: same contract as the batch-history export. A
// foreign id is indistinguishable from a missing one (404), so the endpoint
// cannot be used to probe which batch ids exist in another tenant.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  // BE-004: fail-closed export guard
  const guard = await guardExport(_request, "report.export");
  if (!guard.ok) return guard.response;
  if (guard.organizationId === UNRESOLVED_ORGANIZATION_ID) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const ctx = parseOrganizationContext({ organizationId: guard.organizationId });

  const { id } = await params;
  const batch = await getBatch(ctx, id);
  if (!batch) return new NextResponse("Batch not found", { status: 404 });

  return new NextResponse(recipientsToCsv(batch), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${batch.id}-recipients.csv"`,
      "Cache-Control": "private, no-store",
      "Vary": "Cookie",
    },
  });
}
