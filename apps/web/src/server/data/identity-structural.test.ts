// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Wave 7F Q1 — structural ratchet for the identity & access slice (FS-1..FS-5).
 *
 * Mirrors `billing-structural.test.ts` (7D), `customers-structural.test.ts` (7C)
 * and `payouts-structural.test.ts` (7B): the contract has to survive the next
 * contributor. A new identity repository function without a tenant, a plaintext
 * API secret reaching the store or a listing, a role mutation that checks the
 * role before the tenant, or an `organization` column in the team CSV fails CI
 * here rather than in a review comment.
 *
 * RED on `f7cb1e2`: none of the four DALs takes a tenant; `onboarding.ts` reads
 * the ledger through the 7A quarantine; the three slice quarantines this wave
 * needs do not exist yet.
 *
 * **Recorded design decision (spec §4, verified at Q2).** Unlike Wave 7D, this
 * slice *does* earn quarantine modules — but only for the two consumers that
 * belong to another wave: `server/data/audit.ts` (reads `listApiKeys` +
 * `listMembers`; audit is a Wave 7E derived surface over four unscoped owners)
 * and `server/data/handoff.ts` (reads `getKycSubmission`; also 7E). Scoping
 * either in-wave would drag 7E's whole derived-surface retrofit into 7F, which
 * the no-mega-diff rule forbids. So: `team-unscoped.ts` (`["audit"]`),
 * `settings-unscoped.ts` (`["audit"]`) and — the spec's *conditional* module,
 * earned rather than assumed — `kyc-unscoped.ts` (`["handoff"]`). Every other
 * caller (5 settings pages, team page, kyc page, 2 onboarding pages, 3 action
 * modules, the team export route, the dashboard header, 5 MCP tools, plus the
 * in-slice `kyc.ts`/`onboarding.ts` and the cross-slice `invoices.ts` note 7D
 * left) is wired directly, and FS-4 pins that no wired path imports a
 * quarantine. Per `WAVE_ROADMAP_7D_TO_11.md` §4.2 the creation of
 * `kyc-unscoped.ts` is recorded with the caller that forced it.
 */

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(full)) {
      out.push(full);
    }
  }
  return out;
}

