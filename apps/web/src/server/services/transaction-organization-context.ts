import "server-only";

/**
 * Wave 7A — the session → `OrganizationContext` seam for transaction surfaces.
 *
 * This is the only place a transaction page, action, route or tool is allowed
 * to learn *which tenant* it is talking about. Three properties, each of them a
 * defect that existed before this wave:
 *
 *   1. **The session answers, the browser does not.** A `?organizationId=` on the
 *      query string is normalized against the resolved scope and *flagged*
 *      (`overridden: true`, audited) instead of honoured. `resolveRequestedScope`
 *      from the Wave 6 primitive is what enforces this, so the rule is the same
 *      one every other surface already inherits.
 *   2. **No demo fallback in a multi-tenant world.** Dev/preview builds resolve the
 *      single-tenant demo context (that is how the dashboard stays usable without
 *      a session, and `AUTH_ENFORCED` decides when it is allowed at all). The
 *      moment the ledger holds more than one tenant, "the demo tenant" stops
 *      being a safe answer and this resolver refuses it. That is the difference
 *      between a documented limitation and a live leak.
 *   3. **A context is required, not assumed.** Every function that reaches the
 *      transaction DAL goes through here, so "we forgot to scope it" is a
 *      compile error at the DAL rather than a runtime surprise.
 */

import { hasPermission, type OrganizationRole, type Permission } from "@/domain/organization/roles";
import { OrganizationContextError, parseOrganizationContext, tenantScopeFor, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { resolveRequestedScope, TenantIsolationError } from "@/domain/security/tenant";
import { countLedgerTenants } from "@/server/data/transactions";
import { recordTenantDenial } from "./tenant-denial";
import { requireStrictOrgContext, resolveSessionOrgContext } from "./session-org-context";

export type ResolvedTransactionAccess = {
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
  if (countLedgerTenants() > 1) {
    throw new OrganizationContextError(
      "MISSING_ORGANIZATION_CONTEXT",
      "The ledger is multi-tenant (more than one tenant has rows); refusing to answer an unauthenticated request as the demo organization. Sign in.",
    );
  }
}

/**
 * Flag (and discard) a browser-supplied organization id. The session's scope is
 * always the answer; the attempt is recorded so a probing client is visible in
 * the audit trail even though the response cannot reveal anything.
 */
export function normalizeRequestedOrganization(
  context: OrganizationContext,
  requestedOrganizationId: string | null | undefined,
  surface: string,
): { context: OrganizationContext; overridden: boolean } {
  // Blank/whitespace is "not supplied", not "supplied-but-different": an empty
  // query param is a form field left alone, and flagging it would train whoever
  // reads the audit log to ignore it.
  const requested = typeof requestedOrganizationId === "string" ? requestedOrganizationId.trim() : "";
  const { overridden } = resolveRequestedScope(tenantScopeFor(context), requested || null);
  if (overridden) {
    recordTenantDenial({
      surface: `${surface}.scope-override`,
      actorOrganizationId: context.organizationId,
      requestedOrganizationId: String(requestedOrganizationId ?? ""),
      resourceId: null,
    });
  }
  return { context, overridden };
}

async function fromSession(organizationIdFromClient?: string): Promise<ResolvedTransactionAccess> {
  const session = await resolveSessionOrgContext({ organizationId: organizationIdFromClient });
  const context = parseOrganizationContext(session);
  refuseMultiTenantDemo(session.isDemoFallback);
  const { overridden } = normalizeRequestedOrganization(context, organizationIdFromClient, "transactions.read");
  return {
    context,
    actorId: session.userId,
    roles: session.roles,
    demoFallback: session.isDemoFallback,
    overridden,
  };
}

/**
 * Resolve the tenant for a transaction **read** (page, streamed table, detail
 * screen). Authorization for reads stays where it is today (the edge gate plus
 * per-item authority); this answers scoping only.
 */
export async function resolveTransactionOrganizationContext(input?: { organizationId?: string | null }): Promise<ResolvedTransactionAccess> {
  try {
    return await fromSession(input?.organizationId ?? undefined);
  } catch (e) {
    if (e instanceof OrganizationContextError) throw e;
    throw new OrganizationContextError(
      "MISSING_ORGANIZATION_CONTEXT",
      "Could not resolve an organization context for this request; transaction data requires one.",
    );
  }
}

/**
 * Resolve the tenant for a transaction **write** or an **export**, and assert the
 * permission in the same step. Fail-closed: `requireStrictOrgContext` denies an
 * unauthenticated actor in strict mode, and the multi-tenant demo refusal denies
 * it in dev mode the moment a second tenant exists.
 */
export async function requireTransactionOrganizationContext(
  permission: Permission,
  input?: { organizationId?: string | null },
): Promise<ResolvedTransactionAccess> {
  const session = await requireStrictOrgContext(permission, { organizationId: input?.organizationId ?? undefined });
  const context = parseOrganizationContext(session);
  refuseMultiTenantDemo(session.isDemoFallback);
  const { overridden } = normalizeRequestedOrganization(context, input?.organizationId, `transactions.${permission}`);
  return {
    context,
    actorId: session.userId,
    roles: session.roles,
    demoFallback: session.isDemoFallback,
    overridden,
  };
}

/** Whether the resolved access may perform `permission` (UI shaping only — never enforcement). */
export function accessCan(access: ResolvedTransactionAccess, permission: Permission): boolean {
  return access.roles.some((role) => hasPermission(role, permission));
}

/**
 * The uniform answer for a refused transaction access (spec §4).
 *
 * A cross-tenant write and a genuinely missing id must read identically to the
 * client, otherwise the endpoint is an enumeration oracle: "not found" for one
 * and "not yours" for the other tells an attacker which ids exist. Permission
 * failures are *not* collapsed into that message — a client that may not refund
 * at all is told so, because that answer reveals nothing about any row.
 */
export function transactionAccessDeniedState(error: unknown): { status: "error"; message: string } {
  if (error instanceof TenantIsolationError) {
    return { status: "error", message: NOT_FOUND_MESSAGE };
  }
  if (error instanceof OrganizationContextError) {
    return { status: "error", message: "No organization context is available for this request." };
  }
  const message = error instanceof Error ? error.message : "";
  if (!message || /not found/i.test(message)) return { status: "error", message: NOT_FOUND_MESSAGE };
  return { status: "error", message };
}

export const NOT_FOUND_MESSAGE = "Transaction not found.";

/** Map a thrown access error onto an HTTP response for a route handler. */
export function transactionAccessDeniedResponse(error: unknown, status = 404): Response {
  const state = transactionAccessDeniedState(error);
  const notFound = state.message === NOT_FOUND_MESSAGE;
  return new Response(JSON.stringify(notFound ? { error: "not_found" } : { error: state.message }), {
    status: notFound ? status : 403,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
