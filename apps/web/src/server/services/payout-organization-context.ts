import "server-only";

/**
 * Wave 7B — the session → `OrganizationContext` seam for payout surfaces.
 *
 * Mirrors `transaction-organization-context.ts` (Wave 7A): the session answers
 * which tenant, a browser-supplied `?organizationId=` is normalized against
 * the session scope and flagged (never honoured), and there is no demo
 * fallback once the payout store holds more than one tenant.
 */

import { hasPermission, type OrganizationRole, type Permission } from "@/domain/organization/roles";
import { OrganizationContextError, parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { countPayoutTenants } from "@/server/data/payouts";
import {
  normalizeRequestedOrganization,
  transactionAccessDeniedState,
} from "./transaction-organization-context";
import { requireStrictOrgContext, resolveSessionOrgContext } from "./session-org-context";

export type ResolvedPayoutAccess = {
  readonly context: OrganizationContext;
  readonly actorId: string | null;
  readonly roles: readonly OrganizationRole[];
  /** True when the session resolver fell back to the single-tenant demo org. */
  readonly demoFallback: boolean;
  /** True when the caller *asked for* another tenant. Session won; it is audited. */
  readonly overridden: boolean;
};

function refuseMultiTenantDemo(demoFallback: boolean): void {
  if (!demoFallback) return;
  if (countPayoutTenants() > 1) {
    throw new OrganizationContextError(
      "MISSING_ORGANIZATION_CONTEXT",
      "The payout store is multi-tenant (more than one tenant holds batches); refusing to answer an unauthenticated request as the demo organization. Sign in.",
    );
  }
}

async function fromSession(organizationIdFromClient?: string): Promise<ResolvedPayoutAccess> {
  const session = await resolveSessionOrgContext({ organizationId: organizationIdFromClient });
  const context = parseOrganizationContext(session);
  refuseMultiTenantDemo(session.isDemoFallback);
  const { overridden } = normalizeRequestedOrganization(context, organizationIdFromClient, "payouts.read");
  return {
    context,
    actorId: session.userId,
    roles: session.roles,
    demoFallback: session.isDemoFallback,
    overridden,
  };
}

/** Resolve the tenant for a payout **read** (pages, detail screens). */
export async function resolvePayoutOrganizationContext(input?: { organizationId?: string | null }): Promise<ResolvedPayoutAccess> {
  try {
    return await fromSession(input?.organizationId ?? undefined);
  } catch (e) {
    if (e instanceof OrganizationContextError) throw e;
    throw new OrganizationContextError(
      "MISSING_ORGANIZATION_CONTEXT",
      "Could not resolve an organization context for this request; payout data requires one.",
    );
  }
}

/**
 * Resolve the tenant for a payout **write** and assert the permission in the
 * same step. Fail-closed: denies unauthenticated actors in strict mode, and
 * denies demo-fallback reads the moment a second tenant holds batches.
 */
export async function requirePayoutOrganizationContext(
  permission: Permission,
  input?: { organizationId?: string | null },
): Promise<ResolvedPayoutAccess> {
  const session = await requireStrictOrgContext(permission, { organizationId: input?.organizationId ?? undefined });
  const context = parseOrganizationContext(session);
  refuseMultiTenantDemo(session.isDemoFallback);
  const { overridden } = normalizeRequestedOrganization(context, input?.organizationId, `payouts.${permission}`);
  return {
    context,
    actorId: session.userId,
    roles: session.roles,
    demoFallback: session.isDemoFallback,
    overridden,
  };
}

/** Whether the resolved access may perform `permission` (UI shaping only — never enforcement). */
export function payoutAccessCan(access: ResolvedPayoutAccess, permission: Permission): boolean {
  return access.roles.some((role) => hasPermission(role, permission));
}

/** Uniform not-found mapping for refused payout access (no enumeration oracle). */
export function payoutAccessDeniedState(error: unknown): { status: "error"; message: string } {
  return transactionAccessDeniedState(error);
}

export const PAYOUT_NOT_FOUND_MESSAGE = "Payout batch not found.";
