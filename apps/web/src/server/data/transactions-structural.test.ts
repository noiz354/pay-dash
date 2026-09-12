// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import * as transactions from "./transactions";
import { OrganizationContextError } from "@/domain/tenancy/organization-context";

/**
 * Wave 7A — the structural tests (spec §5). These are the tests that make the
 * contract survive the next contributor: a slice that is only proven by
 * behavioural tests can be bypassed by one new function that "just needs the
 * rows". These files fail when that happens.
 *
 * They read source text on purpose. TypeScript cannot express "every exported
 * data function takes a tenant first" (a caller can always pass `{} as any`),
 * and a reviewer cannot hold 15 signatures in their head across 12 consumer
 * files. A 40-line source scan can.
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

/** Comments are where intent lives; they are not code. Structural scans that ask
 *  "does this body call that function" must not read a docblock as a call site. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** The real body of an exported function, brace-matched — a slice to the next
 *  `export` would swallow the neighbours and turn this test into noise. */
function functionBody(source: string, name: string): string {
  const clean = stripComments(source);
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

/**
 * Tenancy *probes*: they may be parameter-free because they answer a question
 * about the store ("how many tenants?", "is there exactly one?") and return a
 * number or an id — never a row. They are the quarantine's gate, and S-1c pins
 * that only the quarantine can import them.
 */
const GATE_EXPORTS = ["countLedgerTenants", "soleLedgerOrganizationId"];

/**
 * Pure, data-free exports. These are exempt from the first-parameter rule
 * because they cannot touch a row: formatters, normalizers, SLA maths.
 * Adding a name here is a design decision — the list is the audit trail for it.
 */
const PURE_EXPORTS = [
  "toCsv",
  "normalizeSlaFilter",
  "normalizeRefundStateFilter",
  "slaForTransaction",
  "evaluateTransactionSla",
  ...GATE_EXPORTS,
];

/** Every other exported function in the module is a repository function. */
const exportedFunctions = Object.keys(transactions).filter((k) => typeof (transactions as Record<string, unknown>)[k] === "function");

describe("S-1 the repository boundary cannot be called without a tenant", () => {
  const repoFunctions = exportedFunctions.filter((name) => !PURE_EXPORTS.includes(name));

  it("lists the functions it is auditing (a new export must be justified)", () => {
    expect(repoFunctions.length).toBeGreaterThanOrEqual(10);
    expect(repoFunctions).toEqual(expect.arrayContaining([
      "listTransactions",
      "getTransaction",
      "getTransactionWithSla",
      "getLedgerRows",
      "getLedgerMetrics",
      "getAnalyticsSeries",
      "listRefundsAwaiting",
      "createTransaction",
      "retryTransaction",
      "retryTransactionWithVersion",
      "refundTransaction",
      "requestRefund",
      "approveRefund",
      "rejectRefund",
      "seedDemoLedgerForOrganization",
    ]));
  });

  it.each(repoFunctions.map((name) => [name]))("%s declares OrganizationContext as its first parameter", (name) => {
    const source = sourceOf("server/data/transactions.ts");
    const fnName = name as string;
    const pattern = new RegExp(`export\\s+(?:async\\s+)?function\\s+${fnName}\\s*\\(\\s*ctx:\\s*OrganizationContext`);
    expect(source, `${fnName} must take ctx: OrganizationContext first`).toMatch(pattern);
  });

  it.each(repoFunctions.map((name) => [name]))("%s has no default context value", (name) => {
    const source = sourceOf("server/data/transactions.ts");
    const fnName = name as string;
    // `ctx: OrganizationContext = …` would be a default organization wearing a costume.
    expect(source).not.toMatch(new RegExp(`export\\s+(?:async\\s+)?function\\s+${fnName}\\s*\\(\\s*ctx:\\s*OrganizationContext\\s*=`));
  });

  it("calling a read or a write without a context throws rather than returning data", async () => {
    const offenders: string[] = [];
    for (const name of repoFunctions) {
      const fn = (transactions as unknown as Record<string, (...args: unknown[]) => unknown>)[name]!;
      try {
        const result = fn(undefined);
        // A promise that resolves to data is the failure mode; a rejected
        // promise is the wanted behaviour and lands in the catch below.
        const value = result && typeof (result as Promise<unknown>).then === "function" ? await result : result;
        if (Array.isArray(value) && value.length > 0) offenders.push(`${name}: returned ${value.length} rows with no context`);
        else if (value && typeof value === "object" && Object.keys(value).length > 0 && !("organizationId" in (value as object) === false)) {
          // Paginated-shaped results with total > 0 are the leak.
          const total = (value as { total?: number }).total;
          if (typeof total === "number" && total > 0) offenders.push(`${name}: total=${total} with no context`);
        }
      } catch (e) {
        if (!(e instanceof OrganizationContextError) && !(e instanceof Error)) offenders.push(`${name}: threw a non-context error (${String(e)})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the pure exports really are data-free", () => {
    const source = sourceOf("server/data/transactions.ts");
    for (const name of PURE_EXPORTS) {
      const idx = source.indexOf(`export function ${name}`) >= 0 ? source.indexOf(`export function ${name}`) : source.indexOf(`export async function ${name}`);
      expect(idx, name).toBeGreaterThanOrEqual(0);
      // Take the function body up to the next top-level `export ` and demand it
      // never hands out a row.
      void idx;
      const body = functionBody(source, name);
      expect(body, `${name} must not return rows`).not.toMatch(/scopedRows\(|getLedgerRows\(|findOwnedRow\(/);
      if (!GATE_EXPORTS.includes(name)) {
        expect(body, `${name} must not touch the store at all`).not.toContain("store()");
      } else {
        // A probe is only a probe because of what it returns. `: number` or
        // `: string | null` — anything else means a row escaped through the gate.
        const signature = body.slice(0, body.indexOf("{"));
        expect(signature, `${name} must return only tenancy metadata`).toMatch(/:\s*(number|string \| null)/);
      }
    }
  });
});

describe("S-2 the unscoped readers are a closed set", () => {
  const QUARANTINE = "server/data/transactions-unscoped.ts";

  /**
   * Wave 7B shrinks this list, one module per PR. It never grows: a *new*
   * unscoped reader fails this test, which is the point.
   */
  const ALLOWED_UNSCOPED_CONSUMERS = [
    "app/[locale]/reports/builder/page.tsx",
    "server/data/audit.ts",
    "server/data/balance.ts",
    "server/data/command-center.ts",
    "server/data/customers.ts",
    "server/data/handoff.ts",
    "server/data/invoices.ts",
    "server/data/links.ts",
    "server/data/onboarding.ts",
    "server/data/risk.ts",
    "server/data/webhooks.ts",
  ].sort();

  const consumers = allFiles
    .filter((f) => !isTestFile(f))
    .filter((f) => /from "[./]*transactions-unscoped"|from "@\/server\/data\/transactions-unscoped"/.test(readFileSync(f, "utf8")))
    .map((f) => relative(SRC, f).replace(/\\/g, "/"))
    .sort();

  it("only the frozen legacy modules read the ledger unscoped", () => {
    expect(consumers.length).toBeGreaterThan(0);
    for (const c of consumers) {
      expect(ALLOWED_UNSCOPED_CONSUMERS, `${c} is not allowed to read the ledger unscoped`).toContain(c);
    }
  });

  it("the quarantine module itself exists and is deprecated", () => {
    const source = sourceOf(QUARANTINE);
    expect(source).toMatch(/@deprecated/);
    expect(source).toMatch(/more than one tenant/);
    // It may read the store, but it may not expose a way to *write* anything.
    expect(source).not.toMatch(/export (async )?function (create|update|delete|mutate)/);
  });

  it("every unscoped call site names its surface explicitly", () => {
    const offenders: string[] = [];
    for (const rel of consumers) {
      const source = sourceOf(rel);
      const calls = source.match(/legacy(?:LedgerRows|ListTransactions|RefundQueue)\s*\(([^)]*)\)/g) ?? [];
      for (const call of calls) {
        if (/\(\s*\)/.test(call)) offenders.push(`${rel}: ${call}`);
        if (/\(\s*(?:[A-Za-z_$][\w$]*\s*=>|undefined|null)/.test(call)) offenders.push(`${rel}: ${call}`);
      }
      expect(calls.length, `${rel} imports the quarantine but never names a surface`).toBeGreaterThan(0);
    }
    expect(offenders).toEqual([]);
  });
});

describe("S-3 no transaction production path may read unscoped", () => {
  const TRANSACTION_PATHS = [
    "app/[locale]/transactions/page.tsx",
    "app/[locale]/transactions/[id]/page.tsx",
    "app/api/exports/transactions/route.ts",
    "server/actions/transactions.ts",
    "server/mcp/domain-tools.ts",
    "server/data/transactions.ts",
    "server/services/transaction-organization-context.ts",
  ];

  it.each(TRANSACTION_PATHS.map((p) => [p]))("%s resolves a tenant instead of defaulting", (relPath) => {
    const source = sourceOf(relPath as string);
    // Import position, not substring: these files may *talk about* the
    // quarantine in a comment, they may not depend on it.
    expect(source, `${relPath} must not import the quarantine`).not.toMatch(/from "[^"]*transactions-unscoped"/);
    if ((relPath as string).endsWith("server/data/transactions.ts")) {
      // The DAL itself must not look up a default tenant for a request.
      expect(source).not.toMatch(/organizationId\s*\?\?/);
      expect(source).not.toMatch(/ctx:\s*OrganizationContext\s*=/);
      // …and the demo constant may appear exactly once, inside the marked
      // dev/demo bootstrap block: provisioning the demo dataset is not the same
      // thing as defaulting a request, and this is the line that keeps them apart.
      // one occurrence is the import, one is the bootstrap; a third is a default.
      const hits = stripComments(source).match(/DEFAULT_DEMO_ORG/g) ?? [];
      expect(hits.length).toBeLessThanOrEqual(2);
      expect(hits.length).toBeGreaterThan(0);
      const block = source.slice(source.indexOf("// --- dev/demo store bootstrap"), source.indexOf("// --- end dev/demo store bootstrap"));
      expect(block).toContain("DEFAULT_DEMO_ORG");
    }
  });

  it("the pages and the export route obtain a context from the session", () => {
    for (const relPath of [
      "app/[locale]/transactions/page.tsx",
      "app/[locale]/transactions/[id]/page.tsx",
      "app/api/exports/transactions/route.ts",
    ]) {
      const source = sourceOf(relPath);
      expect(source, `${relPath} must resolve the tenant`).toMatch(
        /resolveTransactionOrganizationContext|requireTransactionOrganizationContext|transactionOrganizationContextFrom|parseOrganizationContext/,
      );
    }
  });

  it("every scoped call site in the transaction path passes ctx as the first argument", () => {
    const scopedFns = [
      "listTransactions",
      "getTransaction",
      "getTransactionWithSla",
      "getLedgerMetrics",
      "getAnalyticsSeries",
      "createTransaction",
      "refundTransaction",
      "retryTransactionWithVersion",
      "requestRefund",
      "approveRefund",
      "rejectRefund",
      "getLedgerRows",
      "listRefundsAwaiting",
    ];
    const offenders: string[] = [];
    for (const relPath of ["app/[locale]/transactions/page.tsx", "app/[locale]/transactions/[id]/page.tsx", "app/api/exports/transactions/route.ts", "server/actions/transactions.ts", "server/mcp/domain-tools.ts"]) {
      const source = sourceOf(relPath);
      for (const fn of scopedFns) {
        for (const match of source.matchAll(new RegExp(`(?:await\\s+)?${fn}\\s*\\(`, "g"))) {
          const after = source.slice(match.index! + match[0].length);
          const firstArg = after.slice(0, after.indexOf(",") >= 0 ? after.indexOf(",") : 40).trim();
          const looksLikeContext =
            /^(?:(?:access|ctx|context|scoped|orgCtx|organization|accessContext)(?:\.context)?\b)/.test(firstArg) ||
            /OrganizationContext|organizationContext\(/.test(firstArg);
          if (!looksLikeContext) offenders.push(`${relPath}: ${fn}(${firstArg.slice(0, 30)}…)`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("ID-only mutation helpers are gone from the exported surface", () => {
    // The old signatures took (id) / (id, amount, reason) with no tenant. They
    // may only survive inside the module that owns the store, never exported.
    const source = sourceOf("server/data/transactions.ts");
    for (const fn of ["retryTransaction", "requestRefund", "approveRefund", "rejectRefund", "refundTransaction", "getTransaction", "listTransactions"]) {
      const exported = new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\s*\\(`);
      expect(source, `${fn} must still be exported`).toMatch(exported);
      const decl = source.slice(source.search(exported), source.indexOf("{", source.search(exported)));
      expect(decl, `${fn} must not accept a bare id first`).toMatch(/ctx:\s*OrganizationContext/);
    }
  });
});

describe("S-1d the demo seeding seam is not reachable from a request", () => {
  /**
   * `seedDemoLedgerForOrganization` provisions deterministic demo rows for a
   * tenant. In a production path that is not a fixture helper, it is an
   * *authorization* bug with a friendly name: a caller could invent a tenant's
   * ledger (or, worse, a route could seed one and then read it back as if it
   * were real). Tests and the store's own bootstrap are its only users, so the
   * app tree may not import it at all.
   */
  const SEEDED_BY = ["server/data/transactions.ts", "server/data/transactions-unscoped.ts"];

  it("no file under app/, components/ or lib/ imports the seeder", () => {
    const offenders = allFiles
      .filter((f) => !isTestFile(f))
      .filter((f) => readFileSync(f, "utf8").includes("seedDemoLedgerForOrganization"))
      .map((f) => relative(SRC, f).replace(/\\/g, "/"))
      .filter((f) => !SEEDED_BY.includes(f));
    expect(offenders).toEqual([]);
  });

  it("the modules stay `server-only`, so no client bundle can reach the seeder", () => {
    // Components legitimately import *types* from the data layer; what keeps a
    // browser bundle from calling `seedDemoLedgerForOrganization` (or anything
    // else) is the `server-only` barrier on the module. Losing it would quietly
    // expose the whole DAL, so the barrier is asserted rather than assumed.
    for (const rel of ["server/data/transactions.ts", "server/data/transactions-unscoped.ts"]) {
      expect(sourceOf(rel).trimStart().startsWith('import "server-only";'), rel).toBe(true);
    }
  });
});

describe("S-4 the command palette cannot grow an unscoped read", () => {
  it("imports no data source at all", () => {
    const source = sourceOf("components/command-palette.tsx");
    expect(source).not.toMatch(/server\/data|server\/dal|@\/server\//);
    // It stays a navigation surface: no transaction symbol may appear.
    expect(source).not.toMatch(/\blistTransactions\b|\bgetTransaction\b|\bgetLedgerRows\b/);
  });
});

describe("S-6 the Postgres ledger cannot be read unscoped for transactions", () => {
  it("no server module reads prisma.ledgerEntry to answer a transaction query", () => {
    // LedgerEntry has no organizationId column (prisma/schema.prisma), so a
    // transaction read of it cannot be scoped. Deleted in Wave 7A; it may only
    // come back together with the column (debt D-26).
    const offenders = allFiles
      .filter((f) => !isTestFile(f))
      .filter((f) => /ledgerEntry\.(findMany|findFirst|findUnique|count|aggregate)/.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).replace(/\\/g, "/"));
    // Every file that touches the tenant-less table must say so: either it is the
    // refusing seam (server/dal/ledger.ts) or it is the balance aggregation that
    // Wave 7B owns. Both cite D-26; a third name in this list is a new leak.
    for (const f of offenders) {
      expect(readFileSync(join(SRC, f), "utf8"), f).toMatch(/D-26/);
    }
    expect(offenders.sort()).toEqual(["server/dal/ledger.ts", "server/mcp/pg-stores.ts"]);
  });

  it("pg-stores exposes no transaction reader without a context", () => {
    const source = sourceOf("server/mcp/pg-stores.ts");
    expect(source).not.toMatch(/export (async )?function (list|get)(Transactions|Transaction)Postgres/);
  });
});

describe("S-1c the tenancy gate is only reachable from the quarantine", () => {
  it("soleLedgerOrganizationId is imported by exactly one consumer", () => {
    const consumers = allFiles
      .filter((f) => !isTestFile(f))
      .filter((f) => readFileSync(f, "utf8").includes("soleLedgerOrganizationId"))
      .map((f) => relative(SRC, f).replace(/\\/g, "/"))
      .filter((f) => f !== "server/data/transactions.ts")
      .sort();
    expect(consumers).toEqual(["server/data/transactions-unscoped.ts"]);
  });
});

describe("S-5 the store slot is private to the DAL", () => {
  it("no production file outside transactions.ts touches the global store", () => {
    const offenders = allFiles
      .filter((f) => !isTestFile(f))
      .filter((f) => readFileSync(f, "utf8").includes("__kineticTxStore"))
      .map((f) => relative(SRC, f).replace(/\\/g, "/"))
      // The quarantine reads the store through the DAL's own accessor, and the
      // dev store bootstrap owns the slot; nothing else may.
      .filter((f) => f !== "server/data/transactions.ts");
    expect(offenders).toEqual([]);
  });

  it("export CSV columns are a frozen vocabulary with no tenancy metadata", () => {
    const csv = transactions.toCsv([]);
    expect(csv.split("\n")[0]).toBe(
      "reference_id,created_at,status,channel,method,customer_name,customer_email,amount,fee,net,currency",
    );
  });

  it("the ledger row type carries an owner in the DAL source", () => {
    const source = sourceOf("server/data/transactions.ts");
    expect(source).toMatch(/export type Transaction = \{[\s\S]{0,400}organizationId: string;/);
  });
});
