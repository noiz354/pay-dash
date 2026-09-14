import "server-only";

import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { hasPermission, type OrganizationRole, type Permission } from "@/domain/organization/roles";
import { UNAUTHENTICATED_ORG, demoOrgFallbackPermitted } from "@/lib/demo-org-policy";

/**
 * Organization-context plumbing (multi-tenant authz).
 *
 * Authorization is always resolved from the authenticated membership — the
 * signed-in user's role within the active organization — never from the
 * browser. An `OrgContext` pairs the org id with the actor's roles; `authorize`
 * checks the least-privilege RBAC catalog. When no session/membership is
 * present (dev/demo, no DB) the resolver falls back to the single-tenant
 * `DEFAULT_DEMO_ORG`/OWNER default so the dashboard stays usable, but that
 * fallback is explicitly flagged (`isDemoFallback`) and never used for a real
 * multi-tenant deployment.
 */

/** A user's role within one organization. */
export type OrgMembership = {
  userId: string;
  organizationId: string;
  roles: OrganizationRole[];
};

/** Resolves the memberships that authorize an actor in an org (never browser-supplied). */
export interface OrgContextDb {
  /** Resolve the roles a user holds in a specific organization. */
  resolveMembership(organizationId: string, userId: string): Promise<OrgMembership | null>;
  /** Resolve every org a user belongs to (for a session → org mapping). */
  resolveMemberships(userId: string): Promise<OrgMembership[]>;
}

export interface OrgContext {
  organizationId: string;
  roles: OrganizationRole[];
  userId: string | null;
  /** True when the context is the single-tenant dev/demo fallback (no session). */
  isDemoFallback: boolean;
}

export class OrgContextError extends Error {
  constructor(
    readonly code: "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "OrgContextError";
  }
}

/** Authorization guard over an org context. Throws FORBIDDEN on a denied action. */
export function authorizeOrgContext(ctx: OrgContext, permission: Permission): void {
  if (!ctx.roles.some((role) => hasPermission(role, permission))) {
    throw new OrgContextError("FORBIDDEN", `Actor is not authorized for ${permission} in ${ctx.organizationId}`);
  }
}

/** Whether the actor holds a given permission in an org context. */
export function canOrgContext(ctx: OrgContext, permission: Permission): boolean {
  return ctx.roles.some((role) => hasPermission(role, permission));
}

/**
 * The single-tenant dev/demo fallback. Used when no authenticated session or
 * membership resolves AND `demoOrgFallbackPermitted()` says this deployment may
 * serve it. NEVER the source of truth in a multi-tenant deployment.
 *
 * Callers outside a test should go through `unverifiedOrgContext()`, which makes
 * the permission decision; calling this directly grants OWNER.
 */
export function demoOrgContext(userId: string | null = null): OrgContext {
  return { organizationId: DEFAULT_DEMO_ORG, roles: ["OWNER"], userId, isDemoFallback: true };
}

/**
 * The context for a request that could not be authenticated when the demo
 * fallback is not permitted (audit finding S-01).
 *
 * Two properties matter, and both are load-bearing:
 *   - `roles: []` → `authorizeOrgContext` throws for every permission, so no
 *     write is authorized.
 *   - `organizationId: UNAUTHENTICATED_ORG` → a sentinel matching no tenant, so
 *     scoped *reads* return nothing. An empty role list alone is not sufficient:
 *     the seeded ledger is tagged `org_demo`, so a context carrying that id
 *     would still satisfy the tenant predicate and return the whole dataset.
 *
 * `isDemoFallback` stays true so the existing fail-closed checks
 * (`requireStrictOrgContext`, `guardExport`) keep treating it as unauthenticated.
 */
export function deniedOrgContext(userId: string | null = null): OrgContext {
  return { organizationId: UNAUTHENTICATED_ORG, roles: [], userId, isDemoFallback: true };
}

/**
 * The single decision point for "no session resolved". Returns the OWNER demo
 * context where this deployment is allowed to serve it, and a denied context
 * everywhere else.
 */
