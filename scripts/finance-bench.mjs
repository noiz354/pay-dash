#!/usr/bin/env node
/**
 * Wave 6 — Tier 1 capacity benchmark for the financial core.
 *
 * Scope, stated up front so the numbers are not over-read: this measures the
 * **pure computational cost** of the invariant checker and the reconciliation
 * matcher. It is not an HTTP load test, it does not exercise Postgres, and it
 * says nothing about production concurrency. What it does answer is the
 * question that decides whether these checks can run on the hot path or must
 * be scheduled: *how does the cost grow with the size of the book?*
 *
 * That distinction matters because an invariant checker that is O(n²) is a
 * checker you will quietly stop running once the ledger gets big — which is
 * exactly when you need it.
 *
 * Usage: node scripts/finance-bench.mjs [--out <path>] [--json]
 */

import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const JSON_ONLY = args.includes("--json");
const outIdx = args.indexOf("--out");
const OUT_PATH = outIdx >= 0 ? args[outIdx + 1] : null;

const log = (...m) => {
  if (!JSON_ONLY) console.log(...m);
};

/**
 * Import the TypeScript sources directly with jiti so the benchmark runs the
 * SAME code the tests verify, rather than a JavaScript re-implementation that
 * could drift from it. jiti is already a transitive dependency; this adds no
 * new tooling to the repo.
 */
async function loadModules() {
  const { createJiti } = await import(
    path.join(REPO_ROOT, "node_modules/.pnpm/jiti@2.7.0/node_modules/jiti/lib/jiti.mjs")
  );
  const appRoot = path.join(REPO_ROOT, "apps/web");
  const jiti = createJiti(path.join(appRoot, "bench.mjs"), {
    alias: { "@": path.join(appRoot, "src") },
    interopDefault: true,
  });

  const invariants = await jiti.import(path.join(appRoot, "src/domain/finance/invariants.ts"));
  const money = await jiti.import(path.join(appRoot, "src/domain/finance/money.ts"));
  const recon = await jiti.import(path.join(appRoot, "src/domain/finance/reconciliation.ts"));
  return { invariants, money, recon, close: async () => {} };
}

/** Run `fn` n times, return timing stats in ms. */
function bench(fn, iterations) {
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const t = performance.now();
    fn();
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  const pct = (p) => samples[Math.min(samples.length - 1, Math.floor((p / 100) * samples.length))];
  return {
    iterations,
    meanMs: Number((sum / samples.length).toFixed(4)),
    p50Ms: Number(pct(50).toFixed(4)),
    p95Ms: Number(pct(95).toFixed(4)),
    p99Ms: Number(pct(99).toFixed(4)),
    maxMs: Number(samples[samples.length - 1].toFixed(4)),
  };
}

