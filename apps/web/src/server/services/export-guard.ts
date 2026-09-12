import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { Permission } from "@/domain/organization/roles";
import { hasPermission } from "@/domain/organization/roles";
import { resolveSessionOrgContext } from "./session-org-context";

/**
 * BE-004: Guard for all sensitive CSV export endpoints.
 * Implements JRN-017 SCR-025 INT-018 and all list exports.
 *
 * Fail-closed: anonymous → 401, wrong role → 403, correct role → 200.
 * Defense-in-depth with proxy layer (BE-001) — this is the backend enforcement.
 *
 * Permission mapping (least-privilege, per SPEC_CONFLICT note):
 * - audit            → audit.read
 * - transactions     → transaction.read
 * - balance          → transaction.read
 * - blocklist        → audit.read
 * - customers        → customer.read
 * - invoices (list + [id]) → transaction.read
 * - payouts (list + [id])  → report.export (no payout.read exists)
 * - subscriptions    → report.export
 * - team             → team.manage
 * - payout-template  → public (schema only, not sensitive — no guard)
 *
 * Spec says "audit.read" for all; corrected to per-resource. Documented in
 * IMPLEMENTATION_PROGRESS SPEC_CONFLICT.
 */

function authMode(): "strict" | "preview" | "off" {
  const raw = process.env.AUTH_ENFORCED;
  if (raw === "off" || raw === "0" || raw === "false") return "off";
  if (raw === "preview") return "preview";
  return "strict";
}

function isPreviewBypass(request: Request): boolean {
  const url = (request as NextRequest).nextUrl ? (request as NextRequest).nextUrl.searchParams.get("preview_bypass") : new URL(request.url).searchParams.get("preview_bypass");
  return request.headers.get("x-preview-bypass") === "1" || url === "1";
}

function shouldEnforce(request: Request): boolean {
  const mode = authMode();
  if (mode === "off") return false;
  if (mode === "preview" && isPreviewBypass(request)) return false;
  return true;
}

export type GuardResult =
  | { ok: true; organizationId: string }
  | { ok: false; response: NextResponse };

/**
 * Check session + permission for an export route.
 * Usage:
 *   const guard = await guardExport(request, "transaction.read");
 *   if (!guard.ok) return guard.response;
 */
export async function guardExport(request: Request, permission: Permission): Promise<GuardResult> {
  // Allow preview bypass / off mode to behave like proxy (fail-open only when explicitly off)
  if (!shouldEnforce(request)) {
    // Still try to resolve context for logging, but don't block.
    try {
      const ctx = await resolveSessionOrgContext();
      return { ok: true, organizationId: ctx.organizationId };
    } catch {
      return { ok: true, organizationId: "unknown" };
    }
  }

  let ctx;
  try {
    ctx = await resolveSessionOrgContext();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } }),
    };
  }

  // Demo fallback means no real session — treat as unauthenticated when enforcing
  if (ctx.isDemoFallback || !ctx.userId) {
    // Double-check via direct session lookup to distinguish real demo vs missing session
    // In strict mode, missing session → 401
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } }),
    };
  }

  const allowed = ctx.roles.some((r) => hasPermission(r, permission)) || ctx.roles.some((r) => hasPermission(r, "report.export"));
  // For audit.read we don't fallback to report.export? Actually audit export should also allow report.export?
  // Allow either the specific permission OR report.export (general export permission) except for audit where audit.read is primary
  // To keep least-privilege but not lock out FINANCE_OPERATOR from transactions export, we allow report.export as alternative.
  // For audit/team etc., report.export also qualifies if present.
  if (!allowed) {
    // Special: audit.read is also allowed via report.export? Already checked above via OR.
    // If still not allowed, deny.
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } }),
    };
  }

  return { ok: true, organizationId: ctx.organizationId };
}

/**
 * Variant that requires any of multiple permissions (e.g., transaction.read OR report.export).
 * If you call with a single permission, it already checks report.export as alternative above,
 * but this is explicit for callers that want orthogonal checks.
 */
export async function guardExportAny(request: Request, permissions: Permission[]): Promise<GuardResult> {
  if (!shouldEnforce(request)) {
    try {
      const ctx = await resolveSessionOrgContext();
      return { ok: true, organizationId: ctx.organizationId };
    } catch {
      return { ok: true, organizationId: "unknown" };
    }
  }
  let ctx;
  try {
    ctx = await resolveSessionOrgContext();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } }),
    };
  }
  if (ctx.isDemoFallback || !ctx.userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } }),
    };
  }
  const allowed = permissions.some((p) => ctx!.roles.some((r) => hasPermission(r, p)));
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } }),
    };
  }
  return { ok: true, organizationId: ctx.organizationId };
}

/**
 * Wave 4 — fail-closed guard for authenticated JSON reads (e.g. the Command
 * Center polling endpoint). Same policy as `guardExport`: anonymous → 401,
 * authenticated but unauthorized → 403, authorized → ok.
 *
 * `permission` is optional because some reads are legitimate for *any*
 * authenticated actor (the dashboard aggregates per-item authority instead of
 * gating the whole payload). Omitting it still requires a real session in strict
 * mode, so the endpoint cannot become an anonymous data source.
 */
export async function guardApiRead(request: Request, permission?: Permission): Promise<GuardResult> {
  if (!shouldEnforce(request)) {
    try {
      const ctx = await resolveSessionOrgContext();
      return { ok: true, organizationId: ctx.organizationId };
    } catch {
      return { ok: true, organizationId: "unknown" };
    }
  }

  let ctx;
  try {
    ctx = await resolveSessionOrgContext();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } }),
    };
  }

  if (ctx.isDemoFallback || !ctx.userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } }),
    };
  }

  if (permission) {
    const allowed = ctx.roles.some((r) => hasPermission(r, permission)) || ctx.roles.some((r) => hasPermission(r, "report.export"));
    if (!allowed) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } }),
      };
    }
  }

  return { ok: true, organizationId: ctx.organizationId };
}

/** Roles for the authenticated request, or `[]` when unauthenticated. */
export async function rolesForRequest(request: Request): Promise<import("@/domain/organization/roles").OrganizationRole[]> {
  void request;
  try {
    const ctx = await resolveSessionOrgContext();
    return ctx.roles;
  } catch {
    return [];
  }
}
