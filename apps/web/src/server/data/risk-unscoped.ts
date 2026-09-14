import "server-only";

/**
 * Wave 7G — the unscoped-risk quarantine.
 *
 * @deprecated Every surface here is Wave 7E work in waiting. Nothing new may
 * import this module: `ingest-structural.test.ts` (GS-4) fails CI when the
 * consumer set grows, and the list only ever shrinks — one module per wave,
 * each getting its own tenant-scoped DAL and its own cross-tenant tests.
 *
 * ## The conditional module, earned rather than assumed
 *
 * The wave spec listed this file as *conditional*: create it only if a real
 * consumer forces it. Two did. `server/data/audit.ts` and
 * `server/data/handoff.ts` both derive lanes from `getRiskOverview()` — and
 * both are Wave 7E derived surfaces over multiple unscoped owners. Scoping
 * them here would drag 7E's whole retrofit into this slice, which the
 * no-mega-diff rule forbids. Recorded in `WAVE_ROADMAP_7D_TO_11.md` §4.2
 * with the callers that forced it: **audit.ts**, **handoff.ts**.
 *
 * ## Why this is a control-plane disclosure, not a display bug
 *
 * A risk overview exposes a merchant's *deployed velocity caps and ruleset* —
 * the controls that decide whether their payments get blocked — plus the
 * high-risk alerts derived from their ledger. A widened view discloses
 * another tenant's fraud posture and live investigation state, so the gate
 * below refuses outright rather than best-effort filtering, and nothing here
 * can write: a quarantine that could patch, deploy or discard a policy would
 * be a way to silently change another merchant's effective limits without a
 * context — the loudest class of cross-tenant write in this programme.
 *
 * ## The third option: fail closed
 *
 * This module may only answer while the risk store holds **exactly one
 * tenant**. With zero materialised tenants the demo world is the only one
 * that can exist, so the gate assumes it and the scoped read seeds it lazily;
 * with more than one tenant there is no "the" risk policy to assume, and
 * every unscoped reader throws instead of widening its view, naming the
 * surface that tried.
 *
 * The `surface` argument is mandatory for the same reason: a crash that says
 * "unscoped risk access refused" is noise; one that says "…by `audit`" is a
 * work item. Do not get comfortable here.
 */

import {
  countRiskTenants,
  getRiskOverview,
  soleRiskOrganizationId,
  type RiskOverview,
} from "./risk";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";

/** The frozen set of surfaces still reading the risk policy unscoped. */
export const LEGACY_RISK_SURFACES = [
  "audit",
  "handoff",
] as const;

export type LegacyRiskSurface = (typeof LEGACY_RISK_SURFACES)[number];

export class UnscopedRiskAccessError extends Error {
  constructor(
    readonly surface: LegacyRiskSurface,
    readonly tenantCount: number,
    message: string,
  ) {
    super(message);
    this.name = "UnscopedRiskAccessError";
  }
}

function refuseUnlessSingleTenant(surface: LegacyRiskSurface): string {
  if (typeof surface !== "string" || !surface.trim()) {
    throw new TypeError("Unscoped risk access requires an explicit `surface` name (see LEGACY_RISK_SURFACES).");
  }
  const count = countRiskTenants();
  if (count === 0) {
    // No tenant has materialised yet: the demo world is the only one that can
    // exist, so assume it rather than refusing. The scoped read below seeds it
    // lazily — this preserves the pre-7G eager-seed behaviour for derived
    // surfaces without inventing a tenant that was never there.
    return DEFAULT_DEMO_ORG;
  }
  const sole = soleRiskOrganizationId();
  if (!sole) {
    throw new UnscopedRiskAccessError(
      surface,
      count,
      `Unscoped risk read by "${surface}" refused: the risk store holds more than one tenant, so there is no "the" policy. Scope this read (Wave 7E) — an unscoped view of multi-tenant risk controls is a cross-tenant disclosure of another merchant's fraud posture.`,
    );
  }
  return sole;
}

function legacyContext(surface: LegacyRiskSurface): OrganizationContext {
  const organizationId = refuseUnlessSingleTenant(surface);
  return parseOrganizationContext({ organizationId });
}

/**
 * The risk overview for derived readers. Same gate, same single-tenant
 * assumption. Async because the risk DAL is async — a refusal rejects the
 * promise the caller is already holding.
 */
export async function legacyGetRiskOverview(surface: LegacyRiskSurface): Promise<RiskOverview> {
  return getRiskOverview(legacyContext(surface));
}
