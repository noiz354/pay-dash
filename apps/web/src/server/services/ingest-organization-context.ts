import "server-only";

/**
 * Wave 7G — the session → `OrganizationContext` seam for the ingest & integrity
 * slice (webhooks, payment links, fraud blocklist, risk policy, idempotency:
 * one slice, one seam).
 *
 * Mirrors `identity-organization-context.ts` (7F), `billing-organization-context.ts`
 * (7D), `customer-organization-context.ts` (7C) and `payout-organization-context.ts`
 * (7B): the session answers which tenant, a browser-supplied `?organizationId=`
 * is normalized against the session scope and flagged (never honoured), and
 * there is no demo fallback once the ingest stores hold more than one tenant.
 *
 * ## Why this slice needs its own seam rather than reusing another
 *
 * The demo-fallback refusal has to gate on *these* stores. A tenant can exist
 * in this app while holding no transactions, no payouts, no customers and no
 * team — its first fact may be an inbound webhook, a drafted payment link, a
 * blocked IP or a deployed velocity cap. Folding another slice's probe in
 * would answer "single tenant" for a process where two merchants each have
 * provider traffic and fraud controls, and then hand an unauthenticated
 * request the demo organization's webhook log and blocklist.
 *
 * ## What "ingest" counts
 *
 * `countIngestTenants()` folds the five stores that *hold* ingest rows —
 * webhooks ∪ links ∪ blocklist ∪ risk ∪ idempotency. Timeline holds nothing
 * (it derives a feed from other stores), so it contributes no probe of its
 * own; a tenant that only has a timeline view is a tenant that has events,
 * links or policies somewhere else, and is counted there.
 *
 * ## The unattributed partition is not a tenant
 *
 * Webhook events whose organization could not be resolved at the door live in
 * the `UNATTRIBUTED_ORGANIZATION_ID` partition, which is visible to no tenant
 * and excluded from every probe. It can never become "the" tenant for a
 * demo-fallback refusal, and it can never be read through this seam — the
 * invariant is: attributable ⇒ owner's tenant; unattributable ⇒ invisible to
 * all, never defaults to demo.
 *
 * Reads resolve a tenant without a permission (the webhooks, links, fraud and
 * risk pages are visible to any signed-in member of that tenant); writes come
 * through `requireIngestOrganizationContext(permission)` — `money_in.create`
 * for link creation/payment, `settings.manage` for blocklist and risk policy
 * writes, `provider.connect.test` for webhook simulate/replay, `audit.read`
 * for the blocklist CSV export. Roles are per tenant, so "is this actor an
 * Admin?" is only meaningful *after* the tenant is known — the seam resolves
 * the tenant first and answers permissions second, which is the same order
 * the DALs pin internally (spec G-13).
 *
 * ## Catalog gap, recorded as Wave 8 debt
 *
 * The roles catalog has no ingest-specific permission (no `fraud.manage`, no
 * `risk.deploy`, no `webhooks.replay`). This wave maps each write to the
 * closest existing permission rather than inventing new strings (7F
 * precedent: permissions must come from `domain/organization/roles.ts`). The
 * mapping is documented in `WAVE_7G_INGEST_SPEC.md` §6 and the gap is
 * recorded as Wave 8 debt — a dedicated ingest permission set would let the
 * Analyst role read fraud state without being able to prune it, which today
 * requires `settings.manage` and therefore over-grants.
 */

