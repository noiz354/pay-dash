import { z } from "zod";

import { OrganizationContextError } from "@/domain/tenancy/organization-context";
import { runMerchantOpsAgent } from "@/server/agent/agent";
import { assertSafeAgentContext, buildAgentContext } from "@/server/agent/context";
import { AgentRateLimitError, assertWithinAgentRateLimit } from "@/server/agent/rate-limit";
import { countLedgerTenants } from "@/server/data/transactions";
import { OrgContextError } from "@/server/services/org-context";
import { requireStrictOrgContext } from "@/server/services/session-org-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  organizationId: z.string().trim().min(1).max(160).optional(),
  sessionId: z.string().trim().min(1).max(160).optional(),
});

function isTenantDenied(error: unknown): boolean {
  return (
    error instanceof OrgContextError ||
    error instanceof OrganizationContextError ||
    (error instanceof Error && error.name === "OrgContextError") ||
    (error instanceof Error && error.name === "OrganizationContextError")
  );
}

/**
 * POST /api/agent/run — Merchant Operations Agent (read-only, Strands + Bedrock).
 *
 * Trusted tenant boundary (spec §8, WAVE 3 hardened):
 *   - STRICT session resolution: the demo fallback is denied (fail-closed);
 *   - the caller must hold `transaction.read` for the resolved organization;
 *   - a browser-supplied organizationId is normalized against the session and
 *     never honoured on its own (the model never supplies a tenant);
 *   - per-actor rate limit protects the Bedrock spend.
 */
export async function POST(request: Request) {
  let body: z.infer<typeof runSchema>;
  try {
    body = runSchema.parse(await request.json());
  } catch {
    return Response.json(
      { error: "Malformed payload. Expected { message: string, organizationId?: string, sessionId?: string }." },
      { status: 400 },
    );
  }

  try {
    // Session wins; strict mode refuses unauthenticated demo fallback and
    // authorizes `transaction.read` against the actor's membership roles.
    const session = await requireStrictOrgContext("transaction.read", {
      organizationId: body.organizationId ?? undefined,
    });
    const context = buildAgentContext({
      organizationId: session.organizationId,
      userId: session.userId,
      roles: session.roles,
      sessionId: body.sessionId ?? "",
      locale: "en",
      isDemoFallback: session.isDemoFallback,
    });
    // Extra safety net: unauthenticated demo answers stop the moment the
    // ledger holds more than one tenant (mirrors the payout/transaction guards).
    assertSafeAgentContext(context, countLedgerTenants());
    assertWithinAgentRateLimit(session.userId ?? session.organizationId);

    const result = await runMerchantOpsAgent({ context, message: body.message });
    return Response.json(result, { status: result.status === "completed" ? 200 : 502 });
  } catch (error) {
    if (error instanceof AgentRateLimitError) {
      return Response.json(
        { error: error.message, retryAfterSeconds: error.retryAfterSeconds },
        { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } },
      );
    }
    if (isTenantDenied(error)) {
      return Response.json({ error: error instanceof Error ? error.message : "Access denied." }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Agent request failed.";
    return Response.json({ error: message.slice(0, 300) }, { status: 500 });
  }
}
