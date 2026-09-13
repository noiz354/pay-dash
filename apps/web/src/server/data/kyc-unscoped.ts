import "server-only";

/**
 * Wave 7F — the unscoped-KYC quarantine.
 *
 * @deprecated Every surface here is Wave 7E work in waiting. Nothing new may
 * import this module: `identity-structural.test.ts` (FS-4) fails CI when the
 * consumer set grows, and the list only ever shrinks — one module per wave,
 * each getting its own tenant-scoped DAL and its own cross-tenant tests.
 *
 * ## The conditional module, earned rather than assumed
 *
 * The wave spec listed this file as *conditional*: create it only if a real
 * consumer forces it. One did. `server/data/handoff.ts` derives the
 * "kyc_review" lane from `getKycSubmission()` — a compliance document awaiting
 * verification — and handoff is a Wave 7E derived surface over four unscoped
 * owners. Scoping it here would drag 7E's whole retrofit into this slice, which
 * the no-mega-diff rule forbids. Recorded in `WAVE_ROADMAP_7D_TO_11.md` §4.2
 * with the caller that forced it: **handoff.ts**.
 *
 * ## Why this is the most confidential row in the slice
 *
 * A KYC submission names a file, a jurisdiction and a submission time about a
 * *legal entity*. A widened view is a PII disclosure, not a display bug — so the
 * gate below refuses outright rather than best-effort filtering, and nothing
 * here can write: a quarantine that could submit or clear a document would be a
 * way to forge or destroy another merchant's compliance record without a
 * context.
 *
 * ## The third option: fail closed
 *
 * This module may only answer while the KYC store holds **exactly one
 * submitting tenant**. The store is deliberately unseeded (ADR-0019 — a
 * compliance document is an unverified claim about the merchant, so the app must
 * not fabricate one), which means the honest answer with zero or with two or
 * more submitting tenants is a refusal: there is no "the" KYC tenant to assume.
 *
 * The `surface` argument is mandatory for the same reason: a crash that says
 * "unscoped KYC access refused" is noise; one that says "…by `handoff`" is a
 * work item. Do not get comfortable here.
 */

import { countKycTenants, getKycSubmission, soleKycOrganizationId, type KycSubmission } from "./kyc";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";

/** The frozen set of surfaces still reading the KYC store unscoped. */
export const LEGACY_KYC_SURFACES = [
  "handoff",
] as const;

export type LegacyKycSurface = (typeof LEGACY_KYC_SURFACES)[number];

export class UnscopedKycAccessError extends Error {
  constructor(
    readonly surface: LegacyKycSurface,
    readonly tenantCount: number,
    message: string,
  ) {
    super(message);
    this.name = "UnscopedKycAccessError";
  }
}

function refuseUnlessSingleTenant(surface: LegacyKycSurface): string {
  if (typeof surface !== "string" || !surface.trim()) {
    throw new TypeError("Unscoped KYC access requires an explicit `surface` name (see LEGACY_KYC_SURFACES).");
  }
  const sole = soleKycOrganizationId();
  if (!sole) {
    throw new UnscopedKycAccessError(
      surface,
      countKycTenants(),
      `Unscoped KYC read by "${surface}" refused: the KYC store holds more than one tenant (or none at all), so there is no "the" submission. Scope this read (Wave 7E) — an unscoped view of multi-tenant compliance documents is a cross-tenant PII read.`,
    );
  }
  return sole;
}

function legacyContext(surface: LegacyKycSurface): OrganizationContext {
  const organizationId = refuseUnlessSingleTenant(surface);
  return parseOrganizationContext({ organizationId });
}

/**
 * The single submission slot for derived readers. Same gate, same
 * single-tenant assumption. Sync because the KYC DAL is sync — a refusal throws
 * where the caller already is, rather than pretending to be a promise.
 */
export function legacyKycSubmission(surface: LegacyKycSurface): KycSubmission | null {
  // Zero submitting tenants is the *normal* state of a deliberately unseeded
  // store, not an ambiguity to refuse: no document exists anywhere, so the
  // honest answer is `null` and the derived lane simply does not appear. The
  // refusal exists for the widening case — more than one tenant — where picking
  // one would disclose a compliance document to whoever asked.
  if (countKycTenants() === 0) return null;
  return getKycSubmission(legacyContext(surface));
}
