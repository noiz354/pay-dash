import { afterEach, describe, expect, it } from "vitest";

import { hasPermission, ORGANIZATION_ROLES, parseRoles } from "@/domain/organization/roles";
import {
  E2E_PERSONAS,
  PERSONA_COOKIE,
  PERSONA_IDS,
  resolvePersona,
  resolvePersonaFromCookies,
} from "./test-persona";

// Wave 4 §9 — the E2E persona harness.
//
// The cross-role journeys need a test to *become* two different actors. That is
// only safe because the override sits at a narrow seam, and the assertions below
// are the reason it can ship: in strict mode it is never read at all, and when it
// is read it can only ever select a role that exists in the canonical RBAC enum.

const ORIGINAL = process.env.AUTH_ENFORCED;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AUTH_ENFORCED;
  else process.env.AUTH_ENFORCED = ORIGINAL;
});

describe("resolvePersona — the security seam", () => {
  it("never resolves in strict mode, whatever the request claims", () => {
    for (const id of [...PERSONA_IDS, "rina", "OWNER", "admin", "*"]) {
      expect(resolvePersona(id, "strict")).toBeNull();
    }
  });

  it("resolves a known persona in preview and off modes", () => {
    for (const mode of ["preview", "off"] as const) {
      const out = resolvePersona("hendri", mode);
      expect(out).not.toBeNull();
      expect(out?.persona).toBe("hendri");
      expect(out?.roles).toEqual(["FINANCE_ADMIN"]);
      expect(out?.actorId).toBe("persona_hendri");
    }
  });

  it("returns null — never a permissive default — for an unknown id", () => {
    expect(resolvePersona("nobody", "preview")).toBeNull();
    expect(resolvePersona("OWNER", "preview")).toBeNull(); // a role name is not a persona
    expect(resolvePersona("", "preview")).toBeNull();
    expect(resolvePersona(null, "preview")).toBeNull();
    expect(resolvePersona(undefined, "preview")).toBeNull();
    expect(resolvePersona("__proto__", "preview")).toBeNull();
    expect(resolvePersona("constructor", "preview")).toBeNull();
  });

  it("is case-insensitive and trims whitespace (a cookie value, not an API)", () => {
    expect(resolvePersona("  HENDRI ", "preview")?.persona).toBe("hendri");
  });

  it("yields only canonical roles", () => {
    for (const id of PERSONA_IDS) {
      const out = resolvePersona(id, "preview");
      expect(out).not.toBeNull();
      for (const role of out?.roles ?? []) expect(ORGANIZATION_ROLES).toContain(role);
      // parseRoles is the same validator production uses, so a persona can never
      // smuggle in a role the RBAC matrix does not define.
      expect(out?.roles).toEqual(parseRoles(out?.roles ?? []));
    }
  });

  it("defaults to strict when AUTH_ENFORCED is unset or unrecognised", () => {
    for (const value of [undefined, "", "yes", "on", "1", "true", "preview-ish"]) {
      if (value === undefined) delete process.env.AUTH_ENFORCED;
      else process.env.AUTH_ENFORCED = value;
      expect(resolvePersona("rina"), `AUTH_ENFORCED=${String(value)}`).toBeNull();
    }
  });

  it("honours AUTH_ENFORCED=off and =preview from the environment", () => {
    for (const value of ["off", "preview", "0", "false"]) {
      process.env.AUTH_ENFORCED = value;
      expect(resolvePersona("rina"), `AUTH_ENFORCED=${value}`).not.toBeNull();
    }
  });

  it("returns null outside a request context instead of throwing", async () => {
    delete process.env.AUTH_ENFORCED; // strict
    await expect(resolvePersonaFromCookies()).resolves.toBeNull();
    process.env.AUTH_ENFORCED = "off";
    // No cookie store in a unit test: the catch branch must yield null, not a
    // permissive OWNER fallback.
    await expect(resolvePersonaFromCookies()).resolves.toBeNull();
  });
});

describe("the canonical persona roster (spec §3)", () => {
  it("covers PID PER-001..PER-008 exactly once", () => {
    const pids = PERSONA_IDS.map((id) => E2E_PERSONAS[id].pid).sort();
    expect(pids).toEqual(["PER-001", "PER-002", "PER-003", "PER-004", "PER-005", "PER-006", "PER-007", "PER-008"]);
  });

  it("gives every persona a distinct actor id — dual control depends on it", () => {
    const actorIds = PERSONA_IDS.map((id) => resolvePersona(id, "preview")?.actorId);
    expect(new Set(actorIds).size).toBe(PERSONA_IDS.length);
    expect(actorIds.every((a) => typeof a === "string" && a.length > 0)).toBe(true);
  });

  it("names every persona without embedding PII", () => {
    for (const id of PERSONA_IDS) {
      const { name } = E2E_PERSONAS[id];
      expect(name.length).toBeGreaterThan(0);
      expect(name).not.toMatch(/@/);
    }
  });

  it("uses the documented cookie name", () => {
    expect(PERSONA_COOKIE).toBe("paydash_persona");
  });
});

describe("the journeys the harness exists to test (spec §9)", () => {
  it("JRN-003: Agus can request a refund but cannot execute it", () => {
    const agus = resolvePersona("agus", "preview");
    expect(agus?.roles).toEqual(["SUPPORT"]);
    expect(hasPermission("SUPPORT", "refund.prepare")).toBe(true);
    expect(hasPermission("SUPPORT", "refund.execute")).toBe(false);
  });

  it("JRN-003: Hendri can execute it, and is a different actor from Agus", () => {
    const hendri = resolvePersona("hendri", "preview");
    const agus = resolvePersona("agus", "preview");
    expect(hasPermission("FINANCE_ADMIN", "refund.execute")).toBe(true);
    expect(hendri?.actorId).not.toBe(agus?.actorId);
  });

  it("JRN-021: Dinda creates a payout batch, Hendri releases it", () => {
    expect(hasPermission("FINANCE_OPERATOR", "payout.create")).toBe(true);
    expect(hasPermission("FINANCE_OPERATOR", "payout.release")).toBe(false);
    expect(hasPermission("FINANCE_ADMIN", "payout.release")).toBe(true);
    expect(resolvePersona("dinda", "preview")?.actorId).not.toBe(resolvePersona("hendri", "preview")?.actorId);
  });

  it("gives the E2E suite a persona for every role it must assert against", () => {
    const covered = new Set(PERSONA_IDS.flatMap((id) => [...(resolvePersona(id, "preview")?.roles ?? [])]));
    for (const role of ORGANIZATION_ROLES) expect(covered.has(role), `${role} has no persona`).toBe(true);
  });
});
