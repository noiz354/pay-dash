import "server-only";

/**
 * Wave 7F — the session → `OrganizationContext` seam for the identity & access
 * slice (team, settings, KYC, onboarding: one slice, one seam).
 *
 * Mirrors `billing-organization-context.ts` (7D), `customer-organization-context.ts`
 * (7C) and `payout-organization-context.ts` (7B): the session answers which
 * tenant, a browser-supplied `?organizationId=` is normalized against the
 * session scope and flagged (never honoured), and there is no demo fallback once
 * the identity stores hold more than one tenant.
 *
 * ## Why this slice needs its own seam rather than reusing another
 *
 * The demo-fallback refusal has to gate on *these* stores. A tenant can exist in
 * this app while holding no transactions, no payouts and no customers — its
 * first fact may be an invited teammate, a saved legal name, or a KYC document.
 * Folding another slice's probe in would answer "single tenant" for a process
 * where two merchants each have a roster, and then hand an unauthenticated
 * request the demo organization's staff list and API keys.
 *
 * ## What "identity" counts
 *
 * `countIdentityTenants()` folds the three stores that *hold* identity rows —
 * team ∪ settings ∪ KYC. Onboarding holds nothing (it derives a checklist from
 * other stores), so it contributes no probe of its own; a tenant that only has
 * an onboarding view is a tenant that has a profile, keys or members somewhere
 * else, and is counted there.
 *
 * Reads resolve a tenant without a permission (the team page and the settings
 * hub are visible to any signed-in member of that tenant); writes come through
 * `requireIdentityOrganizationContext(permission)` — `team.manage`,
 * `settings.manage`, `kyc.submit`, `report.export` for the CSV route. Roles are
 * per tenant, so "is this actor an Admin?" is only meaningful *after* the tenant
 * is known — the seam resolves the tenant first and answers permissions second,
 * which is the same order the DALs pin internally (spec F-13).
 */

import { hasPermission, type OrganizationRole, type Permission } from "@/domain/organization/roles";
import { OrganizationContextError, parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { countKycTenants, soleKycOrganizationId } from "@/server/data/kyc";
import { countSettingsTenants, soleSettingsOrganizationId } from "@/server/data/settings";
import { countTeamTenants, soleTeamOrganizationId } from "@/server/data/team";
import {
  normalizeRequestedOrganization,
  transactionAccessDeniedState,
} from "./transaction-organization-context";
import { requireStrictOrgContext, resolveSessionOrgContext } from "./session-org-context";

export type ResolvedIdentityAccess = {
  readonly context: OrganizationContext;
  readonly actorId: string | null;
  readonly roles: readonly OrganizationRole[];
  /** True when the session resolver fell back to the single-tenant demo org. */
  readonly demoFallback: boolean;
  /** True when the caller *asked for* another tenant. Session won; it is audited. */
  readonly overridden: boolean;
};

/**
 * How many tenants hold identity rows (members ∪ settings ∪ KYC documents).
 *
 * Tenancy probe: answers a question about the stores, never returns a member, a
 * key or a document — which is why it, and not a repository read, is what the
 * demo refusal gates on. Capped at 2 because the only question anyone asks is
 * "is there more than one?".
 */
export function countIdentityTenants(): number {
  if (countTeamTenants() > 1 || countSettingsTenants() > 1 || countKycTenants() > 1) return 2;
  const ids = new Set<string>();
  const team = soleTeamOrganizationId();
  if (team) ids.add(team);
  const settings = soleSettingsOrganizationId();
  if (settings) ids.add(settings);
  const kyc = soleKycOrganizationId();
  if (kyc) ids.add(kyc);
  return ids.size;
}

function refuseMultiTenantDemo(demoFallback: boolean): void {
  if (!demoFallback) return;
  if (countIdentityTenants() > 1) {
    throw new OrganizationContextError(
      "MISSING_ORGANIZATION_CONTEXT",
      "The identity stores are multi-tenant (more than one tenant holds members, settings or KYC documents); refusing to answer an unauthenticated request as the demo organization. Sign in.",
    );
  }
}

async function fromSession(organizationIdFromClient?: string): Promise<ResolvedIdentityAccess> {
  const session = await resolveSessionOrgContext({ organizationId: organizationIdFromClient });
  const context = parseOrganizationContext(session);
  refuseMultiTenantDemo(session.isDemoFallback);
  const { overridden } = normalizeRequestedOrganization(context, organizationIdFromClient, "identity.read");
  return {
    context,
    actorId: session.userId,
    roles: session.roles,
    demoFallback: session.isDemoFallback,
    overridden,
  };
}

/**
 * Resolve the tenant for an identity **read**: the team roster, the settings
 * hub, a merchant profile, the API-key list, the KYC checklist, onboarding.
 */
export async function resolveIdentityOrganizationContext(input?: {
  organizationId?: string | null;
}): Promise<ResolvedIdentityAccess> {
  try {
    return await fromSession(input?.organizationId ?? undefined);
  } catch (e) {
    if (e instanceof OrganizationContextError) throw e;
    throw new OrganizationContextError(
      "MISSING_ORGANIZATION_CONTEXT",
      "Could not resolve an organization context for this request; team, settings and compliance data require one.",
    );
  }
}

/**
 * Resolve the tenant for an identity **write** and assert the permission in the
 * same step. Fail-closed: denies unauthenticated actors in strict mode, and
 * denies demo-fallback access the moment a second tenant holds identity rows.
 *
 * Role changes, deactivations, key minting/revocation and KYC submissions all
 * come through here — never through the read resolver. Order matters: the tenant
 * is resolved *before* the permission is evaluated, because roles are per tenant
 * and an Admin of one organization is a stranger in another (spec P-10).
 */
export async function requireIdentityOrganizationContext(
  permission: Permission,
  input?: { organizationId?: string | null },
): Promise<ResolvedIdentityAccess> {
  const session = await requireStrictOrgContext(permission, {
    organizationId: input?.organizationId ?? undefined,
  });
  const context = parseOrganizationContext(session);
  refuseMultiTenantDemo(session.isDemoFallback);
  const { overridden } = normalizeRequestedOrganization(context, input?.organizationId, `identity.${permission}`);
  return {
    context,
    actorId: session.userId,
    roles: session.roles,
    demoFallback: session.isDemoFallback,
    overridden,
  };
}

/** Whether the resolved access may perform `permission` (UI shaping only — never enforcement). */
export function identityAccessCan(access: ResolvedIdentityAccess, permission: Permission): boolean {
  return access.roles.some((role) => hasPermission(role, permission));
}

/** Uniform not-found mapping for refused identity access (no enumeration oracle). */
export function identityAccessDeniedState(error: unknown): { status: "error"; message: string } {
  return transactionAccessDeniedState(error);
}

/**
 * Wire message for a refused identity write: identical to the unknown-id path,
 * so "not yours" and "does not exist" are indistinguishable to the caller (C-5).
 */
export const IDENTITY_NOT_FOUND_MESSAGE = "That record no longer exists.";