import { hasPermission, type OrganizationRole, type Permission } from "@/domain/organization/roles";
import { OrganizationContextError, parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { countBlocklistTenants, soleBlocklistOrganizationId } from "@/server/data/blocklist";
import { countIdempotencyTenants, soleIdempotencyOrganizationId } from "@/server/data/idempotency";
import { countLinkTenants, soleLinkOrganizationId } from "@/server/data/links";
import { countRiskTenants, soleRiskOrganizationId } from "@/server/data/risk";
import { countWebhookTenants, soleWebhookOrganizationId } from "@/server/data/webhooks";
import {
  normalizeRequestedOrganization,
  transactionAccessDeniedState,
} from "./transaction-organization-context";
import { requireStrictOrgContext, resolveSessionOrgContext } from "./session-org-context";

export type ResolvedIngestAccess = {
  readonly context: OrganizationContext;
  readonly actorId: string | null;
  readonly roles: readonly OrganizationRole[];
  /** True when the session resolver fell back to the single-tenant demo org. */
  readonly demoFallback: boolean;
  /** True when the caller *asked for* another tenant. Session won; it is audited. */
  readonly overridden: boolean;
};

/**
 * How many tenants hold ingest rows (webhooks ∪ links ∪ blocklist ∪ risk ∪
 * idempotency).
 *
 * Tenancy probe: answers a question about the stores, never returns an event,
 * a link, an entry, a policy or a record — which is why it, and not a
 * repository read, is what the demo refusal gates on. Capped at 2 because the
 * only question anyone asks is "is there more than one?".
 *
 * The unattributed webhook partition is excluded by construction: every probe
 * it feeds counts only partitions with at least one row, and unattributed
 * events are visible to no tenant — they must never tip the scale toward
 * "multi-tenant" and lock out a legitimate single-tenant demo, nor toward
 * "single tenant" and hand the door's dead letters to whoever asked.
 */
export function countIngestTenants(): number {
  if (
    countWebhookTenants() > 1 ||
    countLinkTenants() > 1 ||
    countBlocklistTenants() > 1 ||
    countRiskTenants() > 1 ||
    countIdempotencyTenants() > 1
  ) {
    return 2;
  }
  const ids = new Set<string>();
  const webhooks = soleWebhookOrganizationId();
  if (webhooks) ids.add(webhooks);
  const links = soleLinkOrganizationId();
  if (links) ids.add(links);
  const blocklist = soleBlocklistOrganizationId();
  if (blocklist) ids.add(blocklist);
  const risk = soleRiskOrganizationId();
  if (risk) ids.add(risk);
  const idempotency = soleIdempotencyOrganizationId();
  if (idempotency) ids.add(idempotency);
  return ids.size;
}

function refuseMultiTenantDemo(demoFallback: boolean): void {
  if (!demoFallback) return;
  if (countIngestTenants() > 1) {
    throw new OrganizationContextError(
      "MISSING_ORGANIZATION_CONTEXT",
      "The ingest stores are multi-tenant (more than one tenant holds webhooks, links, blocklist entries, risk policies or idempotency records); refusing to answer an unauthenticated request as the demo organization. Sign in.",
    );
  }
}

async function fromSession(organizationIdFromClient?: string): Promise<ResolvedIngestAccess> {
  const session = await resolveSessionOrgContext({ organizationId: organizationIdFromClient });
  const context = parseOrganizationContext(session);
  refuseMultiTenantDemo(session.isDemoFallback);
  const { overridden } = normalizeRequestedOrganization(context, organizationIdFromClient, "ingest.read");
  return {
    context,
    actorId: session.userId,
    roles: session.roles,
    demoFallback: session.isDemoFallback,
    overridden,
  };
}

/**
 * Resolve the tenant for an ingest **read**: the webhook log, the payment-link
 * list, the fraud blocklist, the risk overview, the timeline feed.
 */
export async function resolveIngestOrganizationContext(input?: {
  organizationId?: string | null;
}): Promise<ResolvedIngestAccess> {
  try {
    return await fromSession(input?.organizationId ?? undefined);
  } catch (e) {
    if (e instanceof OrganizationContextError) throw e;
    throw new OrganizationContextError(
      "MISSING_ORGANIZATION_CONTEXT",
      "Could not resolve an organization context for this request; webhook, link, fraud and risk data require one.",
    );
  }
}

/**
 * Resolve the tenant for an ingest **write** and assert the permission in the
 * same step. Fail-closed: denies unauthenticated actors in strict mode, and
 * denies demo-fallback access the moment a second tenant holds ingest rows.
 *
 * Link creation/payment, blocklist add/remove, risk draft/deploy/discard and
 * webhook simulate/replay all come through here — never through the read
 * resolver. Order matters: the tenant is resolved *before* the permission is
 * evaluated, because roles are per tenant and an Admin of one organization is
 * a stranger in another (spec P-10).
 */
export async function requireIngestOrganizationContext(
  permission: Permission,
  input?: { organizationId?: string | null },
): Promise<ResolvedIngestAccess> {
  const session = await requireStrictOrgContext(permission, {
    organizationId: input?.organizationId ?? undefined,
  });
  const context = parseOrganizationContext(session);
  refuseMultiTenantDemo(session.isDemoFallback);
  const { overridden } = normalizeRequestedOrganization(context, input?.organizationId, `ingest.${permission}`);
  return {
    context,
    actorId: session.userId,
    roles: session.roles,
    demoFallback: session.isDemoFallback,
    overridden,
  };
}

/** Whether the resolved access may perform `permission` (UI shaping only — never enforcement). */
export function ingestAccessCan(access: ResolvedIngestAccess, permission: Permission): boolean {
  return access.roles.some((role) => hasPermission(role, permission));
}

/** Uniform not-found mapping for refused ingest access (no enumeration oracle). */
export function ingestAccessDeniedState(error: unknown): { status: "error"; message: string } {
  return transactionAccessDeniedState(error);
}

/**
 * Wire message for a refused ingest write: identical to the unknown-id path,
 * so "not yours" and "does not exist" are indistinguishable to the caller (C-5).
 */
export const INGEST_NOT_FOUND_MESSAGE = "That record no longer exists.";
