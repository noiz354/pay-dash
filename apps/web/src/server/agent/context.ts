import "server-only";

import {
  OrganizationContextError,
  parseOrganizationContext,
  type OrganizationContext,
} from "@/domain/tenancy/organization-context";
import type { AgentContext } from "./types";

/**
 * Trusted tenant context for the Merchant Operations Agent (spec §8-9).
 *
 * The ONLY sanctioned way to build an `AgentContext`:
 *   - the organization id comes from the authenticated session resolution
 *     (`server/services/session-org-context.ts`), never from the browser,
 *     never from the model;
 *   - a blank/missing organization id fails closed (no default);
 *   - the demo fallback is flagged and refused once the store is
 *     multi-tenant (mirrors `refuseMultiTenantDemo` in the payout guard).
 */

export type AgentContextSeed = {
  organizationId: unknown;
  userId?: string | null;
  roles?: readonly string[];
  sessionId?: string;
  requestId?: string;
  locale?: string;
  isDemoFallback?: boolean;
};

/** Fail-closed: builds the agent context or throws (never substitutes a default). */
export function buildAgentContext(seed: AgentContextSeed): AgentContext {
  const organizationId =
    typeof seed.organizationId === "string" ? seed.organizationId.trim() : "";

  if (!organizationId) {
    throw new OrganizationContextError(
      "MISSING_ORGANIZATION_CONTEXT",
      "Refusing to build an agent context without a trusted organization id. Sign in.",
    );
  }

  return {
    organizationId,
    userId: seed.userId ?? null,
    roles: seed.roles ?? [],
    requestId: seed.requestId ?? crypto.randomUUID(),
    sessionId: seed.sessionId ?? "",
    locale: seed.locale ?? "en",
    isDemoFallback: seed.isDemoFallback ?? false,
  };
}

/**
 * Mirrors the payout/transaction guards: an unauthenticated request may only
 * be served as the single-tenant demo org. The moment the store holds more
 * than one tenant, the demo fallback is refused.
 */
export function assertSafeAgentContext(context: AgentContext, tenantCount: number): void {
  if (context.isDemoFallback && tenantCount > 1) {
    throw new OrganizationContextError(
      "MISSING_ORGANIZATION_CONTEXT",
      "The store is multi-tenant; refusing to answer an unauthenticated agent request as the demo organization. Sign in.",
    );
  }
}

/** Rebuilds the repository's `OrganizationContext` for domain data functions. */
export function toOrganizationContext(context: AgentContext): OrganizationContext {
  return parseOrganizationContext({ organizationId: context.organizationId });
}
