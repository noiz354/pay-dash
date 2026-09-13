// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Wave 7B Q1 — structural ratchet for the payouts slice (Q-1..Q-6, spec §5).
 *
 * Mirrors `transactions-structural.test.ts`: the contract must survive the next
 * contributor. A new payout repository function without a tenant, a new
 * unscoped reader, or a production import of the quarantine fails CI here.
 *
 * RED on main: `payouts.ts` takes no tenant anywhere and the quarantine does
 * not exist yet.
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

/** Functions that must take `ctx: OrganizationContext` first (spec C-1). */
const SCOPED_FUNCTIONS = [
  "listBatches",
  "getBatch",
  "getPayoutBatches",
  "getPayoutsOverview",
  "createBatch",
  "approveBatch",
  "cancelBatch",
  "retryBatchFailures",
  "retryRecipient",
  // P-6: settings and bank accounts are per-tenant state, so they are scoped too.
  "getPayoutSettings",
  "updatePayoutSettings",
  "listBankAccounts",
  "getDestinationAccount",
  "addBankAccount",
];

/** Pure, data-free exports exempt from the ctx-first rule (formatters only). */
const PURE_EXPORTS = ["deriveStatus", "summarise", "batchesToCsv", "recipientsToCsv"];

describe("Q-1 the payout repository boundary cannot be called without a tenant", () => {
  const source = sourceOf("server/data/payouts.ts");

  it.each(SCOPED_FUNCTIONS.map((name) => [name]))(
    "%s declares OrganizationContext as its first parameter",
    (name) => {
      const pattern = new RegExp(
        `export\\s+(?:async\\s+)?function\\s+${name}\\s*\\(\\s*ctx:\\s*OrganizationContext`,
      );
      expect(source, `${name} must take ctx: OrganizationContext first`).toMatch(pattern);
      // `ctx: OrganizationContext = …` would be a default organization in costume.
      expect(source).not.toMatch(
        new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\s*\\(\\s*ctx:\\s*OrganizationContext\\s*=`),
      );
    },
  );

  it("PayoutBatch carries its owner: no ownerless money-out row is expressible", () => {
    expect(source).toMatch(/export type PayoutBatch = \{[\s\S]{0,600}organizationId: string;/);
  });

  it("no default organization in the payout production path", () => {
    const clean = stripComments(source);
    expect(clean).not.toMatch(/organizationId\s*\?\?\s*["']org_demo/);
    expect(clean).not.toMatch(/\?\?\s*DEFAULT_DEMO_ORG/);
    expect(clean).not.toMatch(/ctx\s*\?\?/);
  });

  it("pure formatters stay exempt and stay pure (no store access)", () => {
    for (const name of PURE_EXPORTS) {
      expect(source).toContain(`export function ${name}`);
    }
    const clean = stripComments(source);
    for (const name of PURE_EXPORTS) {
      const body = functionBody(clean, name);
      expect(body).not.toMatch(/store\(\)|__kineticPayoutStore/);
    }
  });
});

describe("Q-2/Q-5 quarantine discipline and store privacy", () => {
  it("the quarantine module exists and freezes its consumer set", () => {
    let quarantine: string;
    try {
      quarantine = sourceOf("server/data/payouts-unscoped.ts");
    } catch {
      expect.unreachable("quarantine module missing (Wave 7B Q3): server/data/payouts-unscoped.ts");
      return;
    }
    expect(quarantine).toMatch(/LEGACY_PAYOUT_SURFACES/);
    // `surface` is a required literal argument so refusals name the caller.
    expect(quarantine).toMatch(/surface:\s*LegacyPayoutSurface/);

    const importers = allFiles
      .filter((f) => !isTestFile(f))
      .filter((f) => stripComments(readFileSync(f, "utf8")).match(/from\s+["']@\/server\/data\/payouts-unscoped["']|require\(["']@\/server\/data\/payouts-unscoped["']\)/))
      .map((f) => f.slice(SRC.length + 1));
    // Seeded allowlist (§3 caller table + export/MCP quarantine). May only shrink:
    // Q4 unwired "exports-payouts" and "mcp" (scoped in Q4.1/Q4.2, Q7 shrank
    // the list); Wave 7C unwires the rest.
    const allowed = [
      "server/data/balance.ts",
      "server/data/command-center.ts",
      "server/data/audit.ts",
      "server/data/handoff.ts",
      "server/finance/snapshot.ts",
      "app/[locale]/reports/builder/page.tsx",
    ];
    for (const importer of importers) {
      expect(allowed, `${importer} reads the unscoped quarantine`).toContain(importer);
    }
  });

  it("no wired payout path (pages, actions) imports the quarantine — reads there resolve a session tenant", () => {
    const prodPaths = [
      "app/[locale]/payouts/page.tsx",
      "app/[locale]/payouts/bulk/page.tsx",
      "app/[locale]/payouts/[id]/page.tsx",
      "app/[locale]/payouts/settings/page.tsx",
      "app/[locale]/balance/page.tsx",
      "server/actions/payouts.ts",
      "server/actions/balance.ts",
      "server/data/onboarding.ts",
    ];
    for (const rel of prodPaths) {
      let source: string;
      try {
        source = stripComments(sourceOf(rel));
      } catch {
        continue; // page moved — the walk-based test below still guards new readers
      }
      expect(source, `${rel} must not import the quarantine`).not.toMatch(/payouts-unscoped/);
    }
  });

  it("the global payout slot is private to the DAL (+ quarantine + tests)", () => {
    const holders = allFiles
      .filter((f) => readFileSync(f, "utf8").includes("__kineticPayoutStore"))
      .map((f) => f.slice(SRC.length + 1));
    for (const holder of holders) {
      const ok =
        holder === "server/data/payouts.ts" ||
        holder === "server/data/payouts-unscoped.ts" ||
        isTestFile(join(SRC, holder));
      expect(ok, `${holder} touches the global payout slot`).toBe(true);
    }
    expect(holders).toContain("server/data/payouts.ts");
  });

  it("CSV formatters never emit tenancy metadata", () => {
    const clean = stripComments(sourceOf("server/data/payouts.ts"));
    for (const name of ["batchesToCsv", "recipientsToCsv"]) {
      const body = functionBody(clean, name);
      expect(body).not.toMatch(/organizationId/i);
    }
  });
});
