// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Wave 7G Q1 — structural ratchet for the ingest & integrity slice (GS-1..GS-5).
 *
 * Mirrors `identity-structural.test.ts` (7F), `billing-structural.test.ts` (7D),
 * `customers-structural.test.ts` (7C) and `payouts-structural.test.ts` (7B): the
 * contract has to survive the next contributor. A new ingest repository function
 * without a tenant, a payment that resolves a foreign link before checking the
 * tenant, an unattributable callback silently landing in the demo tenant, a
 * `risk` or `links` quarantine appearing where none is needed, or an
 * `organization` column in the blocklist CSV fails CI here rather than in a
 * review comment.
 *
 * RED on `6c104ab`: none of the five DALs takes a tenant (except
 * `recordLinkPayment`, which takes one and then ignores it for the read); the
 * three quarantines this slice needs do not exist; `links.ts`, `risk.ts` and
 * `webhooks.ts` still read the ledger through the 7A quarantine.
 *
 * **Recorded design decisions (spec §4.1/§4.2, verified at Q0).**
 * - `links-unscoped.ts` must **never** exist: `links.ts` has no derived
 *   `server/data/*` consumer, so every caller is wireable in-wave. GS-4 forbids
 *   the file (the 7D R-4 shape) — a quarantine that exists is a quarantine 7E
 *   must later delete.
 * - `webhooks-unscoped.ts` (3 surfaces), `blocklist-unscoped.ts` (1) and
 *   `risk-unscoped.ts` (2) *are* earned: their only consumers are `audit.ts`,
 *   `command-center.ts` and `handoff.ts`, all Wave 7E derived surfaces.
 * - `onboarding.ts` is deliberately **not** a webhook quarantine consumer: 7F
 *   degraded its callback count to `0` because `listWebhooks()` was
 *   process-wide; 7G wires it to the scoped read instead, which closes that half
 *   of D-29. GS-4 pins that it never imports a quarantine.
 * - Ingress attribution is **named debt**, not a silent pass: one shared
 *   provider URL for all tenants and a connection→org mapping keyed by
 *   `connectionId` mean an unattributable callback lands in a dedicated
 *   `UNATTRIBUTED_ORGANIZATION_ID` partition visible to no tenant. GS-2/GS-5 pin
 *   that it never resolves to the demo organization.
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

/** The real body of an exported function, brace-matched. Handles generic type
 * parameters (`<T, P>`), default-parameter braces (`= {}`) and object-literal
 * return types (`Promise<{ … }>`) by walking past the full signature before
 * brace-matching the body. */
