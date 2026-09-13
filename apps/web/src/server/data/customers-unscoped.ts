import "server-only";

/**
 * Wave 7C — fail-closed quarantine for the customer readers that are not yet
 * tenant-scoped.
 *
 * Mirrors `payouts-unscoped.ts` (Wave 7B). Every function takes an explicit
 * `surface` naming the caller; the call is served ONLY while the customer
 * store (manual records ∪ scoped ledger tenants) holds exactly one tenant —
 * the single-tenant demo. The moment a second tenant has customers, every
 * unscoped read throws `UnscopedCustomerAccessError` and names the surface.
 *
 * `LEGACY_CUSTOMER_SURFACES` is frozen and may only shrink: scoping a surface
 * (session ctx → scoped DAL, like Q4 did for exports/MCP in 7B) removes its
 * entry. Adding an entry is a Wave-7C-plan change, not a drive-by.
 */

import {
  countCustomerTenants,
  getCustomerMetrics,
  listCustomers,
  soleCustomerOrganizationId,
  type CustomerFilters,
  type CustomerMetrics,
  type PaginatedCustomers,
} from "./customers";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";

/** The frozen set of surfaces still reading the directory unscoped. */
export const LEGACY_CUSTOMER_SURFACES = [
  "reports",
  "subscriptions",
] as const;

export type LegacyCustomerSurface = (typeof LEGACY_CUSTOMER_SURFACES)[number];

export class UnscopedCustomerAccessError extends Error {
  constructor(
    readonly surface: LegacyCustomerSurface,
    readonly tenantCount: number,
  ) {
    super(
      `Unscoped customer read by "${surface}" refused: the customer store holds more than one tenant, so there is no "the" customer directory. Scope this read (Wave 7C) — an unscoped view of a multi-tenant directory is a cross-tenant read.`,
    );
    this.name = "UnscopedCustomerAccessError";
  }
}

function refuseUnlessSingleTenant(surface: LegacyCustomerSurface): string {
  if (typeof surface !== "string" || !surface.trim()) {
    throw new TypeError("Unscoped customer access requires an explicit `surface` name (see LEGACY_CUSTOMER_SURFACES).");
  }
  const sole = soleCustomerOrganizationId();
  if (!sole) {
    throw new UnscopedCustomerAccessError(surface, countCustomerTenants());
  }
  return sole;
}

function legacyContext(surface: LegacyCustomerSurface): OrganizationContext {
  const organizationId = refuseUnlessSingleTenant(surface);
  return parseOrganizationContext({ organizationId });
}

/** The list read for derived readers. Same gate, same single-tenant assumption. */
export function legacyListCustomers(
  surface: LegacyCustomerSurface,
  filters: CustomerFilters = {},
): Promise<PaginatedCustomers> {
  // NOT `async` on purpose: the gate refusal must throw synchronously (the
  // quarantine test pins `expect(() => …).toThrow`), while the served path
  // returns the scoped promise untouched.
  return listCustomers(legacyContext(surface), filters);
}

/** Metrics for derived readers (single-tenant assumption, same gate). */
export function legacyCustomerMetrics(surface: LegacyCustomerSurface): Promise<CustomerMetrics> {
  return getCustomerMetrics(legacyContext(surface));
}
