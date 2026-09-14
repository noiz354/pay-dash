// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Wave 7D Q1 — structural ratchet for the billing slice (R-1..R-5, spec §5).
 *
 * Mirrors `customers-structural.test.ts` (7C) and `payouts-structural.test.ts`
 * (7B): the contract has to survive the next contributor. A new billing
 * repository function without a tenant, a new unscoped reader, a quarantine
 * import in a production path, or an `organization` column in a CSV fails CI
 * here rather than in a review comment.
 *
 * RED on `af18cc4`: neither DAL takes a tenant anywhere, `invoices.ts` reads the
 * ledger through the 7A quarantine, and `subscriptions/page.tsx` reads the
 * directory through the 7C quarantine.
 *
 * **Recorded design decision (spec §4, verified at Q2).** The caller table is
 * small and fully wireable in-wave — subscriptions: page, export route, action,
 * MCP tool; invoices: two pages, two export routes, action, MCP tool. There is
 * therefore no not-yet-scoped surface to quarantine, and this wave creates
 * **no** `*-unscoped.ts` module. R-4 pins that outcome: an empty allowlist file
 * would be dead code, so the ratchet forbids the module instead of enumerating
 * permitted consumers. Per `WAVE_ROADMAP_7D_TO_11.md` §4.2 both planned slice
 * quarantines are recorded as *not created*.
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

const SUBSCRIPTIONS = "server/data/subscriptions.ts";
const INVOICES = "server/data/invoices.ts";

/** Functions that must take `ctx: OrganizationContext` first (spec C-1). */
const SCOPED_SUBSCRIPTIONS = ["listSubscriptions", "getSubscription", "createSubscription"];
const SCOPED_INVOICES = [
  "listInvoices",
  "getInvoice",
  "getInvoiceTransactions",
  "getInvoiceLineItems",
  "getInvoiceTimeline",
  "getBillingSummary",
  "payInvoice",
  "invoiceStatementCsv",
];

/** Pure formatters: no store, no ctx, deterministic (CSV vocabulary is frozen). */
const PURE_SUBSCRIPTIONS = ["monthlyRecurring", "subscriptionSummary"];
const PURE_INVOICES = ["invoicesToCsv", "periodLabelFor"];

/**
 * Tenancy probes: store-touching but row-free BY DESIGN — they answer "how many
 * tenants hold billing rows / which one", never an invoice or a plan, and the
 * seam's demo-fallback refusal cannot do its job with a ctx in hand. Exempt from
 * ctx-first exactly like 7C's `countCustomerTenants` / `soleCustomerOrganizationId`.
 */
const PROBE_SUBSCRIPTIONS = ["countSubscriptionTenants", "soleSubscriptionOrganizationId"];
const PROBE_INVOICES = ["countInvoiceTenants", "soleInvoiceOrganizationId"];

/** Production callers that must be wired to the seam — the Q2 caller table. */
const BILLING_PROD_PATHS = [
  "app/[locale]/subscriptions/page.tsx",
  "app/[locale]/billing/page.tsx",
  "app/[locale]/billing/[id]/page.tsx",
  "app/api/exports/subscriptions/route.ts",
  "app/api/exports/invoices/route.ts",
  "app/api/exports/invoices/[id]/route.ts",
  "server/actions/invoices.ts",
  "server/actions/subscriptions.ts",
  "server/mcp/domain-tools.ts",
];