export function unverifiedOrgContext(userId: string | null = null, input?: { previewBypass?: boolean }): OrgContext {
  return demoOrgFallbackPermitted(input) ? demoOrgContext(userId) : deniedOrgContext(userId);
}

/**
 * Build an org context from a resolved membership set (multi-tenant).
 *
 * A signed-in user with no memberships is NOT an owner of the demo organization.
 * That used to be the answer (`memberships.length === 0` → `demoOrgContext`),
 * which meant the sign-up flow — creating a `User` and no `OrganizationMember` —
 * handed every new registrant OWNER over `org_demo` and the seeded ledger that
 * belongs to nobody. It is now the same decision as an unauthenticated request:
 * the demo org where this deployment permits it, a denied context otherwise.
 */
export function buildOrgContext(
  memberships: OrgMembership[],
  userId: string | null,
  organizationId?: string,
  input?: { previewBypass?: boolean },
): OrgContext {
  if (memberships.length === 0) {
    return unverifiedOrgContext(userId, input);
  }
  const scoped = organizationId ? memberships.find((m) => m.organizationId === organizationId) : memberships[0];
  if (!scoped) {
    // The user is authenticated but not a member of the requested org → deny
    // (never cross-org). Fall back only when no org was requested.
    if (!organizationId) return unverifiedOrgContext(userId, input);
    throw new OrgContextError("FORBIDDEN", `User is not a member of organization ${organizationId}`);
  }
  return { organizationId: scoped.organizationId, roles: scoped.roles, userId, isDemoFallback: false };
}

/* ---------------------------------------------------------------------- */
/* Membership stores                                                     */
/* ---------------------------------------------------------------------- */

/** In-memory membership store (dev/test). Seed memberships explicitly. */
export class InMemoryOrgContextDb implements OrgContextDb {
  private readonly members = new Map<string, OrgMembership>();
  seed(membership: OrgMembership): void {
    this.members.set(`${membership.organizationId}:${membership.userId}`, membership);
  }
  async resolveMembership(organizationId: string, userId: string): Promise<OrgMembership | null> {
    return this.members.get(`${organizationId}:${userId}`) ?? null;
  }
  async resolveMemberships(userId: string): Promise<OrgMembership[]> {
    return [...this.members.values()].filter((m) => m.userId === userId);
  }
}

/** Prisma-backed `OrganizationMember` membership store (lazy, unknown-cast). */
export class PrismaOrgContextDb implements OrgContextDb {
  constructor(private readonly prisma: { organizationMember: unknown }) {}

  async resolveMembership(organizationId: string, userId: string): Promise<OrgMembership | null> {
    const client = this.prisma.organizationMember as {
      findFirst(args: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
    };
    const row = await client.findFirst({ where: { organizationId, userId, status: "ACTIVE" } });
    return row ? mapMembership(row) : null;
  }

  async resolveMemberships(userId: string): Promise<OrgMembership[]> {
    const client = this.prisma.organizationMember as {
      findMany(args: { where: Record<string, unknown> }): Promise<Array<Record<string, unknown>>>;
    };
    const rows = await client.findMany({ where: { userId, status: "ACTIVE" } });
    return rows.map(mapMembership);
  }
}

function mapMembership(row: Record<string, unknown>): OrgMembership {
  const raw = String(row.role).split(",").map((s) => s.trim()).filter(Boolean);
  const roles: OrganizationRole[] = raw.filter((r): r is OrganizationRole =>
    ["OWNER", "FINANCE_ADMIN", "FINANCE_OPERATOR", "DEVELOPER", "ANALYST", "COMPLIANCE_ANALYST", "RISK_ANALYST", "SUPPORT"].includes(r),
  );
  return {
    userId: String(row.userId),
    organizationId: String(row.organizationId),
    // Fail closed. An unrecognized or empty role column used to be read as
    // OWNER, so a corrupt or partially-migrated membership row silently granted
    // the highest role in the catalogue. An empty list authorizes nothing.
    roles,
  };
}
