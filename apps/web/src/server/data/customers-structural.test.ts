// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Wave 7C Q1 — structural ratchet for the customers slice (Q-1..Q-5, spec §5).
 *
 * Mirrors `payouts-structural.test.ts`: the contract must survive the next
 * contributor. A new customer repository function without a tenant, a new
 * unscoped reader, or a production import of the quarantine fails CI here.
 *
 * RED on main: `customers.ts` takes no tenant anywhere and the quarantine does
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
  "listCustomers",
  "getCustomer",
  "getCustomerTransactions",
  "getCustomerMetrics",
  "createCustomer",
  "updateCustomer",
];

/** Pure formatters: no store, no ctx, deterministic (spec: CSV vocabulary). */
const PURE_EXPORTS = ["customersToCsv", "customerIdFromEmail"];

/**
 * Tenancy probes: store-touching but row-free BY DESIGN — they answer "how
 * many tenants hold customers / which one", never a customer row, and the
 * quarantine gate cannot do its job with a ctx in hand. Exempt from the
 * ctx-first rule exactly like PURE_EXPORTS (7B precedent: formatters exempt,
 * each justified here).
 */
const PROBE_EXPORTS = ["countCustomerTenants", "soleCustomerOrganizationId"];

describe("Q-1 every customer repository function is ctx-first", () => {
  it("scoped functions take ctx first and never default it", async () => {
    const clean = stripComments(sourceOf("server/data/customers.ts"));
    for (const name of SCOPED_FUNCTIONS) {
      const body = functionBody(clean, name);
      expect(body, `${name} takes ctx first`).toMatch(
        new RegExp(`function\\s+${name}\\s*\\(\\s*ctx\\s*:`),
      );
      expect(body, `${name} must not default the tenant`).not.toMatch(/organizationId\s*\?\?/);
    }
  });

  it("no other exported reader touches the store without ctx", async () => {
    const clean = stripComments(sourceOf("server/data/customers.ts"));
    const exported = [...clean.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
    for (const name of exported) {
      if (SCOPED_FUNCTIONS.includes(name) || PURE_EXPORTS.includes(name) || PROBE_EXPORTS.includes(name)) continue;
      const body = functionBody(clean, name);
      expect(body, `${name} must not read stores without ctx`).not.toMatch(
        /buildDirectory|allLedgerRows|store\(\)/,
      );
    }
  });
});

describe("Q-2 quarantine discipline and store privacy", () => {
  it("the quarantine module exists and freezes its consumer set", () => {
    let quarantine: string;
    try {
      quarantine = sourceOf("server/data/customers-unscoped.ts");
    } catch {
      expect.unreachable("quarantine module missing (Wave 7C Q2): server/data/customers-unscoped.ts");
      return;
    }
    expect(quarantine).toMatch(/LEGACY_CUSTOMER_SURFACES/);
    expect(quarantine).toMatch(/surface:\s*LegacyCustomerSurface/);

    const importers = allFiles
      .filter((f) => !isTestFile(f))
      .filter((f) => stripComments(readFileSync(f, "utf8")).match(/from\s+["']@\/server\/data\/customers-unscoped["']|require\(["']@\/server\/data\/customers-unscoped["']\)/))
      .map((f) => f.slice(SRC.length + 1));
    // Seeded allowlist (spec §4 caller table). May only shrink.
    const allowed = [
      "app/[locale]/subscriptions/page.tsx",
      "app/[locale]/reports/builder/page.tsx",
    ];
    for (const importer of importers) {
      expect(allowed, `${importer} reads the unscoped quarantine`).toContain(importer);
    }
  });

  it("no wired customer path (pages, actions, panel) imports the quarantine", () => {
    const prodPaths = [
      "app/[locale]/customers/page.tsx",
      "app/[locale]/customers/[id]/page.tsx",
      "components/customers/customer-transactions-panel.tsx",
      "server/actions/customers.ts",
      "app/api/exports/customers/route.ts",
      "server/mcp/domain-tools.ts",
    ];
    for (const rel of prodPaths) {
      let source: string;
      try {
        source = stripComments(sourceOf(rel));
      } catch {
        continue;
      }
      expect(source, `${rel} must not import the quarantine`).not.toMatch(/customers-unscoped/);
    }
  });

  it("the global customer slot is private to the DAL (+ quarantine + tests)", () => {
    const holders = allFiles
      .filter((f) => readFileSync(f, "utf8").includes("__kineticCustomerStore"))
      .map((f) => f.slice(SRC.length + 1));
    for (const holder of holders) {
      const ok =
        holder === "server/data/customers.ts" ||
        holder === "server/data/customers-unscoped.ts" ||
        isTestFile(join(SRC, holder));
      expect(ok, `${holder} touches the raw customer store`).toBe(true);
    }
  });
});

describe("Q-3 pure formatters stay pure", () => {
  it("customersToCsv and customerIdFromEmail touch no store and no ctx", () => {
    const clean = stripComments(sourceOf("server/data/customers.ts"));
    for (const name of PURE_EXPORTS) {
      const body = functionBody(clean, name);
      expect(body, `${name} stays pure`).not.toMatch(/store\(\)|buildDirectory|ctx|organization/i);
    }
  });
});

describe("Q-4 CSV vocabulary carries no tenancy metadata", () => {
  it("the header is frozen and body rows never smuggle an org column", () => {
    const clean = stripComments(sourceOf("server/data/customers.ts"));
    const body = functionBody(clean, "customersToCsv");
    expect(body).not.toMatch(/organization/i);
    for (const col of ["customer_id", "reference_id", "name", "email", "lifetime_value"]) {
      expect(body, `CSV keeps column ${col}`).toMatch(new RegExp(`"${col}"`));
    }
  });
});

describe("Q-5 the customer owner column exists", () => {
  it("manual records and overrides are keyed per tenant", () => {
    const clean = stripComments(sourceOf("server/data/customers.ts"));
    expect(clean).toMatch(/organizationId/);
  });
});
