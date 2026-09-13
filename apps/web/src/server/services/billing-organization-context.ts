import "server-only";

/**
 * Wave 7D — the session → `OrganizationContext` seam for billing surfaces
 * (subscriptions *and* invoices: one slice, one seam).
 *
 * Mirrors `customer-organization-context.ts` (Wave 7C) and
 * `payout-organization-context.ts` (Wave 7B): the session answers which tenant,
 * a browser-supplied `?organizationId=` is normalized against the session scope
 * and flagged (never honoured), and there is no demo fallback once the billing
 * stores hold more than one tenant.
 *
 * Invoices are ledger-derived, so "is this store multi-tenant?" folds the 7A
 * ledger probes in through `countInvoiceTenants()` — a tenant whose fees exist
 * only as ledger rows still owns a statement, and must not be answered as the
 * demo organization.
 */

import { hasPermission, type OrganizationRole, type Permission } from "@/domain/organization/roles";
import { OrganizationContextError, parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { countInvoiceTenants, soleInvoiceOrganizationId } from "@/server/data/invoices";
import { countSubscriptionTenants, soleSubscriptionOrganizationId } from "@/server/data/subscriptions";
import {
  normalizeRequestedOrganization,
  transactionAccessDeniedState,
} from "./transaction-organization-context";
import { requireStrictOrgContext, resolveSessionOrgContext } from "./session-org-context";

export type ResolvedBillingAccess = {
  readonly context: OrganizationContext;
  readonly actorId: string | null;
  readonly roles: readonly OrganizationRole[];
  /** True when the session resolver fell back to the single-tenant demo org. */
  readonly demoFallback: boolean;
  /** True when the caller *asked for* another tenant. Session won; it is audited. */
  readonly overridden: boolean;
};

/**
 * How many tenants hold billing records (plans ∪ invoices). Tenancy probe:
 * answers a question about the stores, never returns a plan or an invoice —
 * which is why it, and not a repository read, is what the demo refusal gates on.
 */
export function countBillingTenants(): number {
  if (countSubscriptionTenants() > 1 || countInvoiceTenants() > 1) return 2;
  const ids = new Set<string>();
  const plans = soleSubscriptionOrganizationId();
  if (plans) ids.add(plans);
  const invoices = soleInvoiceOrganizationId();
  if (invoices) ids.add(invoices);
  return ids.size;
}

function refuseMultiTenantDemo(demoFallback: boolean): void {
  if (!demoFallback) return;
  if (countBillingTenants() > 1) {
    throw new OrganizationContextError(
      "MISSING_ORGANIZATION_CONTEXT",
      "The billing stores are multi-tenant (more than one tenant holds plans or invoices); refusing to answer an unauthenticated request as the demo organization. Sign in.",
    );
  }
}

async function fromSession(organizationIdFromClient?: string): Promise<ResolvedBillingAccess> {
  const session = await resolveSessionOrgContext({ organizationId: organizationIdFromClient });
  const context = parseOrganizationContext(session);
  refuseMultiTenantDemo(session.isDemoFallback);
  const { overridden } = normalizeRequestedOrganization(context, organizationIdFromClient, "billing.read");
  return {
    context,
    actorId: session.userId,
    roles: session.roles,
    demoFallback: session.isDemoFallback,
    overridden,
  };
}

/** Resolve the tenant for a billing **read** (plan book, statement list, detail). */
export async function resolveBillingOrganizationContext(input?: {
  organizationId?: string | null;
}): Promise<ResolvedBillingAccess> {
  try {
    return await fromSession(input?.organizationId ?? undefined);
  } catch (e) {
    if (e instanceof OrganizationContextError) throw e;
    throw new OrganizationContextError(
      "MISSING_ORGANIZATION_CONTEXT",
      "Could not resolve an organization context for this request; billing data requires one.",
    );
  }
}

/**
 * Resolve the tenant for a billing **write** and assert the permission in the
 * same step. Fail-closed: denies unauthenticated actors in strict mode, and
 * denies demo-fallback access the moment a second tenant holds billing records.
 * `payInvoice` is a money mutation, so it comes through here — never through the
 * read resolver.
 */
export async function requireBillingOrganizationContext(
  permission: Permission,
  input?: { organizationId?: string | null },
): Promise<ResolvedBillingAccess> {
  const session = await requireStrictOrgContext(permission, {
    organizationId: input?.organizationId ?? undefined,
  });
  const context = parseOrganizationContext(session);
  refuseMultiTenantDemo(session.isDemoFallback);
  const { overridden } = normalizeRequestedOrganization(context, input?.organizationId, `billing.${permission}`);
  return {
    context,
    actorId: session.userId,
    roles: session.roles,
    demoFallback: session.isDemoFallback,
    overridden,
  };
}

/** Whether the resolved access may perform `permission` (UI shaping only — never enforcement). */
export function billingAccessCan(access: ResolvedBillingAccess, permission: Permission): boolean {
  return access.roles.some((role) => hasPermission(role, permission));
}

/** Uniform not-found mapping for refused billing access (no enumeration oracle). */
export function billingAccessDeniedState(error: unknown): { status: "error"; message: string } {
  return transactionAccessDeniedState(error);
}

/**
 * Wire message for a refused billing write: identical to the unknown-id path, so
 * "not yours" and "does not exist" are indistinguishable to the caller (C-5).
 */
export const BILLING_NOT_FOUND_MESSAGE = "That invoice no longer exists.";
