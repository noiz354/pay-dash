import "server-only";

/**
 * Wave 7B — the unscoped-payout quarantine.
 *
 * @deprecated Every surface here is Wave 7C work in waiting. Nothing new may
 * import this module: `payouts-structural.test.ts` (Q-2) fails CI when the
 * consumer set grows, and the list only ever shrinks — one module per wave,
 * each getting its own tenant-scoped DAL and its own cross-tenant tests.
 *
 * ## Why this file exists at all
 *
 * Payouts is the second vertical slice of tenant isolation. Converting the
 * payout ledger left the *derived* readers (balance, audit, command-center,
 * handoff, finance snapshot, report builder) plus the not-yet-wired surfaces
 * (payout export route, MCP payout tools) reading `getPayoutBatches()` — a
 * process-wide view. Giving each of them a tenant is Wave 7C/7D + Q4 work;
 * inventing a default tenant is the defect this wave exists to remove.
 *
 * ## The third option: fail closed
 *
 * This module may only answer while the payout store holds **exactly one
 * batch-holding tenant**. As soon as a second tenant holds batches, every
 * unscoped reader throws instead of widening its view, naming the surface
 * that tried. So the interim state is not "leaky but documented" — it is
 * "safe for a single-tenant demo deployment, and loud the moment that stops
 * being true".
 *
 * The `surface` argument is mandatory for the same reason: a crash that says
 * "unscoped payout access refused" is noise; one that says "…by `audit`" is
 * a work item. Do not get comfortable here.
 */

import {
  countPayoutTenants,
  getPayoutBatches,
  getPayoutsOverview,
  listBatches,
  solePayoutOrganizationId,
  type BatchFilters,
  type PaginatedBatches,
  type PayoutBatch,
  type PayoutsOverview,
} from "./payouts";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";

/** The frozen set of surfaces still reading the payout ledger unscoped. */
export const LEGACY_PAYOUT_SURFACES = [
  "audit",
  "balance",
  "command-center",
  "finance-snapshot",
  "handoff",
  "reports",
] as const;

export type LegacyPayoutSurface = (typeof LEGACY_PAYOUT_SURFACES)[number];

export class UnscopedPayoutAccessError extends Error {
  constructor(
    readonly surface: LegacyPayoutSurface,
    readonly tenantCount: number,
    message: string,
  ) {
    super(message);
    this.name = "UnscopedPayoutAccessError";
  }
}

function refuseUnlessSingleTenant(surface: LegacyPayoutSurface): string {
  if (typeof surface !== "string" || !surface.trim()) {
    throw new TypeError("Unscoped payout access requires an explicit `surface` name (see LEGACY_PAYOUT_SURFACES).");
  }
  const sole = solePayoutOrganizationId();
  if (!sole) {
    throw new UnscopedPayoutAccessError(
      surface,
      countPayoutTenants(),
      `Unscoped payout read by "${surface}" refused: the payout store holds more than one tenant, so there is no "the" payout ledger. Scope this read (Wave 7C/7D) — an unscoped view of a multi-tenant payout ledger is a cross-tenant read.`,
    );
  }
  return sole;
}

function legacyContext(surface: LegacyPayoutSurface): OrganizationContext {
  const organizationId = refuseUnlessSingleTenant(surface);
  return parseOrganizationContext({ organizationId });
}

/** Batches for the derived readers. See the module docblock for the gate. */
export function legacyPayoutBatches(surface: LegacyPayoutSurface): PayoutBatch[] {
  return getPayoutBatches(legacyContext(surface));
}

/** One batch for derived readers (export-by-id, MCP detail). Same gate. */
export function legacyGetPayoutBatch(surface: LegacyPayoutSurface, id: string): PayoutBatch | null {
  const ctx = legacyContext(surface);
  const needle = typeof id === "string" ? id.trim().toLowerCase() : "";
  if (!needle) return null;
  return getPayoutBatches(ctx).find((b) => b.id.toLowerCase() === needle) ?? null;
}

/**
 * The list read for derived readers. Same gate, same single-tenant assumption.
 */
export async function legacyListBatches(
  surface: LegacyPayoutSurface,
  filters: BatchFilters = {},
): Promise<PaginatedBatches> {
  // `async` on purpose: a refusal must reject the promise an `await` caller is
  // already holding, not throw synchronously out of a `.then` chain.
  return listBatches(legacyContext(surface), filters);
}

/** Overview for derived readers (single-tenant assumption, same gate). */
export async function legacyPayoutsOverview(surface: LegacyPayoutSurface): Promise<PayoutsOverview> {
  return getPayoutsOverview(legacyContext(surface));
}
