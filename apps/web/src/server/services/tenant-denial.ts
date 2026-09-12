import "server-only";

/**
 * Wave 7A — the denial sink.
 *
 * The anti-enumeration policy (spec §4) deliberately makes a cross-tenant
 * attempt look like a missing resource **on the wire**. That has a cost: if the
 * refusal is invisible everywhere, "a client is probing other tenants' ids"
 * becomes undetectable, and a scoping bug in our own code looks like a user
 * error. This module pays the cost back.
 *
 * Three outputs, one per audience:
 *   ring buffer   — operators/tests: what just happened, in order, no PII.
 *   logger        — the log pipeline: one `warn` per denial, structured.
 *   audit store   — forensics: `TENANT_ISOLATION_DENIED` per tenant, only when
 *                  a durable store is configured (it is best-effort by design:
 *                  a failing audit write must never turn a deny into an allow).
 */

import { logger } from "@/lib/logger";
import { tenantDenialEvent } from "@/domain/security/tenant";

export type TenantDenialRecord = {
  readonly action: "TENANT_ISOLATION_DENIED";
  readonly surface: string;
  readonly actorOrg: string;
  readonly requestedOrg: string;
  readonly at: string;
  readonly actorId: string | null;
  readonly resourceId: string | null;
};

const LIMIT = 200;
const MAX_RESOURCE_ID = 64;

type GlobalWithDenials = {
  __paydashTenantDenials?: TenantDenialRecord[];
  __paydashTenantDenialSinkFailures?: number;
};

// On globalThis for the same reason the dev stores are: module instances differ
// between the Next server and a test runner, and a denial log that resets on
// hot reload is a denial log that lies.
function ring(): TenantDenialRecord[] {
  const g = globalThis as unknown as GlobalWithDenials;
  if (!g.__paydashTenantDenials) g.__paydashTenantDenials = [];
  return g.__paydashTenantDenials;
}

function truncate(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_RESOURCE_ID ? `${trimmed.slice(0, MAX_RESOURCE_ID)}…` : trimmed;
}

/**
 * Record one refused cross-tenant attempt.
 *
 * The payload is restricted on purpose: surface, org ids, resource id, actor,
 * timestamp. Never a customer name, email, amount or reason — a denial may have
 * been raised *about* another tenant's row, so anything that leaks the row's
 * contents through the audit path would defeat the isolation it is reporting.
 */
export function recordTenantDenial(input: {
  surface: string;
  actorOrganizationId: string;
  requestedOrganizationId: string;
  actorId?: string | null;
  resourceId?: string | null;
  at?: Date;
}): TenantDenialRecord {
  const base = tenantDenialEvent(input.surface, { organizationId: input.actorOrganizationId, __tenantScope: true } as never, input.requestedOrganizationId, input.at);
  const record: TenantDenialRecord = Object.freeze({
    ...base,
    actorId: truncate(input.actorId),
    resourceId: truncate(input.resourceId),
  });

  const buffer = ring();
  buffer.push(record);
  if (buffer.length > LIMIT) buffer.splice(0, buffer.length - LIMIT);

  logger.warn(
    {
      type: "tenant_isolation_denied",
      surface: record.surface,
      actorOrganizationId: record.actorOrg,
      requestedOrganizationId: record.requestedOrg,
      resourceId: record.resourceId,
    },
    "cross-tenant transaction access refused",
  );

  void persist(record);
  return record;
}

async function persist(record: TenantDenialRecord): Promise<void> {
  // No durable store without a database — the ring buffer and the log still
  // carry the event, and that is the documented dev/demo behaviour.
  if (!process.env.DATABASE_URL) return;
  try {
    const { buildAuditStore } = await import("@/server/repositories/audit-event-store");
    const store = await buildAuditStore();
    await store.append({
      organizationId: record.actorOrg,
      actorId: record.actorId ?? "unknown",
      action: "TENANT_ISOLATION_DENIED",
      outcome: "FAILURE",
      metadata: {
        organizationId: record.actorOrg,
        actorId: record.actorId ?? "unknown",
        surface: record.surface,
        requestedOrganizationId: record.requestedOrg,
        canonicalResourceId: record.resourceId ?? undefined,
      },
    });
  } catch (e) {
    const g = globalThis as unknown as GlobalWithDenials;
    g.__paydashTenantDenialSinkFailures = (g.__paydashTenantDenialSinkFailures ?? 0) + 1;
    logger.error({ type: "tenant_denial_audit_failed", reason: e instanceof Error ? e.message : String(e) }, "could not audit a tenant denial");
  }
}

/** Oldest first, so a probe sequence reads in the order it happened. */
export function listTenantDenials(limit?: number): TenantDenialRecord[] {
  const all = [...ring()];
  return typeof limit === "number" ? all.slice(-limit) : all;
}

export function tenantDenialSinkFailures(): number {
  return (globalThis as unknown as GlobalWithDenials).__paydashTenantDenialSinkFailures ?? 0;
}

/** Test seam for the ring buffer; production code never clears an audit trail. */
export function __resetTenantDenials(): void {
  const g = globalThis as unknown as GlobalWithDenials;
  g.__paydashTenantDenials = [];
  g.__paydashTenantDenialSinkFailures = 0;
}
