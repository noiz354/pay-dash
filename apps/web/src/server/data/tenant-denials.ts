import "server-only";

import type { TenantDenialEvent } from "@/domain/security/tenant";

/**
 * Wave 7A — audited denied writes.
 *
 * `domain/security/tenant.ts` defines the denial *event shape*
 * (`tenantDenialEvent`) but no store: the audit module is derived-only.
 * This ring store records every denied cross-tenant attempt (foreign write,
 * mismatched client org claim, blocked provider read) so a refused write is
 * observable, bounded, and testable. Production target: persist via the audit
 * pipeline (ADR-0026); the in-memory seam matches the other data modules.
 */
const MAX_EVENTS = 200;

const globalStore = globalThis as unknown as { __kineticTenantDenials?: TenantDenialEvent[] };

function store(): TenantDenialEvent[] {
  if (!globalStore.__kineticTenantDenials) globalStore.__kineticTenantDenials = [];
  return globalStore.__kineticTenantDenials;
}

/** Record a denied cross-tenant attempt. Never throws. */
export function recordTenantDenial(event: TenantDenialEvent): void {
  const rows = store();
  rows.unshift(event);
  if (rows.length > MAX_EVENTS) rows.length = MAX_EVENTS;
}

/** Read-only view (copies) for surfaces that render recent denials. */
export function listTenantDenials(): TenantDenialEvent[] {
  return store().map((e) => ({ ...e }));
}

/** Test seam — clear recorded denials between cases. */
export function clearTenantDenials(): void {
  store().length = 0;
}