function buildSnapshot(money, n) {
  const payments = [];
  const refunds = [];
  const payouts = [];
  for (let i = 0; i < n; i += 1) {
    payments.push({
      id: `pay_${i}`,
      status: "SUCCEEDED",
      captured: money.minor(100_000, "IDR"),
      fee: money.minor(2_500, "IDR"),
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    if (i % 10 === 0) {
      refunds.push({
        id: `ref_${i}`,
        paymentId: `pay_${i}`,
        status: "SUCCEEDED",
        amount: money.minor(10_000, "IDR"),
        createdAt: "2026-09-02T00:00:00.000Z",
      });
    }
    if (i % 50 === 0) {
      payouts.push({
        id: `po_${i}`,
        batchId: `b_${i}`,
        status: "SUCCEEDED",
        amount: money.minor(50_000, "IDR"),
        createdAt: "2026-09-03T00:00:00.000Z",
      });
    }
  }
  // Net inflow: fees are not part of the merchant balance.
  const netIn = (100_000 - 2_500) * n;
  const refundOut = refunds.length * 10_000;
  const payoutOut = payouts.length * 50_000;
  return {
    organizationId: "org-bench",
    currency: "IDR",
    asOf: "2026-09-12T00:00:00.000Z",
    postings: [],
    payments,
    refunds,
    payouts,
    transitions: [],
    settledInflow: money.minor(netIn, "IDR"),
    settledOutflow: money.minor(refundOut + payoutOut, "IDR"),
    balance: {
      opening: money.minor(0, "IDR"),
      reserved: money.minor(0, "IDR"),
      available: money.minor(netIn - refundOut - payoutOut, "IDR"),
    },
  };
}

function buildReconSides(money, n) {
  const mk = (i) => ({
    externalRef: `ref_${i}`,
    organizationId: "org-bench",
    amount: money.minor(100_000, "IDR"),
    status: "SUCCEEDED",
    observedAt: "2026-09-05T00:00:00.000Z",
  });
  const internal = [];
  const provider = [];
  const settlement = [];
  for (let i = 0; i < n; i += 1) {
    internal.push(mk(i));
    provider.push(mk(i));
    // 1% genuinely divergent so the matcher does real exception work.
    settlement.push(i % 100 === 0 ? { ...mk(i), amount: money.minor(99_999, "IDR") } : mk(i));
  }
  return { internal, provider, settlement };
}

/** Linear-fit check: is cost per record roughly constant as n grows 10x? */
function scalingVerdict(rows) {
  if (rows.length < 2) return { verdict: "INSUFFICIENT_DATA", detail: "" };
  const first = rows[0];
  const last = rows[rows.length - 1];
  const perRecordFirst = first.meanMs / first.n;
  const perRecordLast = last.meanMs / last.n;
  const ratio = perRecordLast / perRecordFirst;
  const verdict = ratio < 2 ? "LINEAR" : ratio < 5 ? "SUPERLINEAR_MILD" : "SUPERLINEAR_BAD";
  return {
    verdict,
    perRecordFirstMs: Number(perRecordFirst.toFixed(6)),
    perRecordLastMs: Number(perRecordLast.toFixed(6)),
    growthRatio: Number(ratio.toFixed(3)),
    detail:
      verdict === "LINEAR"
        ? "Per-record cost is stable across a 10x size increase — safe to run on every ledger."
        : "Per-record cost grows with size; schedule off the hot path and re-measure.",
  };
}

async function main() {
  const mods = await loadModules();
  const { checkLedgerInvariants } = mods.invariants;
  const { reconcile } = mods.recon;
  const money = mods.money;

  const machine = {
    node: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model ?? "unknown",
    totalMemGB: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
  };
  log("\n▸ Machine:", JSON.stringify(machine));
  log("  NOTE: a 2-core sandbox. Absolute numbers are a floor, not a production figure.\n");

  const report = { startedAt: new Date().toISOString(), machine, invariants: [], reconciliation: [] };

  const sizes = [100, 1_000, 10_000];
  log("▸ Invariant checker (INV-L1..L8)");
  for (const n of sizes) {
    const snap = buildSnapshot(money, n);
    // Warm up so we measure steady state, not JIT compilation.
    checkLedgerInvariants(snap);
    const iterations = n >= 10_000 ? 20 : n >= 1_000 ? 100 : 300;
    const stats = bench(() => checkLedgerInvariants(snap), iterations);
    const result = checkLedgerInvariants(snap);
    const row = { n, ...stats, ok: result.ok, fatalCount: result.fatalCount };
    report.invariants.push(row);
    log(`  n=${String(n).padStart(6)}  mean ${String(stats.meanMs).padStart(9)}ms  p95 ${String(stats.p95Ms).padStart(9)}ms  ok=${result.ok}`);
  }

  log("\n▸ Three-way reconciliation");
  for (const n of sizes) {
    const sides = buildReconSides(money, n);
    const input = {
      organizationId: "org-bench",
      window: { from: "2026-09-01T00:00:00.000Z", to: "2026-09-12T00:00:00.000Z" },
      internal: { available: true, records: sides.internal },
      provider: { available: true, records: sides.provider },
      settlement: { available: true, records: sides.settlement },
    };
    reconcile(input);
    const iterations = n >= 10_000 ? 10 : n >= 1_000 ? 50 : 200;
    const stats = bench(() => reconcile(input), iterations);
    const run = reconcile(input);
    const row = { n, ...stats, matched: run.totals.matched, exceptions: run.totals.exceptions };
    report.reconciliation.push(row);
    log(`  n=${String(n).padStart(6)}  mean ${String(stats.meanMs).padStart(9)}ms  p95 ${String(stats.p95Ms).padStart(9)}ms  exceptions=${run.totals.exceptions}`);
  }

  report.scaling = {
    invariants: scalingVerdict(report.invariants),
    reconciliation: scalingVerdict(report.reconciliation),
  };
  report.tier = "TIER_1_COMPUTE_ONLY";
  report.notRun = [
    "TIER_2 HTTP load test (no load generator; would need k6/autocannon — deferred rather than faked)",
    "Postgres-backed throughput (Prisma engines unavailable in this sandbox)",
    "Concurrency//contention testing under parallel writers",
  ];
  report.finishedAt = new Date().toISOString();

  log(`\n▸ Scaling: invariants=${report.scaling.invariants.verdict} (x${report.scaling.invariants.growthRatio}), reconciliation=${report.scaling.reconciliation.verdict} (x${report.scaling.reconciliation.growthRatio})`);

  const json = JSON.stringify(report, null, 2);
  if (JSON_ONLY) console.log(json);
  if (OUT_PATH) {
    await writeFile(path.resolve(REPO_ROOT, OUT_PATH), json, "utf8");
    log(`\n  Evidence written to ${OUT_PATH}`);
  }
  await mods.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("BENCH ERROR:", err);
  process.exit(1);
});