describe("R-1 every billing repository function is ctx-first", () => {
  it.each([
    [SUBSCRIPTIONS, SCOPED_SUBSCRIPTIONS],
    [INVOICES, SCOPED_INVOICES],
  ])("%s takes ctx first and never defaults it", (file, names) => {
    const clean = stripComments(sourceOf(file as string));
    for (const name of names as string[]) {
      const body = functionBody(clean, name);
      expect(body, `${name} takes ctx first`).toMatch(
        new RegExp(`function\\s+${name}\\s*\\(\\s*ctx\\s*:\\s*OrganizationContext`),
      );
      // `ctx: OrganizationContext = …` is a default organization wearing a costume.
      expect(body, `${name} must not default the tenant`).not.toMatch(
        /ctx\s*:\s*OrganizationContext\s*=/,
      );
      expect(body, `${name} must not fall back to a tenant`).not.toMatch(
        /organizationId\s*\?\?|DEFAULT_DEMO_ORG\s*\?\?/,
      );
    }
  });

  it.each([
    [SUBSCRIPTIONS, [...SCOPED_SUBSCRIPTIONS, ...PURE_SUBSCRIPTIONS, ...PROBE_SUBSCRIPTIONS], /seedPlans\(\)|store\(\)/],
    [INVOICES, [...SCOPED_INVOICES, ...PURE_INVOICES, ...PROBE_INVOICES], /buildInvoices\(|allLedgerRows\(|store\(\)/],
  ])("%s has no other exported reader touching the store without ctx", (file, exempt, storePattern) => {
    const clean = stripComments(sourceOf(file as string));
    const exported = [...clean.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
    expect(exported.length, `${file} should export its repository surface`).toBeGreaterThan(3);
    for (const name of exported) {
      if ((exempt as string[]).includes(name)) continue;
      const body = functionBody(clean, name);
      expect(body, `${name} must not read billing stores without ctx`).not.toMatch(storePattern as RegExp);
    }
  });
});

describe("R-2 the money mutation checks the tenant before it writes", () => {
  it("payInvoice resolves scope, then reads, then writes — in that order", () => {
    const clean = stripComments(sourceOf(INVOICES));
    const body = functionBody(clean, "payInvoice");
    const scopeAt = body.search(/scopeOf\(ctx\)|parseOrganizationContext\(ctx\)/);
    const writeAt = body.search(/writePartition\(|payments\[/);
    expect(scopeAt, "payInvoice resolves the tenant explicitly").toBeGreaterThanOrEqual(0);
    expect(writeAt, "payInvoice writes through the tenant partition").toBeGreaterThanOrEqual(0);
    expect(scopeAt, "the tenant check precedes the write").toBeLessThan(writeAt);
    // A foreign id is attributed and refused loudly, never silently written.
    expect(body).toMatch(/invoiceOwnedByAnotherTenant/);
    expect(body).toMatch(/recordTenantDenial/);
    expect(body).toMatch(/TenantIsolationError/);
  });
});

describe("R-3 pure formatters stay pure", () => {
  it.each([
    [SUBSCRIPTIONS, PURE_SUBSCRIPTIONS],
    [INVOICES, PURE_INVOICES],
  ])("%s formatters touch no store and no ctx", (file, names) => {
    const clean = stripComments(sourceOf(file as string));
    for (const name of names as string[]) {
      const body = functionBody(clean, name);
      expect(body, `${name} stays pure`).not.toMatch(/store\(|buildInvoices|seedPlans|ctx|organization/i);
    }
  });

  it("the client-safe subscription CSV serializer carries no tenancy metadata", () => {
    const csv = sourceOf("lib/subscription-csv.ts");
    expect(csv).toMatch(/export function subscriptionsToCsv/);
    expect(csv).not.toMatch(/organization/i);
    expect(csv, "the CSV stays a client-safe module").not.toMatch(/server-only/);
  });
});

describe("R-4 quarantine discipline: this slice has none, and stays that way", () => {
  it("no billing quarantine module exists", () => {
    for (const name of ["subscriptions-unscoped.ts", "invoices-unscoped.ts"]) {
      expect(existsSync(join(SRC, "server/data", name)), `server/data/${name} must not exist`).toBe(false);
    }
  });

  it("no production billing path imports any quarantine", () => {
    for (const rel of BILLING_PROD_PATHS) {
      const source = stripComments(sourceOf(rel));
      expect(source, `${rel} must not import an unscoped reader`).not.toMatch(/-unscoped/);
    }
  });

  it("the billing DALs no longer read the ledger or the directory unscoped", () => {
    // The two shrinks this wave earns: `invoices` out of LEGACY_LEDGER_SURFACES
    // (7A) and `subscriptions` out of LEGACY_CUSTOMER_SURFACES (7C).
    expect(stripComments(sourceOf(INVOICES))).not.toMatch(/transactions-unscoped/);
    expect(sourceOf(INVOICES)).toMatch(/listTransactions/);
    expect(stripComments(sourceOf("app/[locale]/subscriptions/page.tsx"))).not.toMatch(/customers-unscoped/);

    const ledger = sourceOf("server/data/transactions-unscoped.ts");
    expect(ledger).toMatch(/LEGACY_LEDGER_SURFACES/);
    const ledgerList = ledger.slice(ledger.indexOf("LEGACY_LEDGER_SURFACES"), ledger.indexOf("] as const"));
    expect(ledgerList, "the ledger allowlist may only shrink").not.toMatch(/"invoices"/);

    const customers = sourceOf("server/data/customers-unscoped.ts");
    const customerList = customers.slice(
      customers.indexOf("LEGACY_CUSTOMER_SURFACES"),
      customers.indexOf("] as const"),
    );
    expect(customerList, "the customer allowlist may only shrink").not.toMatch(/"subscriptions"/);
  });

  it("the tenancy probes are reachable only from fail-closed infrastructure", () => {
    const probes = [...PROBE_SUBSCRIPTIONS, ...PROBE_INVOICES];
    const consumers = allFiles
      .filter((f) => !isTestFile(f))
      .filter((f) => probes.some((p) => readFileSync(f, "utf8").includes(p)))
      .map(relOf)
      .filter((f) => f !== SUBSCRIPTIONS && f !== INVOICES)
      .sort();
    expect(consumers).toEqual(["server/services/billing-organization-context.ts"]);
  });
});

describe("R-5 CSV vocabulary and store privacy", () => {
  it("the invoice CSV header is frozen and carries no org column", () => {
    const body = functionBody(stripComments(sourceOf(INVOICES)), "invoicesToCsv");
    expect(body).not.toMatch(/organization/i);
    for (const col of ["invoice_id", "period_start", "period_end", "status", "amount", "currency", "paid_at"]) {
      expect(body, `CSV keeps column ${col}`).toMatch(new RegExp(`"${col}"`));
    }
  });

  it("the statement CSV never prints the owner", () => {
    const body = functionBody(stripComments(sourceOf(INVOICES)), "invoiceStatementCsv");
    // Wave 7D: the signature now names the owner *by type* (`ctx:
    // OrganizationContext`) — that is the scoping, not a leak. What must never
    // appear is the owner's value reaching the emitted rows: no organizationId
    // column, no org field in the header block, no tenant id in a line item.
    const payload = body.replace(/ctx:\s*OrganizationContext/g, "");
    expect(payload).not.toMatch(/organization/i);
  });

  it.each([
    ["__kineticSubscriptionStore", SUBSCRIPTIONS],
    ["__kineticInvoiceStore", INVOICES],
  ])("the %s slot is private to its DAL", (slot, owner) => {
    const holders = allFiles
      .filter((f) => readFileSync(f, "utf8").includes(slot as string))
      .map(relOf);
    for (const holder of holders) {
      const ok = holder === owner || isTestFile(join(SRC, holder));
      expect(ok, `${holder} touches the raw ${slot} slot`).toBe(true);
    }
  });

  it("billing rows carry an owner column", () => {
    expect(stripComments(sourceOf(SUBSCRIPTIONS))).toMatch(/organizationId/);
    expect(stripComments(sourceOf(INVOICES))).toMatch(/organizationId/);
  });
});
