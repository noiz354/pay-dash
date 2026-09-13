import "server-only";

/**
 * Wave 7F — the unscoped-team quarantine.
 *
 * @deprecated Every surface here is Wave 7E work in waiting. Nothing new may
 * import this module: `identity-structural.test.ts` (FS-4) fails CI when the
 * consumer set grows, and the list only ever shrinks — one module per wave,
 * each getting its own tenant-scoped DAL and its own cross-tenant tests.
 *
 * ## Why this file exists at all
 *
 * Identity & access is the fourth vertical slice of tenant isolation. Scoping
 * `team.ts` left one *derived* reader — the audit log, which turns team and
 * API-key rows into configuration events — reading `listMembers()` with no
 * tenant. Audit is a Wave 7E derived surface over four unscoped owners
 * (ledger, payouts, webhooks, identity); giving it a tenant means retrofitting
 * every owner it reads at once, which the no-mega-diff rule forbids inside this
 * slice. So the read is quarantined here instead of being silently widened.
 *
 * ## The third option: fail closed
 *
 * This module may only answer while the team store holds **exactly one
 * member-holding tenant**. As soon as a second tenant holds members, every
 * unscoped reader throws instead of widening its view, naming the surface that
 * tried. So the interim state is not "leaky but documented" — it is "safe for a
 * single-tenant demo deployment, and loud the moment that stops being true".
 *
 * The `surface` argument is mandatory for the same reason: a crash that says
 * "unscoped team access refused" is noise; one that says "…by `audit`" is a
 * work item. Do not get comfortable here.
 *
 * ## Read-only by construction
 *
 * A quarantine that could *write* would be a way to mutate another tenant's
 * roster without a context, so every export below is a read. FS-4 fails CI on
 * an exported writer here.
 */

import {
  countTeamTenants,
  listMembers,
  soleTeamOrganizationId,
  type MemberFilters,
  type PaginatedMembers,
} from "./team";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";

/** The frozen set of surfaces still reading the team roster unscoped. */
export const LEGACY_TEAM_SURFACES = [
  "audit",
] as const;

export type LegacyTeamSurface = (typeof LEGACY_TEAM_SURFACES)[number];

export class UnscopedTeamAccessError extends Error {
  constructor(
    readonly surface: LegacyTeamSurface,
    readonly tenantCount: number,
    message: string,
  ) {
    super(message);
    this.name = "UnscopedTeamAccessError";
  }
}

function refuseUnlessSingleTenant(surface: LegacyTeamSurface): string {
  if (typeof surface !== "string" || !surface.trim()) {
    throw new TypeError("Unscoped team access requires an explicit `surface` name (see LEGACY_TEAM_SURFACES).");
  }
  const sole = soleTeamOrganizationId();
  if (!sole) {
    throw new UnscopedTeamAccessError(
      surface,
      countTeamTenants(),
      `Unscoped team read by "${surface}" refused: the team store holds more than one tenant, so there is no "the" roster. Scope this read (Wave 7E) — an unscoped view of a multi-tenant roster is a cross-tenant read.`,
    );
  }
  return sole;
}

function legacyContext(surface: LegacyTeamSurface): OrganizationContext {
  const organizationId = refuseUnlessSingleTenant(surface);
  return parseOrganizationContext({ organizationId });
}

/**
 * The paginated roster read for derived readers. Same gate, same single-tenant
 * assumption — and note what it must never become: a roster is a list of people
 * with roles, so a widened view is a disclosure of another merchant's staff and
 * who among them holds Admin.
 */
export async function legacyListMembers(
  surface: LegacyTeamSurface,
  filters: MemberFilters = {},
): Promise<PaginatedMembers> {
  // `async` on purpose: a refusal must reject the promise an `await` caller is
  // already holding, not throw synchronously out of a `.then` chain.
  return listMembers(legacyContext(surface), filters);
}
