import "server-only";

import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { hasPermission, type OrganizationRole, type Permission } from "@/domain/organization/roles";

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
 * membership resolves. NEVER the source of truth in a multi-tenant deployment.
 */
export function demoOrgContext(userId: string | null = null): OrgContext {
  return { organizationId: DEFAULT_DEMO_ORG, roles: ["OWNER"], userId, isDemoFallback: true };
}

/** Build an org context from a resolved membership set (multi-tenant). */
export function buildOrgContext(memberships: OrgMembership[], userId: string | null, organizationId?: string): OrgContext {
  if (memberships.length === 0) {
    return demoOrgContext(userId);
  }
  const scoped = organizationId ? memberships.find((m) => m.organizationId === organizationId) : memberships[0];
  if (!scoped) {
    // The user is authenticated but not a member of the requested org → deny
    // (never cross-org). Fall back to demo only when no org was requested.
    if (!organizationId) return demoOrgContext(userId);
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
    roles: roles.length ? roles : ["OWNER"],
  };
}
