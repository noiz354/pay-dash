import { NextResponse, type NextRequest } from "next/server";
import { listMembers, membersToCsv } from "@/server/data/team";
import type { TeamRole } from "@/lib/team-roles";

// CSV export endpoint backing the team page "Export" button (ADR-0022).
// Mirrors the Members tab filters so what you see is what you export —
// same contract as /api/exports/customers.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const { rows } = await listMembers({
    q: sp.get("q") ?? "",
    role: (sp.get("role") as TeamRole | "ALL") ?? "ALL",
    status: "ALL",
    page: 1,
    pageSize: 100,
  });

  return new NextResponse(membersToCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="team-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
