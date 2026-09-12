/**
 * Wave 7A — the canonical organization context (spec §2, C-1..C-7).
 *
 * Wave 6 built the *policy* (`domain/security/tenant.ts`: reads return ∅,
 * writes throw) but almost nothing could use it, because the data functions it
 * guards accept no organization at all. This module is the missing half: the
 * **shape** every scoped boundary must be handed, and the only sanctioned way
 * to build one.
 *
 * Why this is a separate module rather than a re-use of `OrgContext`:
 * `server/services/org-context.ts` answers *who the actor is* and *what they
 * may do* — it is a session/authorization object, it carries roles, and it
 * knows about the dev/demo fallback. A repository does not need any of that,
 * and giving a repository an object it could mine for authority is how
 * "the UI checked, so the query didn't have to" happens. A repository gets
 * exactly one field, and cannot do anything with it except scope a query.
 *
 * Two invariants, and both are the reason this file exists:
 *
 *   1. **There is no default.** `parseOrganizationContext` never substitutes a
 *      fallback: an empty, blank or non-string organization id is an error, not
 *      `DEFAULT_DEMO_ORG`. A function that *requires* this type cannot be called
 *      by accident.
 *   2. **It carries nothing else.** A context built here has exactly one key, so
 *      a browser payload shaped like `{ organizationId, roles: ["OWNER"] }`
 *      cannot be laundered into an authority by being passed through.
 */

import {
  TenantIsolationError,
  assertTenantMatch,
  belongsToScope,
  tenantScope,
  type TenantScope,
} from "@/domain/security/tenant";

/** Anything that carries an owner can be checked against a context. */
export type OrganizationOwned = { readonly organizationId: string };

/**
 * The canonical contract (spec §2). One field, readonly, and required by every
 * transaction read and write.
 */
export type OrganizationContext = {
  readonly organizationId: string;
};

export type OrganizationContextErrorCode = "MISSING_ORGANIZATION_CONTEXT" | "INVALID_ORGANIZATION_CONTEXT";

export class OrganizationContextError extends Error {
  constructor(
    readonly code: OrganizationContextErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OrganizationContextError";
  }
}

/**
 * Validate and narrow an unknown value to a context.
 *
 * Accepts anything with a usable `organizationId` (a session `OrgContext`, a
 * `guardExport()` result, a test fixture) and returns a frozen single-key
 * object. Anything else throws — there is deliberately no `defaultOrganization`
 * parameter, because a default is the bug this contract exists to prevent.
 */
export function parseOrganizationContext(value: unknown): OrganizationContext {
  if (value === null || value === undefined) {
    throw new OrganizationContextError(
      "MISSING_ORGANIZATION_CONTEXT",
      "This data boundary requires an explicit organization context; there is no default organization.",
    );
  }
  const raw = (value as { organizationId?: unknown }).organizationId;
  if (typeof raw !== "string") {
    throw new OrganizationContextError(
      "INVALID_ORGANIZATION_CONTEXT",
      `An organization context requires a string organizationId, received ${raw === undefined ? "undefined" : typeof raw}.`,
    );
  }
  const organizationId = raw.trim();
  if (!organizationId) {
    throw new OrganizationContextError(
      "INVALID_ORGANIZATION_CONTEXT",
      "An organization context requires a non-empty organizationId; refusing to fall back to a demo tenant.",
    );
  }
  return Object.freeze({ organizationId });
}

/**
 * The boundary guard used by routes, actions and tools: `null`/`undefined` is a
 * distinct error so "we could not resolve a tenant" stays diagnosable instead of
 * collapsing into "you sent a weird id".
 */
export function requireOrganizationContext(value: unknown): OrganizationContext {
  if (value === null || value === undefined) {
    throw new OrganizationContextError(
      "MISSING_ORGANIZATION_CONTEXT",
      "This operation requires an explicit organization context; none was resolved from the session.",
    );
  }
  return parseOrganizationContext(value);
}

export function sameOrganization(context: OrganizationContext, other: OrganizationOwned): boolean {
  return context.organizationId === other.organizationId;
}

export function organizationOf<T extends OrganizationOwned>(record: T): string {
  return record.organizationId;
}

/**
 * Bridge to the Wave 6 policy engine (C-7). The context is the shape at the
 * boundary; `TenantScope` stays the thing the policy speaks, so there is one
 * implementation of "reads ∅, writes throw" in the codebase, not two.
 */
export function tenantScopeFor(context: OrganizationContext): TenantScope {
  const validated = parseOrganizationContext(context);
  return tenantScope(validated.organizationId);
}

/**
 * Scope a record for a read: `null` for "absent" and for "not yours", through
 * the same function every other surface uses.
 */
export function readWithinOrganization<T extends OrganizationOwned>(context: OrganizationContext, record: T | null | undefined): T | null {
  if (!record) return null;
  const scope = tenantScopeFor(context);
  return belongsToScope(scope, record) ? record : null;
}

/**
 * Guard a write. Throws the Wave 6 `TenantIsolationError` (never a soft return)
 * so a cross-tenant mutation is impossible to ignore at the call site, and the
 * surface name lands in the audit entry.
 */
export function assertSameOrganization<T extends OrganizationOwned>(
  context: OrganizationContext,
  record: T,
  surface: string,
): void {
  const scope = tenantScopeFor(context);
  try {
    assertTenantMatch(scope, record, surface);
  } catch (e) {
    // Preserve the policy error type — callers map it to a uniform not-found.
    if (e instanceof TenantIsolationError) throw e;
    throw e;
  }
}
