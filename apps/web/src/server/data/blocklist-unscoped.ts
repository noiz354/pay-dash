import "server-only";

/**
 * Wave 7G — the unscoped-blocklist quarantine.
 *
 * @deprecated Every surface here is Wave 7E work in waiting. Nothing new may
 * import this module: `ingest-structural.test.ts` (GS-4) fails CI when the
 * consumer set grows, and the list only ever shrinks — one module per wave,
 * each getting its own tenant-scoped DAL and its own cross-tenant tests.
 *
 * ## The conditional module, earned rather than assumed
 *
 * The wave spec listed this file as *conditional*: create it only if a real
 * consumer forces it. One did. `server/data/audit.ts` derives its fraud lane
 * from `listBlocklist()` — and audit is a Wave 7E derived surface over
 * multiple unscoped owners. Scoping it here would drag 7E's whole retrofit
 * into this slice, which the no-mega-diff rule forbids. Recorded in
 * `WAVE_ROADMAP_7D_TO_11.md` §4.2 with the caller that forced it:
 * **audit.ts**.
 *
 * ## Why this is a fraud-signal disclosure, not a display bug
 *
 * A blocklist entry names an IP, a masked card or an email domain that a
 * *specific merchant* has flagged as malicious. A widened view discloses
 * another tenant's investigation state — which cards they are fighting
 * chargebacks on, which IPs they consider abusive — so the gate below refuses
 * outright rather than best-effort filtering, and nothing here can write: a
 * quarantine that could add or remove an entry would be a way to forge or
 * dismantle another merchant's fraud controls without a context.
 *
 * ## The third option: fail closed
 *
 * This module may only answer while the blocklist store holds **exactly one
 * tenant**. With zero materialised tenants the demo world is the only one
 * that can exist, so the gate assumes it and the scoped read seeds it lazily;
 * with more than one tenant there is no "the" blocklist to assume, and every
 * unscoped reader throws instead of widening its view, naming the surface
 * that tried.
 *
 * The `surface` argument is mandatory for the same reason: a crash that says
 * "unscoped blocklist access refused" is noise; one that says "…by `audit`"
 * is a work item. Do not get comfortable here.
 */

import {
  countBlocklistTenants,
  listBlocklist,
  soleBlocklistOrganizationId,
  type BlocklistFilters,
} from "./blocklist";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";

/** The frozen set of surfaces still reading the blocklist unscoped. */
export const LEGACY_BLOCKLIST_SURFACES = [
  "audit",
] as const;

export type LegacyBlocklistSurface = (typeof LEGACY_BLOCKLIST_SURFACES)[number];

export class UnscopedBlocklistAccessError extends Error {
  constructor(
    readonly surface: LegacyBlocklistSurface,
    readonly tenantCount: number,
    message: string,
  ) {
    super(message);
    this.name = "UnscopedBlocklistAccessError";
  }
}

function refuseUnlessSingleTenant(surface: LegacyBlocklistSurface): string {
  if (typeof surface !== "string" || !surface.trim()) {
    throw new TypeError("Unscoped blocklist access requires an explicit `surface` name (see LEGACY_BLOCKLIST_SURFACES).");
  }
  const count = countBlocklistTenants();
  if (count === 0) {
    // No tenant has materialised yet: the demo world is the only one that can
    // exist, so assume it rather than refusing. The scoped read below seeds it
    // lazily — this preserves the pre-7G eager-seed behaviour for derived
    // surfaces without inventing a tenant that was never there.
    return DEFAULT_DEMO_ORG;
  }
  const sole = soleBlocklistOrganizationId();
  if (!sole) {
    throw new UnscopedBlocklistAccessError(
      surface,
      count,
      `Unscoped blocklist read by "${surface}" refused: the blocklist store holds more than one tenant, so there is no "the" fraud list. Scope this read (Wave 7E) — an unscoped view of multi-tenant fraud signals is a cross-tenant disclosure.`,
    );
  }
  return sole;
}

function legacyContext(surface: LegacyBlocklistSurface): OrganizationContext {
  const organizationId = refuseUnlessSingleTenant(surface);
  return parseOrganizationContext({ organizationId });
}

/**
 * The blocklist page for derived readers. Same gate, same single-tenant
 * assumption. Async because the blocklist DAL is async — a refusal rejects
 * the promise the caller is already holding.
 */
export async function legacyListBlocklist(
  surface: LegacyBlocklistSurface,
  filters: BlocklistFilters = {},
) {
  return listBlocklist(legacyContext(surface), filters);
}
