import "server-only";

/**
 * Wave 7G — the unscoped-webhook quarantine.
 *
 * @deprecated Every surface here is Wave 7E work in waiting. Nothing new may
 * import this module: `ingest-structural.test.ts` (GS-4) fails CI when the
 * consumer set grows, and the list only ever shrinks — one module per wave,
 * each getting its own tenant-scoped DAL and its own cross-tenant tests.
 *
 * ## The conditional module, earned rather than assumed
 *
 * The wave spec listed this file as *conditional*: create it only if a real
 * consumer forces it. Three did. `server/data/audit.ts`,
 * `server/data/command-center.ts` and `server/data/handoff.ts` all derive
 * lanes from `listWebhooks()` — and all three are Wave 7E derived surfaces
 * over multiple unscoped owners. Scoping them here would drag 7E's whole
 * retrofit into this slice, which the no-mega-diff rule forbids. Recorded in
 * `WAVE_ROADMAP_7D_TO_11.md` §4.2 with the callers that forced it:
 * **audit.ts**, **command-center.ts**, **handoff.ts**.
 *
 * `onboarding.ts` is deliberately **not** a consumer: 7F already wired it to
 * the scoped ledger read, and 7G wires its webhook count to the scoped
 * `listWebhooks(ctx, …)`. GS-4 pins that it never imports a quarantine —
 * onboarding is the surface that closes D-29, not one that extends it.
 *
 * ## Why this is a disclosure surface, not a display bug
 *
 * A webhook event carries a provider payload — amounts, customer emails,
 * failure codes — about a *specific merchant's* integration. A widened view
 * is a disclosure of another tenant's provider traffic, so the gate below
 * refuses outright rather than best-effort filtering, and nothing here can
 * write: a quarantine that could record or reject an inbound event would be a
 * way to forge or destroy another merchant's integration history without a
 * context.
 *
 * ## The third option: fail closed
 *
 * This module may only answer while the webhook store holds **exactly one
 * attributed tenant**. The unattributed partition (events whose organization
 * could not be resolved at the door) is excluded from the probe by design —
 * it is visible to no tenant and must never become "the" tenant. With zero
 * materialised tenants the demo world is the only one that can exist, so the
 * gate assumes it and the scoped read seeds it lazily; with more than one
 * tenant there is no "the" webhook log to assume, and every unscoped reader
 * throws instead of widening its view, naming the surface that tried.
 *
 * The `surface` argument is mandatory for the same reason: a crash that says
 * "unscoped webhook access refused" is noise; one that says "…by `audit`" is
 * a work item. Do not get comfortable here.
 */

import {
  countWebhookTenants,
  listWebhooks,
  soleWebhookOrganizationId,
  type PaginatedWebhooks,
  type WebhookFilters,
} from "./webhooks";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";

/** The frozen set of surfaces still reading the webhook log unscoped. */
export const LEGACY_WEBHOOK_SURFACES = [
  "audit",
  "command-center",
  "handoff",
] as const;

export type LegacyWebhookSurface = (typeof LEGACY_WEBHOOK_SURFACES)[number];

export class UnscopedWebhookAccessError extends Error {
  constructor(
    readonly surface: LegacyWebhookSurface,
    readonly tenantCount: number,
    message: string,
  ) {
    super(message);
    this.name = "UnscopedWebhookAccessError";
  }
}

function refuseUnlessSingleTenant(surface: LegacyWebhookSurface): string {
  if (typeof surface !== "string" || !surface.trim()) {
    // `surface` is required so a refusal is actionable. A caller that passed
    // nothing is a bug in the caller, and saying so is clearer than pretending
    // the refusal is about the tenant count.
    throw new TypeError("Unscoped webhook access requires an explicit `surface` name (see LEGACY_WEBHOOK_SURFACES).");
  }
  const count = countWebhookTenants();
  if (count === 0) {
    // No tenant has materialised yet: the demo world is the only one that can
    // exist, so assume it rather than refusing. The scoped read below seeds it
    // lazily — this preserves the pre-7G eager-seed behaviour for derived
    // surfaces without inventing a tenant that was never there.
    return DEFAULT_DEMO_ORG;
  }
  const sole = soleWebhookOrganizationId();
  if (!sole) {
    throw new UnscopedWebhookAccessError(
      surface,
      count,
      `Unscoped webhook read by "${surface}" refused: the webhook store holds more than one tenant, so there is no "the" event log. Scope this read (Wave 7E) — an unscoped view of multi-tenant provider traffic is a cross-tenant disclosure.`,
    );
  }
  return sole;
}

function legacyContext(surface: LegacyWebhookSurface): OrganizationContext {
  const organizationId = refuseUnlessSingleTenant(surface);
  return parseOrganizationContext({ organizationId });
}

/**
 * The webhook page for derived readers. Same gate, same single-tenant
 * assumption. Sync because the webhook DAL is sync — a refusal throws where
 * the caller already is, rather than pretending to be a promise.
 */
export function legacyListWebhooks(
  surface: LegacyWebhookSurface,
  filters: WebhookFilters = {},
): PaginatedWebhooks {
  return listWebhooks(legacyContext(surface), filters);
}
