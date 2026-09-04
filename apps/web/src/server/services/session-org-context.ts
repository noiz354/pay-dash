import "server-only";

import { authorizeOrgContext, demoOrgContext, PrismaOrgContextDb, buildOrgContext, type OrgContext } from "./org-context";
import type { Permission } from "@/domain/organization/roles";
import { loadLazyPrisma } from "@/server/repositories/prisma-runtime";

/**
 * Resolve the authenticated session's organization context (multi-tenant.
 * Authorization is always derived from the session's membership — never from
 * the browser. When there is no session or no membership table (dev/demo) the
 * resolver falls back to the single-tenant demo context so the dashboard stays
 * usable; that fallback is explicitly flagged and never used as the authority
 * in a real multi-tenant deployment.
 */
let cachedDb: PrismaOrgContextDb | null = null;

async function membershipDb(): Promise<PrismaOrgContextDb> {
  if (!cachedDb) {
    const prisma = await loadLazyPrisma();
    cachedDb = new PrismaOrgContextDb({ organizationMember: prisma?.organizationMember ?? ({} as never) });
  }
  return cachedDb;
}

export async function resolveSessionOrgContext(input?: { organizationId?: string }): Promise<OrgContext> {
  try {
    const { auth } = await import("@/lib/auth");
    const { headers } = await import("next/headers");
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id ?? null;
    if (!userId) {
      return demoOrgContext();
    }
    const db = await membershipDb();
    const memberships = await db.resolveMemberships(userId);
    return buildOrgContext(memberships, userId, input?.organizationId);
  } catch {
    // No session header, no DB, or auth not initialized → dev/demo fallback.
    return demoOrgContext();
  }
}

/**
 * Resolve the session org context and authorize the permission in one step.
 * Server actions use this so the acting org + role come from the membership and
 * never from the browser. In dev/demo this returns the OWNER demo context, so
 * the dashboard stays usable without a signed-in session; in a real multi-tenant
 * deployment it enforces the session member's role.
 */
export async function requireOrgContext(permission: Permission, input?: { organizationId?: string }): Promise<OrgContext> {
  const ctx = await resolveSessionOrgContext(input);
  authorizeOrgContext(ctx, permission);
  return ctx;
}
