import { NextResponse } from "next/server";
import { RECIPIENT_CSV_TEMPLATE } from "@/lib/payout-csv";

// The "Download Template" link used to be href="#". This is the schema the
// dropzone parser accepts, so the template can never drift from the parser.
export async function GET() {
  return new NextResponse(RECIPIENT_CSV_TEMPLATE, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="payout-recipients-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