function functionBody(clean: string, name: string): string {
  const start = clean.search(new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\s*(?:<[^>]*>)?\\s*\\(`));
  expect(start, `${name} must be an exported function`).toBeGreaterThanOrEqual(0);
  // Walk past the parameter list: find the matching close paren.
  let i = clean.indexOf("(", start);
  let parenDepth = 0;
  for (; i < clean.length; i++) {
    if (clean[i] === "(") parenDepth++;
    else if (clean[i] === ")") {
      parenDepth--;
      if (parenDepth === 0) { i++; break; }
    }
  }
  // Skip the return-type annotation: braces inside `<…>` (e.g. `Promise<{…}>`)
  // belong to the type, not the body. Walk forward tracking angle/brace depth
  // and stop at the first `{` that opens the actual block.
  let angleDepth = 0;
  let typeBraceDepth = 0;
  for (; i < clean.length; i++) {
    const c = clean[i];
    if (c === "<") angleDepth++;
    else if (c === ">") angleDepth--;
    else if (c === "{") {
      if (angleDepth === 0 && typeBraceDepth === 0) break;
      typeBraceDepth++;
    } else if (c === "}") typeBraceDepth--;
  }
  const open = i;
  let depth = 0;
  for (let j = open; j < clean.length; j++) {
    if (clean[j] === "{") depth++;
    else if (clean[j] === "}") {
      depth--;
      if (depth === 0) return clean.slice(start, j + 1);
    }
  }
  return clean.slice(start);
}

const WEBHOOKS = "server/data/webhooks.ts";
const LINKS = "server/data/links.ts";
const BLOCKLIST = "server/data/blocklist.ts";
const RISK = "server/data/risk.ts";
const IDEMPOTENCY = "server/data/idempotency.ts";
const TIMELINE = "server/data/timeline.ts";

/** Functions that must take `ctx: OrganizationContext` first (spec C-1). */
const SCOPED_WEBHOOKS = ["listWebhooks", "getWebhookEvent", "getSystemWebhookSummary", "recordInbound"];
const SCOPED_LINKS = ["listLinks", "getLink", "createLink", "expireLink", "recordLinkPayment"];
const SCOPED_BLOCKLIST = ["listBlocklist", "getBlocklistEntry", "blocklistSummary", "addBlocklist", "removeBlocklist"];
const SCOPED_RISK = ["getRiskOverview", "patchDraft", "deployRiskSettings", "discardDraft"];
const SCOPED_IDEMPOTENCY = [
  "storeIdempotencyResult",
  "checkIdempotency",
  "executeWithIdempotency",
  "checkConflict",
  "checkForConflict",
];

/**
 * The ingress door writers: they persist a callback whose tenant could not be
 * determined, so they take no ctx BY DESIGN and write only to the unattributed
 * partition. Named debt (spec P-1/P-10) — allowlisted here, pinned by GS-2 and
 * GS-5 so the allowance can never widen into a tenant write.
 */
const DOOR_WEBHOOKS = ["recordUnattributedInbound", "rejectInbound"];

/** Pure functions: no store, no ctx, deterministic. */
const PURE_LINKS = ["totalOf", "deriveLinkStatus"];
const PURE_BLOCKLIST = ["isValidIp", "maskCardNumber", "isValidEmailDomain", "blocklistToCsv"];
const PURE_RISK = ["deriveAlerts"];
const PURE_IDEMPOTENCY = ["generateIdempotencyKey", "generateSimpleIdempotencyKey", "generateKeyPrefix"];
const PURE_TIMELINE = [
  "timelineKey",
  "dedupeTimeline",
  "sortTimeline",
  "buildTimeline",
  "actionForLabel",
  "timelineFromTransactionEvents",
  "timelineFromPayoutEvents",
];

/** Row-free tenancy probes: the quarantine gate and the seam's demo refusal. */
const PROBE_WEBHOOKS = ["countWebhookTenants", "soleWebhookOrganizationId"];
const PROBE_LINKS = ["countLinkTenants", "soleLinkOrganizationId"];
const PROBE_BLOCKLIST = ["countBlocklistTenants", "soleBlocklistOrganizationId"];
const PROBE_RISK = ["countRiskTenants", "soleRiskOrganizationId"];
const PROBE_IDEMPOTENCY = ["countIdempotencyTenants", "soleIdempotencyOrganizationId"];

/** Production callers that must be wired to the seam — the Q0 caller table (§3.2). */
const INGEST_PROD_PATHS = [
  "app/[locale]/webhooks/page.tsx",
  "app/[locale]/webhooks/[id]/page.tsx",
  "app/[locale]/system/page.tsx",
  "app/[locale]/ai-journal/ops-copilot/page.tsx",
  "app/[locale]/ai-journal/readiness-agent/page.tsx",
  "app/[locale]/payments/links/page.tsx",
  "app/[locale]/payments/links/[id]/page.tsx",
  "app/[locale]/fraud/page.tsx",
  "app/[locale]/fraud/blocklist/page.tsx",
  "app/[locale]/risk/page.tsx",
  "app/api/exports/blocklist/route.ts",
  "app/api/webhooks/xendit/route.ts",
  "app/api/webhooks/stripe/route.ts",
  "server/webhooks/store-delivery.ts",
  "server/actions/webhooks.ts",
  "server/actions/links.ts",
  "server/actions/blocklist.ts",
  "server/actions/risk.ts",
  "server/mcp/domain-tools.ts",
  // 7F degraded this to 0 callbacks; 7G wires it to the scoped read instead.
  "server/data/onboarding.ts",
];

const QUARANTINES = [
  { file: "server/data/webhooks-unscoped.ts", allowlist: "LEGACY_WEBHOOK_SURFACES", surfaces: ["audit", "command-center", "handoff"], dal: WEBHOOKS },
  { file: "server/data/blocklist-unscoped.ts", allowlist: "LEGACY_BLOCKLIST_SURFACES", surfaces: ["audit"], dal: BLOCKLIST },
  { file: "server/data/risk-unscoped.ts", allowlist: "LEGACY_RISK_SURFACES", surfaces: ["audit", "handoff"], dal: RISK },
];

/** Modules that must never be quarantined — every caller is wireable in-wave. */
const FORBIDDEN_QUARANTINES = [
  "server/data/links-unscoped.ts",
  "server/data/idempotency-unscoped.ts",
  "server/data/timeline-unscoped.ts",
];

describe("GS-1 every ingest repository function is ctx-first", () => {
  it.each([
    [WEBHOOKS, SCOPED_WEBHOOKS],
    [LINKS, SCOPED_LINKS],
    [BLOCKLIST, SCOPED_BLOCKLIST],
    [RISK, SCOPED_RISK],
    [IDEMPOTENCY, SCOPED_IDEMPOTENCY],
  ])("%s takes ctx first and never defaults it", (file, names) => {
    const clean = stripComments(sourceOf(file as string));
    for (const name of names as string[]) {
      const body = functionBody(clean, name);
      expect(body, `${name} takes ctx first`).toMatch(
        new RegExp(`function\\s+${name}\\s*(?:<[^>]*>)?\\s*\\(\\s*ctx\\s*:\\s*OrganizationContext`),
      );
      // `ctx: OrganizationContext = …` is a default organization wearing a costume.
      expect(body, `${name} must not default the tenant`).not.toMatch(/ctx\s*:\s*OrganizationContext\s*=/);
      expect(body, `${name} must not fall back to a tenant`).not.toMatch(/organizationId\s*\?\?/);
    }
  });

  it.each([
    [WEBHOOKS, [...SCOPED_WEBHOOKS, ...DOOR_WEBHOOKS, ...PROBE_WEBHOOKS], /store\(\)|readPartition\(/],
    [LINKS, [...SCOPED_LINKS, ...PURE_LINKS, ...PROBE_LINKS], /store\(\)|readPartition\(/],
    [BLOCKLIST, [...SCOPED_BLOCKLIST, ...PURE_BLOCKLIST, ...PROBE_BLOCKLIST], /store\(\)|readPartition\(/],
    [RISK, [...SCOPED_RISK, ...PURE_RISK, ...PROBE_RISK], /store\(\)|readPartition\(/],
    [IDEMPOTENCY, [...SCOPED_IDEMPOTENCY, ...PURE_IDEMPOTENCY, ...PROBE_IDEMPOTENCY], /store\(\)|readPartition\(|idempotencyStore/],
  ])("%s has no other exported reader touching a store without ctx", (file, exempt, storePattern) => {
    const clean = stripComments(sourceOf(file as string));
    const exported = [...clean.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
    for (const name of exported) {
      if ((exempt as string[]).includes(name)) continue;
      const body = functionBody(clean, name);
      expect(body, `${name} must not read an ingest store without ctx`).not.toMatch(storePattern as RegExp);
    }
  });

  it("the five DALs are server-only, so no client bundle can reach them", () => {
    for (const rel of [WEBHOOKS, LINKS, BLOCKLIST, RISK, IDEMPOTENCY]) {
      const source = stripComments(sourceOf(rel)).trimStart();
      expect(source.startsWith('import "server-only";'), rel).toBe(true);
    }
  });

  it("the door writers are the only ctx-less writers, and they are named as debt", () => {
    const clean = stripComments(sourceOf(WEBHOOKS));
    for (const name of DOOR_WEBHOOKS) {
      const body = functionBody(clean, name);
      expect(body, `${name} takes no ctx by design`).not.toMatch(/ctx\s*:\s*OrganizationContext/);
      // …and therefore may only ever write to the unattributed partition.
      expect(body, `${name} writes only to the unattributed partition`).toMatch(/UNATTRIBUTED_ORGANIZATION_ID/);
      expect(body, `${name} must not attribute to a tenant`).not.toMatch(/DEFAULT_DEMO_ORG/);
    }
    // The allowance is exactly two functions — it may not widen.
    expect(sourceOf(WEBHOOKS)).toMatch(/@deprecated|unattributable|named debt/i);
  });
});

describe("GS-2 the money and attribution paths check the tenant before they act", () => {
  it("recordLinkPayment resolves the tenant before it resolves the link", () => {
    const body = functionBody(stripComments(sourceOf(LINKS)), "recordLinkPayment");
    const scopeAt = body.search(/scopeOf\(ctx\)|parseOrganizationContext\(ctx\)/);
    const readAt = body.search(/readPartition\(|\.links\.find\(/);
    const writeAt = body.search(/createTransaction\(/);
    expect(scopeAt, "recordLinkPayment resolves the tenant explicitly").toBeGreaterThanOrEqual(0);
    expect(readAt, "recordLinkPayment reads a link").toBeGreaterThanOrEqual(0);
    expect(writeAt, "recordLinkPayment credits a ledger").toBeGreaterThanOrEqual(0);
    expect(scopeAt, "tenant before the link read").toBeLessThan(readAt);
    expect(scopeAt, "tenant before the ledger write").toBeLessThan(writeAt);
    // A foreign link is attributed and refused loudly, never silently paid.
    expect(body).toMatch(/recordTenantDenial/);
    expect(body).toMatch(/TenantIsolationError/);
  });

  it("expireLink and removeBlocklist refuse a foreign row before writing", () => {
    const expire = functionBody(stripComments(sourceOf(LINKS)), "expireLink");
    expect(expire.search(/scopeOf\(ctx\)|parseOrganizationContext\(ctx\)/)).toBeLessThan(expire.search(/cancelledAt\s*=/));
    expect(expire).toMatch(/TenantIsolationError/);

    const remove = functionBody(stripComments(sourceOf(BLOCKLIST)), "removeBlocklist");
    expect(remove.search(/scopeOf\(ctx\)|parseOrganizationContext\(ctx\)/)).toBeLessThan(remove.search(/splice\(/));
    expect(remove).toMatch(/TenantIsolationError/);
  });

  it("no ingest read widens past the caller's partition", () => {
    const cases: [string, string][] = [
      [WEBHOOKS, "listWebhooks"],
      [LINKS, "listLinks"],
      [BLOCKLIST, "listBlocklist"],
      [RISK, "getRiskOverview"],
    ];
    for (const [file, name] of cases) {
      const body = functionBody(stripComments(sourceOf(file)), name);
      expect(body, `${name} reads its own partition`).toMatch(/readPartition\(|scopeOf\(ctx\)/);
      // The M1/M6 mutation shape: flattening every partition back into one list.
      expect(body, `${name} must not flatten all partitions`).not.toMatch(/flatMap\(/);
      expect(body, `${name} must not read the raw store`).not.toMatch(/store\(\)\.(events|links|entries)/);
    }
  });

  it("the unattributed partition can never be the demo organization", () => {
    const source = sourceOf(WEBHOOKS);
    expect(source).toMatch(/export const UNATTRIBUTED_ORGANIZATION_ID\s*=\s*"unresolved"/);
    expect(source).not.toMatch(/UNATTRIBUTED_ORGANIZATION_ID\s*=\s*DEFAULT_DEMO_ORG/);
    // No door path may substitute the demo tenant for a missing attribution.
    for (const rel of ["app/api/webhooks/xendit/route.ts", "app/api/webhooks/stripe/route.ts", "server/webhooks/store-delivery.ts"]) {
      const clean = stripComments(sourceOf(rel));
      expect(clean, `${rel} must not default an unattributable event to demo`).not.toMatch(
        /organizationId\s*:\s*(DEFAULT_DEMO_ORG|input\.organizationId\s*\?\?\s*DEFAULT_DEMO_ORG)/,
      );
    }
  });

  it("idempotency takes the tenant from the context, not from a trusted parameter", () => {
    const clean = stripComments(sourceOf(IDEMPOTENCY));
    for (const name of SCOPED_IDEMPOTENCY) {
      const body = functionBody(clean, name);
      expect(body, `${name} must not accept an orgId parameter`).not.toMatch(/^\s*orgId\s*:\s*string/m);
      expect(body, `${name} derives the tenant from ctx`).toMatch(/scopeOf\(ctx\)|parseOrganizationContext\(ctx\)/);
    }
    // The pure generators keep their explicit orgId — they are functions of it.
    expect(functionBody(clean, "generateIdempotencyKey")).toMatch(/orgId\s*:\s*string/);
    expect(functionBody(clean, "generateKeyPrefix")).toMatch(/orgId\s*:\s*string/);
  });
});

describe("GS-3 purity: derivations and validators never touch a store", () => {
  it.each([
    [LINKS, PURE_LINKS],
    [BLOCKLIST, PURE_BLOCKLIST],
    [RISK, PURE_RISK],
    [IDEMPOTENCY, PURE_IDEMPOTENCY],
    [TIMELINE, PURE_TIMELINE],
  ])("%s pure functions read no store and take no ctx", (file, names) => {
    const clean = stripComments(sourceOf(file as string));
    for (const name of names as string[]) {
      const body = functionBody(clean, name);
      expect(body, `${name} takes no ctx`).not.toMatch(/ctx\s*:\s*OrganizationContext/);
      expect(body, `${name} reads no store`).not.toMatch(/store\(\)|readPartition\(|globalThis|legacyLedgerRows|getLedgerRows/);
    }
  });

  it("timeline.ts imports no store at all (P-7 verify-only)", () => {
    const source = sourceOf(TIMELINE);
    expect(source).not.toMatch(/from "\.\/(transactions|webhooks|links|blocklist|risk|payouts|customers)"/);
    expect(source).not.toMatch(/-unscoped/);
    expect(source).not.toMatch(/globalThis/);
  });

  it("the scoped DALs no longer read the ledger through the 7A quarantine", () => {
    for (const rel of [LINKS, RISK, WEBHOOKS]) {
      const source = stripComments(sourceOf(rel));
      expect(source, `${rel} must read the scoped ledger`).not.toMatch(/legacyLedgerRows\(/);
      expect(source, `${rel} must not import the quarantine`).not.toMatch(/transactions-unscoped/);
      expect(source, `${rel} reads the ledger with a context`).toMatch(/getLedgerRows\(ctx\)|listTransactions\(ctx/);
    }
  });
});

describe("GS-4 quarantine discipline: three earned modules, none invented", () => {
  it.each(QUARANTINES.map((q) => [q.file]))("%s exists, is deprecated and names its surface", (file) => {
    expect(existsSync(join(SRC, file as string)), `${file} must exist for its un-scopable 7E consumer`).toBe(true);
    const source = sourceOf(file as string);
    expect(source).toMatch(/@deprecated/);
    expect(source).toMatch(/more than one tenant/);
    // It may read, but it may not expose a way to write anything.
    expect(source).not.toMatch(/export (async )?function (create|update|delete|mutate|record|reject|expire|remove|add|patch|deploy|discard|store|execute)/);
  });

  it.each(QUARANTINES.map((q) => [q.file, q.allowlist, q.surfaces]))("%s freezes %s to exactly its earned surfaces", (file, allowlist, surfaces) => {
    const source = sourceOf(file as string);
    const list = source.slice(source.indexOf(allowlist as string), source.indexOf("] as const"));
    const entries = [...list.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
    expect(entries.sort()).toEqual([...(surfaces as string[])].sort());
  });

  it.each(FORBIDDEN_QUARANTINES.map((f) => [f]))("%s must never exist", (file) => {
    expect(existsSync(join(SRC, file as string)), `${file} is not needed — every caller is wireable in-wave`).toBe(false);
  });

  it("no production ingest path imports any quarantine", () => {
    for (const rel of INGEST_PROD_PATHS) {
      const source = stripComments(sourceOf(rel));
      expect(source, `${rel} must not import an unscoped reader`).not.toMatch(/-unscoped/);
    }
  });

  it("the only quarantine consumers are the three Wave 7E derived surfaces", () => {
    const consumers = allFiles
      .filter((f) => !isTestFile(f))
      .filter((f) => /webhooks-unscoped|blocklist-unscoped|risk-unscoped/.test(readFileSync(f, "utf8")))
      .map(relOf)
      .filter((f) => !QUARANTINES.some((q) => q.file === f))
      .sort();
    expect(consumers).toEqual(["server/data/audit.ts", "server/data/command-center.ts", "server/data/handoff.ts"]);
  });

  it("LEGACY_LEDGER_SURFACES shrank to the seven surfaces 7E owns", () => {
    const source = sourceOf("server/data/transactions-unscoped.ts");
    const list = source.slice(source.indexOf("LEGACY_LEDGER_SURFACES"), source.indexOf("] as const"));
    const entries = [...list.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]).sort();
    expect(entries).toEqual(["audit", "balance", "command-center", "customers", "finance-snapshot", "handoff", "reports"]);
    // The three this wave cleared, pinned so they cannot come back.
    for (const gone of ["links", "risk", "webhooks", "onboarding", "invoices"]) {
      expect(entries, `${gone} must stay cleared`).not.toContain(gone);
    }
  });

  it("the 7A consumer ratchet dropped the three ingest modules", () => {
    const source = sourceOf("server/data/transactions-structural.test.ts");
    const list = source.slice(source.indexOf("ALLOWED_UNSCOPED_CONSUMERS"), source.indexOf("].sort()"));
    for (const gone of ["server/data/links.ts", "server/data/risk.ts", "server/data/webhooks.ts", "server/data/onboarding.ts"]) {
      expect(list, `${gone} must no longer read the ledger unscoped`).not.toContain(gone);
    }
  });

  it("probes are row-free: they count partitions and never return a row", () => {
    const cases: [string, string[]][] = [
      [WEBHOOKS, PROBE_WEBHOOKS],
      [LINKS, PROBE_LINKS],
      [BLOCKLIST, PROBE_BLOCKLIST],
      [RISK, PROBE_RISK],
      [IDEMPOTENCY, PROBE_IDEMPOTENCY],
    ];
    for (const [file, names] of cases) {
      const clean = stripComments(sourceOf(file));
      for (const name of names) {
        const body = functionBody(clean, name);
        expect(body, `${name} takes no ctx`).not.toMatch(/ctx\s*:\s*OrganizationContext/);
        expect(body, `${name} returns a count or an id only`).toMatch(/return\s+(?!\{[\s\S]*?(payload|items|entries|events|result))/);
        expect(body, `${name} must not expose row content`).not.toMatch(/\.payload|\.result|\.items\b|\.value\b/);
      }
    }
  });
});

describe("GS-5 wire vocabulary: CSV, slots and the named attribution debt", () => {
  it("the blocklist CSV header is frozen and carries no tenancy column", () => {
    const body = functionBody(stripComments(sourceOf(BLOCKLIST)), "blocklistToCsv");
    expect(body).toMatch(/"type,value,reason,added_at"/);
    expect(body).not.toMatch(/organization|tenant/i);
    expect(body, "the formatter takes rows, not a ctx").not.toMatch(/ctx\s*:\s*OrganizationContext/);
  });

  it("each store slot holds partitions, not one shared array", () => {
    const slots: [string, string][] = [
      [WEBHOOKS, "__kineticWebhooksStore"],
      [LINKS, "__kineticLinksStore"],
      [BLOCKLIST, "__kineticBlocklistStore"],
      [RISK, "__kineticRiskStore"],
      [IDEMPOTENCY, "__kineticIdempotencyStore"],
    ];
    for (const [file, slot] of slots) {
      const source = sourceOf(file);
      expect(source, `${file} keeps the ${slot} slot`).toMatch(new RegExp(slot));
      expect(source, `${file} partitions by tenant`).toMatch(/tenants\s*:\s*Map<string,/);
      // No module hands its raw store to a caller.
      expect(stripComments(source), `${file} must not export its store`).not.toMatch(/export (const|function) (store|readPartition|writePartition)\b/);
    }
  });

  it("rows that carry an owner declare organizationId", () => {
    expect(sourceOf(WEBHOOKS)).toMatch(/export type WebhookEvent = \{[\s\S]{0,900}organizationId: string \| null;/);
    expect(sourceOf(LINKS)).toMatch(/export type PaymentLink = \{[\s\S]{0,700}organizationId: string;/);
    expect(sourceOf(BLOCKLIST)).toMatch(/export type BlocklistEntry = \{[\s\S]{0,400}organizationId: string;/);
    expect(sourceOf(IDEMPOTENCY)).toMatch(/orgId: string;/);
  });

  it("the attribution debt is documented where it lives", () => {
    const delivery = sourceOf("server/webhooks/store-delivery.ts");
    expect(delivery).toMatch(/unresolved/);
    // Named debt must point at its owner, not sit silently.
    expect(delivery).toMatch(/7G|Wave 7G|D-30|attribution/i);
  });
});
