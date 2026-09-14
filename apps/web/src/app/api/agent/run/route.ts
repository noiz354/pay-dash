import { z } from "zod";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { runMerchantOpsAgent } from "@/server/agent/agent";
import { assertSafeAgentContext, buildAgentContext } from "@/server/agent/context";
import { countLedgerTenants } from "@/server/data/transactions";
import { resolveSessionOrgContext } from "@/server/services/session-org-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  organizationId: z.string().trim().min(1).max(160).optional(),
  sessionId: z.string().trim().min(1).max(160).optional(),
});

/**
 * POST /api/agent/run — Merchant Operations Agent (WAVE 1-4: read-only).
 *
 * Trusted tenant boundary (spec §8): the organization id is resolved from the
 * authenticated session, never from the browser, and never from the model.
 * The single-tenant demo fallback is refused once the ledger holds more than
 * one tenant (same rule as the payout/transaction guards).
 */
export async function POST(request: Request) {
  let body: z.infer<typeof runSchema>;
  try {
    const parsed = await request.json();
    body = runSchema.parse(parsed);
  } catch {
    return Response.json(
      { error: "Malformed payload. Expected { message: string, organizationId?: string, sessionId?: string }." },
      { status: 400 },
    );
  }

  try {
    // Session wins; a browser-supplied organizationId is normalized against
    // the session scope and never honoured on its own.
    const session = await resolveSessionOrgContext({
      organizationId: body.organizationId ?? undefined,
    });
    const organizationContext = parseOrganizationContext(session);
    const context = buildAgentContext({
      organizationId: organizationContext.organizationId,
      userId: session.userId,
      roles: session.roles,
      sessionId: body.sessionId ?? "",
      locale: "en",
      isDemoFallback: session.isDemoFallback,
    });
    assertSafeAgentContext(context, countLedgerTenants());

    const result = await runMerchantOpsAgent({ context, message: body.message });
    return Response.json(result, { status: result.status === "completed" ? 200 : 502 });
  } catch (error) {
    if (error instanceof Error && error.name === "OrganizationContextError") {
      return Response.json({ error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Agent request failed.";
    return Response.json({ error: message.slice(0, 300) }, { status: 500 });
  }
}
