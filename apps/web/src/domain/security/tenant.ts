/**
 * Wave 6 — the tenant scope primitive (INV-T1 / INV-T2).
 *
 * `server/services/org-context.ts` already answers *who the actor is* and
 * *what they may do*. It does not answer *which tenant's rows this query may
 * touch* — and today it cannot, because the data functions it guards
 * (`getLedgerRows()`, `getPayoutBatches()`, `listAuditEvents()`) take no
 * organization at all. Authorization without scoping is a lock on a door in a
 * building with no walls.
 *
 * This module is the wall. Two rules, and the asymmetry between them is
 * deliberate:
 *
 *   READS of a foreign tenant return **∅**, never an error.
 *     A 403 on a specific id confirms that the id exists — an enumeration
 *     oracle. "Not found" and "not yours" must be indistinguishable.
 *
 *   WRITES to a foreign tenant **throw** and are audited.
 *     There is no benign reason to write across a tenant boundary; silence
 *     would let a bug corrupt another tenant's book quietly.
 */

export class TenantIsolationError extends Error {
  constructor(
    readonly code: "CROSS_TENANT_WRITE" | "MISSING_SCOPE" | "PROVIDER_TENANT_GAP",
    readonly detail: { surface: string; actorOrg: string; requestedOrg: string },
    message: string,
  ) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

/**
 * A server-derived tenant scope. The `readonly` brand exists so a plain object
 * literal built from `request.query.orgId` cannot be passed where a scope is
 * required without going through `tenantScope()` — which only server code that
 * has already resolved a session should call.
 */
export type TenantScope = {
  readonly organizationId: string;
  readonly __tenantScope: true;
};

export function tenantScope(organizationId: string): TenantScope {
  const id = organizationId?.trim();
  if (!id) {
    throw new TenantIsolationError(
      "MISSING_SCOPE",
      { surface: "tenantScope", actorOrg: "", requestedOrg: String(organizationId) },
      "A tenant scope requires a non-empty organization id resolved from the session.",
    );
  }
  return { organizationId: id, __tenantScope: true };
}

/** Anything that carries an owning organization. */
export type TenantOwned = { readonly organizationId: string };

export function belongsToScope(scope: TenantScope, record: TenantOwned): boolean {
  // Fail-closed: a missing or empty scope must throw (MISSING_SCOPE), never
  // evaluate to false and never crash with a TypeError. Silence here would let
  // an unscoped call path look tenant-safe while touching every tenant's rows.
  const actorOrg = (scope as TenantScope | undefined | null)?.organizationId;
  if (typeof actorOrg !== 'string' || actorOrg.trim() === '') {
    throw new TenantIsolationError(
      'MISSING_SCOPE',
      { surface: 'belongsToScope', actorOrg: '', requestedOrg: record?.organizationId ?? 'unknown' },
      'Refusing to evaluate tenant membership without a session-derived tenant scope.',
    );
  }
  return record.organizationId === scope.organizationId;
}

/**
 * Filter a collection down to the scope. The only correct way to build a list
 * response: never "filter in the UI", never "trust the query".
 */
export function scopeRecords<T extends TenantOwned>(scope: TenantScope, records: readonly T[]): T[] {
  return records.filter((r) => belongsToScope(scope, r));
}

/**
 * Resolve a single record within a scope.
 *
 * Returns `null` for both "does not exist" and "belongs to someone else" — the
 * caller cannot tell the difference, and neither can an attacker probing ids.
 */
export function scopeRecord<T extends TenantOwned>(scope: TenantScope, record: T | null | undefined): T | null {
  if (!record) return null;
  return belongsToScope(scope, record) ? record : null;
}

/**
 * Guard a write. Throws on any cross-tenant attempt.
 *
 * `surface` is required and ends up in the audit entry, because "a cross-tenant
 * write was blocked" is only actionable if you know which endpoint tried it.
 */
export function assertTenantMatch(scope: TenantScope, record: TenantOwned, surface: string): void {
  if (!belongsToScope(scope, record)) {
    throw new TenantIsolationError(
      "CROSS_TENANT_WRITE",
      { surface, actorOrg: scope.organizationId, requestedOrg: record.organizationId },
      `Refusing a cross-tenant write on ${surface}: actor is scoped to ${scope.organizationId} but the record belongs to ${record.organizationId}.`,
    );
  }
}

/**
 * Normalize a *browser-supplied* organization id against the session scope.
 *
 * The rule is not "reject if different" — it is "the session always wins".
 * A request that names another tenant is answered from the actor's own scope,
 * and the attempt is reported so it can be audited.
 */
export function resolveRequestedScope(
  scope: TenantScope,
  requestedOrganizationId: string | null | undefined,
): { scope: TenantScope; overridden: boolean } {
  if (!requestedOrganizationId || requestedOrganizationId === scope.organizationId) {
    return { scope, overridden: false };
  }
  return { scope, overridden: true };
}

/** Shape of the audit entry a denied attempt should produce. */
export type TenantDenialEvent = {
  readonly action: "TENANT_ISOLATION_DENIED";
  readonly surface: string;
  readonly actorOrg: string;
  readonly requestedOrg: string;
  readonly at: string;
};

export function tenantDenialEvent(
  surface: string,
  scope: TenantScope,
  requestedOrg: string,
  at: Date = new Date(),
): TenantDenialEvent {
  return {
    action: "TENANT_ISOLATION_DENIED",
    surface,
    actorOrg: scope.organizationId,
    requestedOrg,
    at: at.toISOString(),
  };
}
