import "server-only";

import { authorizeOrgContext, PrismaOrgContextDb, buildOrgContext, demoOrgContext, deniedOrgContext, unverifiedOrgContext, type OrgContext } from "./org-context";
import { DEFAULT_DEMO_ORG as DEMO_ORGANIZATION_ID } from "@/domain/payments/runtime-defaults";
import { demoOrgFallbackPermitted } from "@/lib/demo-org-policy";
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

/** Whether the incoming request presented the preview bypass (see `src/proxy.ts`). */
async function requestHasPreviewBypass(): Promise<boolean> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return h.get("x-preview-bypass") === "1";
  } catch {
    return false;
  }
}

/**
 * The context for a request with no resolvable session.
 *
 * Audit finding S-01: this used to return `demoOrgContext()` — OWNER of
 * `org_demo` — unconditionally, on both the "no session" and the "auth threw"
 * branches. Because `src/proxy.ts` only checked that a session cookie *existed*,
 * a request carrying `better-auth.session_token=GARBAGE` reached this function,
 * fell into the catch, and was granted OWNER over the seeded ledger. Every app
 * route rendered; 14 were confirmed returning HTTP 200 with real data.
 *
 * The decision now belongs to `demoOrgFallbackPermitted()`. Where a deployment
 * may serve the demo org (local dev, `AUTH_ENFORCED=off`, Playwright, an explicit
 * `PAYDASH_ENABLE_DEMO_ORG=true`) behaviour is unchanged. Everywhere else the
 * caller gets a denied context: no roles, and an organization id that matches no
 * tenant, so scoped reads return nothing rather than the demo dataset.
 *
 * In `off`/`preview` mode an E2E persona cookie may still select which role the
 * fallback resolves to (see `./test-persona`). Strict mode never consults it, so
 * a production request can never choose its own roles.
 */
async function unauthenticatedContext(): Promise<OrgContext> {
  const previewBypass = await requestHasPreviewBypass();
  if (!demoOrgFallbackPermitted({ previewBypass })) return deniedOrgContext();

  const { resolvePersonaFromCookies } = await import("./test-persona");
  const persona = await resolvePersonaFromCookies();
  if (!persona) return demoOrgContext();
  return {
    organizationId: DEMO_ORGANIZATION_ID,
    roles: persona.roles,
    userId: persona.actorId,
    // Still a fallback: no real membership backs it, so `requireStrictOrgContext`
    // keeps refusing to treat it as authenticated.
    isDemoFallback: true,
  };
}

export async function resolveSessionOrgContext(input?: { organizationId?: string }): Promise<OrgContext> {
  const previewBypass = await requestHasPreviewBypass();
  try {
    const { auth } = await import("@/lib/auth");
    const { headers } = await import("next/headers");
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id ?? null;
    if (!userId) {
      return unauthenticatedContext();
    }
    const db = await membershipDb();
    const memberships = await db.resolveMemberships(userId);
    return buildOrgContext(memberships, userId, input?.organizationId, { previewBypass });
  } catch {
    // No session header, no DB, or auth not initialized. This is the branch a
    // forged or stale cookie lands in, so it goes through the same policy as an
    // absent session rather than defaulting to OWNER.
    return unverifiedOrgContext(null, { previewBypass });
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

/**
 * BE-001/BE-003/BE-004 strict variant: fail-closed.
 * In strict mode (default), a demo fallback (no session) is denied — not OWNER.
 * Use this for money-movement and export guards where demo fallback must not authorize.
 * Respects AUTH_ENFORCED=off|preview (preview allows demo when x-preview-bypass header is present — checked via next/headers).
 */
export async function requireStrictOrgContext(permission: Permission, input?: { organizationId?: string }): Promise<OrgContext> {
  const raw = process.env.AUTH_ENFORCED;
  const mode = raw === "off" || raw === "0" || raw === "false" ? "off" : raw === "preview" ? "preview" : "strict";
  if (mode === "off") {
    // Allow demo fallback when explicitly off (dev/demo parity)
    const ctx = await resolveSessionOrgContext(input);
    // Still authorize permission (OWNER demo passes)
    const { authorizeOrgContext } = await import("./org-context");
    authorizeOrgContext(ctx, permission);
    return ctx;
  }
  if (mode === "preview") {
    try {
      const { headers } = await import("next/headers");
      const h = await headers();
      if (h.get("x-preview-bypass") === "1") {
        const ctx = await resolveSessionOrgContext(input);
        authorizeOrgContext(ctx, permission);
        return ctx;
      }
    } catch {}
  }
  // Strict: no demo fallback
  const ctx = await resolveSessionOrgContext(input);
  if (ctx.isDemoFallback) {
    const { OrgContextError } = await import("./org-context");
    throw new OrgContextError("FORBIDDEN", `Authentication required for ${permission}`);
  }
  authorizeOrgContext(ctx, permission);
  return ctx;
}

