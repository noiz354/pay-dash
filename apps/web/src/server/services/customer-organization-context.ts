import "server-only";

/**
 * Wave 7C — the session → `OrganizationContext` seam for customer surfaces.
 *
 * Mirrors `payout-organization-context.ts` (Wave 7B): the session answers
 * which tenant, a browser-supplied `?organizationId=` is normalized against
 * the session scope and flagged (never honoured), and there is no demo
 * fallback once the customer store holds more than one tenant.
 */

import { hasPermission, type OrganizationRole, type Permission } from "@/domain/organization/roles";
import { OrganizationContextError, parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { countCustomerTenants } from "@/server/data/customers";
import {
  normalizeRequestedOrganization,
  transactionAccessDeniedState,
} from "./transaction-organization-context";
import { requireStrictOrgContext, resolveSessionOrgContext } from "./session-org-context";

export type ResolvedCustomerAccess = {
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
  if (countCustomerTenants() > 1) {
    throw new OrganizationContextError(
      "MISSING_ORGANIZATION_CONTEXT",
      "The customer store is multi-tenant (more than one tenant holds customers); refusing to answer an unauthenticated request as the demo organization. Sign in.",
    );
  }
}

async function fromSession(organizationIdFromClient?: string): Promise<ResolvedCustomerAccess> {
  const session = await resolveSessionOrgContext({ organizationId: organizationIdFromClient });
  const context = parseOrganizationContext(session);
  refuseMultiTenantDemo(session.isDemoFallback);
  const { overridden } = normalizeRequestedOrganization(context, organizationIdFromClient, "customers.read");
  return {
    context,
    actorId: session.userId,
    roles: session.roles,
    demoFallback: session.isDemoFallback,
    overridden,
  };
}

/** Resolve the tenant for a customer **read** (pages, detail screens). */
export async function resolveCustomerOrganizationContext(input?: { organizationId?: string | null }): Promise<ResolvedCustomerAccess> {
  try {
    return await fromSession(input?.organizationId ?? undefined);
  } catch (e) {
    if (e instanceof OrganizationContextError) throw e;
    throw new OrganizationContextError(
      "MISSING_ORGANIZATION_CONTEXT",
      "Could not resolve an organization context for this request; customer data requires one.",
    );
  }
}

/**
 * Resolve the tenant for a customer **write** and assert the permission in the
 * same step. Fail-closed: denies unauthenticated actors in strict mode, and
 * denies demo-fallback reads the moment a second tenant holds customers.
 */
export async function requireCustomerOrganizationContext(
  permission: Permission,
  input?: { organizationId?: string | null },
): Promise<ResolvedCustomerAccess> {
  const session = await requireStrictOrgContext(permission, { organizationId: input?.organizationId ?? undefined });
  const context = parseOrganizationContext(session);
  refuseMultiTenantDemo(session.isDemoFallback);
  const { overridden } = normalizeRequestedOrganization(context, input?.organizationId, `customers.${permission}`);
  return {
    context,
    actorId: session.userId,
    roles: session.roles,
    demoFallback: session.isDemoFallback,
    overridden,
  };
}

/** Whether the resolved access may perform `permission` (UI shaping only — never enforcement). */
export function customerAccessCan(access: ResolvedCustomerAccess, permission: Permission): boolean {
  return access.roles.some((role) => hasPermission(role, permission));
}

/** Uniform not-found mapping for refused customer access (no enumeration oracle). */
export function customerAccessDeniedState(error: unknown): { status: "error"; message: string } {
  return transactionAccessDeniedState(error);
}

/** Wire message for a refused customer write: identical to the unknown-id path. */
export const CUSTOMER_NOT_FOUND_MESSAGE = "That customer no longer exists.";
