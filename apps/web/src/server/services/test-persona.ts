import "server-only";

import { cookies } from "next/headers";
import type { OrganizationRole } from "@/domain/organization/roles";
import { parseRoles } from "@/domain/organization/roles";

// Wave 4 — E2E persona harness (spec §3 Canonical Persona Model).
//
// The cross-role journeys in spec §9 (Dinda creates a payout batch → Hendri
// approves it; Agus requests a refund → Hendri executes it) cannot be tested
// unless a test can *become* two different actors. Real Better Auth sessions
// need a database, and authorization is derived from the session membership —
// never from the browser — so the harness has to sit at exactly that seam.
//
// Security rule, asserted by `test-persona.test.ts`:
//   - In `strict` mode (the production default) the override is **never** read.
//     A request cannot choose its own roles, full stop.
//   - It only applies when no real session resolved, so it can never downgrade
//     or upgrade an authenticated user.
//   - It only accepts roles that exist in the canonical RBAC enum; anything else
//     yields no override rather than a permissive fallback.
//
// So this widens nothing in production: it makes the dev/preview fallback — which
// already resolves to OWNER — selectable instead of hard-coded.

/** Cookie/header carrying the persona id. */
export const PERSONA_COOKIE = "paydash_persona";

/** spec §3 — PID → persona. Keys are what `loginAs(page, "dinda")` passes. */
export const E2E_PERSONAS = {
  rina: { pid: "PER-001", name: "Rina", roles: ["OWNER"] },
  dinda: { pid: "PER-002", name: "Dinda", roles: ["FINANCE_OPERATOR"] },
  hendri: { pid: "PER-003", name: "Hendri", roles: ["FINANCE_ADMIN"] },
  agus: { pid: "PER-004", name: "Agus", roles: ["SUPPORT"] },
  sari: { pid: "PER-005", name: "Sari", roles: ["RISK_ANALYST"] },
  bima: { pid: "PER-006", name: "Bima", roles: ["DEVELOPER"] },
  nadia: { pid: "PER-007", name: "Nadia", roles: ["ANALYST"] },
  lukman: { pid: "PER-008", name: "Lukman", roles: ["COMPLIANCE_ANALYST"] },
} as const satisfies Record<string, { pid: string; name: string; roles: readonly OrganizationRole[] }>;

export type PersonaId = keyof typeof E2E_PERSONAS;

export const PERSONA_IDS = Object.keys(E2E_PERSONAS) as PersonaId[];

export type PersonaOverride = {
  persona: PersonaId;
  /** Stable actor id — distinct per persona so dual-control checks are real. */
  actorId: string;
  roles: OrganizationRole[];
};

function authMode(): "strict" | "preview" | "off" {
  const raw = process.env.AUTH_ENFORCED;
  if (raw === "off" || raw === "0" || raw === "false") return "off";
  if (raw === "preview") return "preview";
  return "strict";
}

/**
 * Resolve a persona id into roles. Returns `null` — never a permissive default —
 * when the id is unknown or the mode is strict.
 */
export function resolvePersona(personaId: string | null | undefined, mode: "strict" | "preview" | "off" = authMode()): PersonaOverride | null {
  if (mode === "strict") return null;
  if (!personaId) return null;
  const key = personaId.trim().toLowerCase() as PersonaId;
  const persona = E2E_PERSONAS[key];
  if (!persona) return null;
  const roles = parseRoles(persona.roles);
  if (roles.length === 0) return null;
  return { persona: key, actorId: `persona_${key}`, roles };
}

/** Read the persona from the request cookies (server components / actions). */
export async function resolvePersonaFromCookies(): Promise<PersonaOverride | null> {
  const mode = authMode();
  if (mode === "strict") return null;
  try {
    const store = await cookies();
    return resolvePersona(store.get(PERSONA_COOKIE)?.value, mode);
  } catch {
    // No request context (build-time render, unit test) → no override.
    return null;
  }
}
