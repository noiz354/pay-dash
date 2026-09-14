import "server-only";

/**
 * Wave 7F — the unscoped-settings quarantine.
 *
 * @deprecated Every surface here is Wave 7E work in waiting. Nothing new may
 * import this module: `identity-structural.test.ts` (FS-4) fails CI when the
 * consumer set grows, and the list only ever shrinks — one module per wave,
 * each getting its own tenant-scoped DAL and its own cross-tenant tests.
 *
 * ## Why this file exists at all
 *
 * Scoping `settings.ts` left one *derived* reader — the audit log, which turns
 * API-key rows into "API key created" configuration events — reading
 * `listApiKeys()` with no tenant. Audit is a Wave 7E derived surface over four
 * unscoped owners; retrofitting it belongs to that wave, not to this slice.
 *
 * ## Why this one is the sharpest edge in the slice
 *
 * The row this module hands out is a **secret surface**: key names,
 * environments, scopes and masked secrets. A widened view is not a display bug,
 * it is an enumeration of another merchant's integration posture — which key is
 * live, when it was minted, what it may do. That is why the gate below is a
 * hard refusal rather than a best-effort filter, and why nothing here writes.
 *
 * ## The third option: fail closed
 *
 * This module may only answer while the settings store holds **exactly one
 * tenant**. As soon as a second tenant holds settings, every unscoped reader
 * throws instead of widening its view, naming the surface that tried. So the
 * interim state is not "leaky but documented" — it is "safe for a
 * single-tenant demo deployment, and loud the moment that stops being true".
 *
 * The `surface` argument is mandatory for the same reason: a crash that says
 * "unscoped settings access refused" is noise; one that says "…by `audit`" is
 * a work item. Do not get comfortable here.
 */

import { countSettingsTenants, listApiKeys, soleSettingsOrganizationId, type ApiKey, type KeyEnvironment } from "./settings";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";

/** The frozen set of surfaces still reading settings unscoped. */
export const LEGACY_SETTINGS_SURFACES = [
  "audit",
] as const;

export type LegacySettingsSurface = (typeof LEGACY_SETTINGS_SURFACES)[number];

export class UnscopedSettingsAccessError extends Error {
  constructor(
    readonly surface: LegacySettingsSurface,
    readonly tenantCount: number,
    message: string,
  ) {
    super(message);
    this.name = "UnscopedSettingsAccessError";
  }
}

function refuseUnlessSingleTenant(surface: LegacySettingsSurface): string {
  if (typeof surface !== "string" || !surface.trim()) {
    throw new TypeError("Unscoped settings access requires an explicit `surface` name (see LEGACY_SETTINGS_SURFACES).");
  }
  const sole = soleSettingsOrganizationId();
  if (!sole) {
    throw new UnscopedSettingsAccessError(
      surface,
      countSettingsTenants(),
      `Unscoped settings read by "${surface}" refused: the settings store holds more than one tenant, so there is no "the" merchant profile or key ring. Scope this read (Wave 7E) — an unscoped view of multi-tenant secrets is a cross-tenant read.`,
    );
  }
  return sole;
}

function legacyContext(surface: LegacySettingsSurface): OrganizationContext {
  const organizationId = refuseUnlessSingleTenant(surface);
  return parseOrganizationContext({ organizationId });
}

/** The key ring for derived readers. Same gate, same single-tenant assumption. */
export async function legacyListApiKeys(
  surface: LegacySettingsSurface,
  environment?: KeyEnvironment,
): Promise<ApiKey[]> {
  // `async` on purpose: a refusal must reject the promise an `await` caller is
  // already holding, not throw synchronously out of a `.then` chain.
  return listApiKeys(legacyContext(surface), environment);
}