const allFiles = walk(SRC);
const relOf = (f: string) => relative(SRC, f).replace(/\\/g, "/");
const sourceOf = (relPath: string) => readFileSync(join(SRC, relPath), "utf8");
const isTestFile = (f: string) => /\.test\.tsx?$/.test(f);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** The real body of an exported function, brace-matched. */
function functionBody(clean: string, name: string): string {
  const start = clean.search(new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\s*\\(`));
  expect(start, `${name} must be an exported function`).toBeGreaterThanOrEqual(0);
  const open = clean.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < clean.length; i++) {
    if (clean[i] === "{") depth++;
    else if (clean[i] === "}") {
      depth--;
      if (depth === 0) return clean.slice(start, i + 1);
    }
  }
  return clean.slice(start);
}

const TEAM = "server/data/team.ts";
const SETTINGS = "server/data/settings.ts";
const KYC = "server/data/kyc.ts";
const ONBOARDING = "server/data/onboarding.ts";

/** Functions that must take `ctx: OrganizationContext` first (spec C-1). */
const SCOPED_TEAM = [
  "listMembers",
  "getMember",
  "inviteMember",
  "changeMemberRole",
  "deactivateMember",
  "reactivateMember",
  "resendInvite",
  "revokeInvite",
  "roleCatalog",
];
const SCOPED_SETTINGS = [
  "getMerchantProfile",
  "updateMerchantProfile",
  "getNotificationSettings",
  "setNotificationChannel",
  "updateNotificationTopic",
  "listApiKeys",
  "getApiKey",
  "createApiKey",
  "revokeApiKey",
  "rollApiKey",
  "getDeveloperSettings",
  "setDeveloperToggle",
  "addIpAllowEntry",
  "removeIpAllowEntry",
  "getSettingsOverview",
];
const SCOPED_KYC = ["getKycSubmission", "submitKycDocument", "removeKycDocument", "profileKycCompleteness"];
const SCOPED_ONBOARDING = ["getOnboardingStatus"];

/** Pure formatters: no store, no ctx, deterministic. */
const PURE_TEAM = ["membersToCsv"];

/**
 * Tenancy probes: store-touching but row-free BY DESIGN — they answer "how many
 * tenants hold members/settings/documents" and "which one, if exactly one",
 * never a member, a key or a document. They are the quarantine gate and the
 * seam's demo-fallback refusal, so they cannot take a ctx (7C/7D precedent).
 */
const PROBE_TEAM = ["countTeamTenants", "soleTeamOrganizationId"];
const PROBE_SETTINGS = ["countSettingsTenants", "soleSettingsOrganizationId"];
const PROBE_KYC = ["countKycTenants", "soleKycOrganizationId"];

/** Production callers that must be wired to the seam — the Q2 caller table. */
const IDENTITY_PROD_PATHS = [
  "app/[locale]/team/page.tsx",
  "app/api/exports/team/route.ts",
  "server/actions/team.ts",
  "app/[locale]/settings/page.tsx",
  "app/[locale]/settings/merchant/page.tsx",
  "app/[locale]/settings/notifications/page.tsx",
  "app/[locale]/settings/api-keys/page.tsx",
  "app/[locale]/settings/developer/page.tsx",
  "server/actions/settings.ts",
  "components/dashboard/dashboard-header.tsx",
  "app/[locale]/kyc/page.tsx",
  "server/actions/kyc.ts",
  "app/[locale]/onboarding/page.tsx",
  "app/[locale]/ai-journal/readiness-agent/page.tsx",
  "server/mcp/domain-tools.ts",
];

const QUARANTINES = [
  { file: "server/data/team-unscoped.ts", allowlist: "LEGACY_TEAM_SURFACES", surfaces: ["audit"], dal: TEAM },
  { file: "server/data/settings-unscoped.ts", allowlist: "LEGACY_SETTINGS_SURFACES", surfaces: ["audit"], dal: SETTINGS },
  { file: "server/data/kyc-unscoped.ts", allowlist: "LEGACY_KYC_SURFACES", surfaces: ["handoff"], dal: KYC },
];

describe("FS-1 every identity repository function is ctx-first", () => {
  it.each([
    [TEAM, SCOPED_TEAM],
    [SETTINGS, SCOPED_SETTINGS],
    [KYC, SCOPED_KYC],
    [ONBOARDING, SCOPED_ONBOARDING],
  ])("%s takes ctx first and never defaults it", (file, names) => {
    const clean = stripComments(sourceOf(file as string));
    for (const name of names as string[]) {
      const body = functionBody(clean, name);
      expect(body, `${name} takes ctx first`).toMatch(
        new RegExp(`function\\s+${name}\\s*\\(\\s*ctx\\s*:\\s*OrganizationContext`),
      );
      // `ctx: OrganizationContext = …` is a default organization wearing a costume.
      expect(body, `${name} must not default the tenant`).not.toMatch(/ctx\s*:\s*OrganizationContext\s*=/);
      expect(body, `${name} must not fall back to a tenant`).not.toMatch(/organizationId\s*\?\?/);
    }
  });

  it.each([
    [TEAM, [...SCOPED_TEAM, ...PURE_TEAM, ...PROBE_TEAM], /seedMembers\(\)|store\(\)/],
    [SETTINGS, [...SCOPED_SETTINGS, ...PROBE_SETTINGS], /defaultStore\(\)|store\(\)/],
    [KYC, [...SCOPED_KYC, ...PROBE_KYC], /store\(\)/],
    [ONBOARDING, [...SCOPED_ONBOARDING], /store\(\)/],
  ])("%s has no other exported reader touching a store without ctx", (file, exempt, storePattern) => {
    const clean = stripComments(sourceOf(file as string));
    const exported = [...clean.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
    for (const name of exported) {
      if ((exempt as string[]).includes(name)) continue;
      const body = functionBody(clean, name);
      expect(body, `${name} must not read an identity store without ctx`).not.toMatch(storePattern as RegExp);
    }
  });

  it("the four DALs are server-only, so no client bundle can reach them", () => {
    for (const rel of [TEAM, SETTINGS, KYC, ONBOARDING]) {
      const source = sourceOf(rel);
      // team.ts starts with a long comment block before its imports.
      expect(stripComments(source).trimStart().startsWith('import "server-only";'), rel).toBe(true);
    }
  });
});

describe("FS-2 the role and secret mutations check the tenant before they act", () => {
  it("changeMemberRole resolves scope, then reads, then writes — in that order", () => {
    const body = functionBody(stripComments(sourceOf(TEAM)), "changeMemberRole");
    const scopeAt = body.search(/scopeOf\(ctx\)|parseOrganizationContext\(ctx\)/);
    const writeAt = body.search(/\.role\s*=/);
    expect(scopeAt, "changeMemberRole resolves the tenant explicitly").toBeGreaterThanOrEqual(0);
    expect(writeAt, "changeMemberRole writes a role").toBeGreaterThanOrEqual(0);
    expect(scopeAt, "the tenant check precedes the role write").toBeLessThan(writeAt);
    // A foreign member is attributed and refused loudly, never silently re-roled.
    expect(body).toMatch(/memberOwnedByAnotherTenant/);
    expect(body).toMatch(/recordTenantDenial/);
    expect(body).toMatch(/TenantIsolationError/);
  });

  it("updateMerchantProfile resolves the tenant before it writes the identity", () => {
    const body = functionBody(stripComments(sourceOf(SETTINGS)), "updateMerchantProfile");
    const scopeAt = body.search(/scopeOf\(ctx\)|parseOrganizationContext\(ctx\)/);
    const writeAt = body.search(/writePartition\(|s\.merchant\s*=|merchant\s*=/);
    expect(scopeAt, "updateMerchantProfile resolves the tenant explicitly").toBeGreaterThanOrEqual(0);
    expect(writeAt, "updateMerchantProfile writes a profile").toBeGreaterThanOrEqual(0);
    expect(scopeAt, "the tenant check precedes the profile write").toBeLessThan(writeAt);
  });

  it("inviteMember takes the owner from the context, never from the input", () => {
    const body = functionBody(stripComments(sourceOf(TEAM)), "inviteMember");
    expect(body).toMatch(/scopeOf\(ctx\)|parseOrganizationContext\(ctx\)/);
    expect(body, "the input type carries no tenant").not.toMatch(/input\.organizationId/);
    expect(sourceOf(TEAM)).toMatch(/export type InviteMemberInput = \{ name: string; email: string; role: TeamRole \};/);
  });
});

describe("FS-3 API secrets never outlive their one-time reveal", () => {
  it("the stored key row holds a mask, not a secret", () => {
    const clean = stripComments(sourceOf(SETTINGS));
    expect(clean).toMatch(/export type ApiKey = \{[\s\S]{0,400}maskedSecret: string;/);
    // No `secret: string` field on the persisted row, and no plaintext column.
    expect(clean).not.toMatch(/export type ApiKey = \{[\s\S]{0,500}\bsecret:\s*string;/);
  });

  it("the plaintext secret exists only in the create/roll return value", () => {
    const clean = stripComments(sourceOf(SETTINGS));
    for (const name of ["listApiKeys", "getApiKey", "revokeApiKey"]) {
      const body = functionBody(clean, name);
      expect(body, `${name} must not return a plaintext secret`).not.toMatch(/randomSecret|\bsecret\b/);
    }
    // createApiKey/rollApiKey may — that is the reveal-once contract.
    expect(functionBody(clean, "createApiKey")).toMatch(/secret/);
  });

  it("the key listing cannot widen past the caller's partition", () => {
    const body = functionBody(stripComments(sourceOf(SETTINGS)), "listApiKeys");
    expect(body).toMatch(/readPartition\(|scopeOf\(ctx\)/);
    expect(body, "the environment filter narrows, it never widens").not.toMatch(/store\(\)\.keys/);
  });
});

describe("FS-4 quarantine discipline: three modules, frozen allowlists, no wired consumer", () => {
  it.each(QUARANTINES.map((q) => [q.file]))("%s exists, is deprecated and names its surface", (file) => {
    expect(existsSync(join(SRC, file as string)), `${file} must exist for the un-scopable 7E consumer`).toBe(true);
    const source = sourceOf(file as string);
    expect(source).toMatch(/@deprecated/);
    expect(source).toMatch(/more than one tenant/);
    // It may read, but it may not expose a way to write anything.
    expect(source).not.toMatch(/export (async )?function (create|update|delete|mutate|invite|change|deactivate|revoke|roll|submit|remove|set|add)/);
  });

  it.each(QUARANTINES.map((q) => [q.allowlist, q.surfaces]))("%s is frozen to exactly its earned surfaces", (name, surfaces) => {
    for (const q of QUARANTINES.filter((x) => x.allowlist === name)) {
      const source = sourceOf(q.file);
      const list = source.slice(source.indexOf(q.allowlist), source.indexOf("] as const"));
      for (const surface of surfaces as string[]) {
        expect(list, `${q.allowlist} keeps ${surface}`).toContain(`"${surface}"`);
      }
      // Shrink-only: no surface beyond the earned ones (a re-grow is a plan change).
      const entries = [...list.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
      expect(entries.sort()).toEqual([...(surfaces as string[])].sort());
    }
  });

  it("no production identity path imports any quarantine", () => {
    for (const rel of IDENTITY_PROD_PATHS) {
      const source = stripComments(sourceOf(rel));
      expect(source, `${rel} must not import an unscoped reader`).not.toMatch(/-unscoped/);
    }
  });

  it("the only quarantine consumers are the two Wave 7E derived surfaces", () => {
    const consumers = allFiles
      .filter((f) => !isTestFile(f))
      .filter((f) => /team-unscoped|settings-unscoped|kyc-unscoped/.test(readFileSync(f, "utf8")))
      .map(relOf)
      .filter((f) => !QUARANTINES.some((q) => q.file === f))
      .sort();
    expect(consumers).toEqual(["server/data/audit.ts", "server/data/handoff.ts"]);
  });

  it("onboarding reads the ledger scoped, and the 7A allowlist shrank for it", () => {
    const source = stripComments(sourceOf(ONBOARDING));
    expect(source, "onboarding must not ride the ledger quarantine").not.toMatch(/transactions-unscoped/);
    expect(source).toMatch(/getLedgerRows|listTransactions/);

    const ledger = sourceOf("server/data/transactions-unscoped.ts");
    const list = ledger.slice(ledger.indexOf("LEGACY_LEDGER_SURFACES"), ledger.indexOf("] as const"));
    expect(list, "the ledger allowlist may only shrink").not.toMatch(/"onboarding"/);
  });

  it("the tenancy probes are reachable only from fail-closed infrastructure", () => {
    const probes = [...PROBE_TEAM, ...PROBE_SETTINGS, ...PROBE_KYC];
    const consumers = allFiles
      .filter((f) => !isTestFile(f))
      .filter((f) => probes.some((p) => readFileSync(f, "utf8").includes(p)))
      .map(relOf)
      .filter((f) => f !== TEAM && f !== SETTINGS && f !== KYC)
      .sort();
    expect(consumers).toEqual([
      "server/data/kyc-unscoped.ts",
      "server/data/settings-unscoped.ts",
      "server/data/team-unscoped.ts",
      "server/services/identity-organization-context.ts",
    ]);
  });
});

describe("FS-5 CSV vocabulary, store privacy and the owner column", () => {
  it("the team CSV header is frozen and carries no org column", () => {
    const body = functionBody(stripComments(sourceOf(TEAM)), "membersToCsv");
    expect(body).not.toMatch(/organization/i);
    for (const col of ["id", "name", "email", "role", "status", "joined_at", "invited_at", "last_active_at"]) {
      expect(body, `CSV keeps column ${col}`).toMatch(new RegExp(`"${col}"`));
    }
  });

  it.each([[TEAM, "membersToCsv"]])("%s formatters touch no store and no ctx", (file, name) => {
    const body = functionBody(stripComments(sourceOf(file as string)), name as string);
    expect(body, `${name} stays pure`).not.toMatch(/store\(|ctx|organization/i);
  });

  it.each([
    ["__kineticTeamStore", TEAM, ["server/data/team-unscoped.ts"]],
    ["__kineticSettingsStore", SETTINGS, ["server/data/settings-unscoped.ts"]],
    ["__kineticKycStore", KYC, ["server/data/kyc-unscoped.ts"]],
  ])("the %s slot is private to its DAL and its quarantine", (slot, owner, also) => {
    const holders = allFiles
      .filter((f) => readFileSync(f, "utf8").includes(slot as string))
      .map(relOf);
    for (const holder of holders) {
      const ok = holder === owner || (also as string[]).includes(holder) || isTestFile(join(SRC, holder));
      expect(ok, `${holder} touches the raw ${slot} slot`).toBe(true);
    }
  });

  it("identity rows carry an owner column", () => {
    expect(stripComments(sourceOf(TEAM))).toMatch(/export type Member = \{[\s\S]{0,300}organizationId: string;/);
    expect(stripComments(sourceOf(SETTINGS))).toMatch(/export type ApiKey = \{[\s\S]{0,400}organizationId: string;/);
  });
});
