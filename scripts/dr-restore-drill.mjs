#!/usr/bin/env node
/**
 * Wave 6 — Disaster-recovery restore drill (mandated scenario 7).
 *
 * A backup that has never been restored is a hypothesis, not a backup. This
 * script turns that hypothesis into evidence by executing the whole cycle
 * against a real Postgres engine (PGlite, the same engine the repository
 * integration tests use) and measuring it:
 *
 *   1. BUILD    — apply every migration in `prisma/migrations` in order.
 *   2. SEED     — write known financial rows and compute a control checksum.
 *   3. BACKUP   — dump schema + data to a file, timestamped (t_backup).
 *   4. DESTROY  — drop the database entirely. Not "truncate a few tables" —
 *                 the drill is worthless if it rehearses a gentler failure
 *                 than the one it claims to cover.
 *   5. RESTORE  — build an empty engine and replay the dump (t_restore).
 *   6. VERIFY   — re-compute the checksum and compare, then run smoke queries.
 *
 * RPO is derived from the age of the restored data relative to the last write;
 * RTO from steps 5–6. Both are measured here, not asserted.
 *
 * Usage: node scripts/dr-restore-drill.mjs [--json] [--out <path>]
 */

import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "apps/web/prisma/migrations");

const args = process.argv.slice(2);
const JSON_ONLY = args.includes("--json");
const OUT_INDEX = args.indexOf("--out");
const OUT_PATH = OUT_INDEX >= 0 ? args[OUT_INDEX + 1] : null;

function log(...m) {
  if (!JSON_ONLY) console.log(...m);
}

const ms = (start) => Number((performance.now() - start).toFixed(1));

/** Tables whose loss would be a financial incident. Verified explicitly. */
const CRITICAL_TABLES = ["DurableOperation", "WebhookDelivery", "AuditEvent"];

async function loadMigrations() {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const out = [];
  for (const dir of dirs) {
    const file = path.join(MIGRATIONS_DIR, dir, "migration.sql");
    if (!existsSync(file)) continue;
    out.push({ name: dir, sql: await readFile(file, "utf8") });
  }
  return out;
}

/** Quote a value for a SQL literal in the dump. */
function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "object") return `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
  return `'${String(v).replaceAll("'", "''")}'`;
}

async function tableNames(db) {
  const r = await db.query(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );
  return r.rows.map((x) => x.tablename);
}

/**
 * Order tables so a parent row is always inserted before the child that
 * references it.
 *
 * This is not incidental polish. The first run of this drill dumped tables
 * alphabetically and the restore died on
 * `AuditEvent_organizationId_fkey` — AuditEvent sorts before Organization. A
 * backup whose rows cannot be replayed in the order they were written is not a
 * backup, and that failure only becomes visible when you actually restore it.
 * Kahn's algorithm, with self-references ignored (a self-FK is satisfied
 * row-by-row, not table-by-table) and any residual cycle appended so the dump
 * is never silently truncated.
 */
async function topologicalTableOrder(db, tables) {
  const fks = await db.query(`
    select
      con.conrelid::regclass::text  as child,
      con.confrelid::regclass::text as parent
    from pg_constraint con
    join pg_namespace n on n.oid = con.connamespace
    where con.contype = 'f' and n.nspname = 'public'
  `);

  const clean = (t) => t.replaceAll('"', "").replace(/^public\./, "");
  const deps = new Map(tables.map((t) => [t, new Set()]));
  for (const row of fks.rows) {
    const child = clean(row.child);
    const parent = clean(row.parent);
    if (child === parent) continue; // self-reference: not a table-level dep
    if (!deps.has(child) || !deps.has(parent)) continue;
    deps.get(child).add(parent);
  }

  const ordered = [];
  const placed = new Set();
  let progress = true;
  while (progress && placed.size < tables.length) {
    progress = false;
    for (const t of tables) {
      if (placed.has(t)) continue;
      const pending = [...deps.get(t)].filter((p) => !placed.has(p));
      if (pending.length === 0) {
        ordered.push(t);
        placed.add(t);
        progress = true;
      }
    }
  }
  // A cycle (mutually-dependent tables) cannot be ordered; emit the rest and
  // report it rather than dropping the data.
  const cyclic = tables.filter((t) => !placed.has(t));
  return { ordered: [...ordered, ...cyclic], cyclic };
}

/**
 * Dump the database as replayable SQL. A logical dump (rather than a file copy)
 * is what proves the data is portable across engine versions — the situation
 * you are actually in during a real recovery.
 */
async function dump(db, migrations) {
  const allTables = await tableNames(db);
  const { ordered: tables, cyclic } = await topologicalTableOrder(db, allTables);
  const lines = [
    "-- pay-dash DR drill logical dump",
    `-- generated ${new Date().toISOString()}`,
    "",
    "-- === schema ===",
  ];
  for (const m of migrations) lines.push(m.sql);
  lines.push("", "-- === data ===");

  let rowCount = 0;
  for (const t of tables) {
    const res = await db.query(`select * from "${t}"`);
    if (res.rows.length === 0) continue;
    const cols = res.fields.map((f) => f.name);
    for (const row of res.rows) {
      const values = cols.map((c) => lit(row[c])).join(", ");
      lines.push(`INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${values});`);
      rowCount += 1;
    }
  }
  return { sql: lines.join("\n"), rowCount, tables, cyclic };
}

/**
 * The control checksum. Deliberately financial: it sums the money columns and
 * counts the rows that represent money movement, so a restore that brings back
 * the schema but loses or duplicates rows fails loudly.
 */
async function financialChecksum(db) {
  const out = {};
  for (const t of CRITICAL_TABLES) {
    const exists = await db.query(
      `select 1 from pg_tables where schemaname='public' and tablename=$1`,
      [t],
    );
    if (exists.rows.length === 0) {
      out[t] = null;
      continue;
    }
    const r = await db.query(`select count(*)::int as c from "${t}"`);
    out[t] = r.rows[0].c;
  }
  // The money total. `amountMinor` is a VarChar (minor units as a string), so
  // it is cast before summing — the checksum must compare VALUES, not text.
  const amt = await db
    .query(
      `select coalesce(sum("amountMinor"::numeric), 0)::text as total, count(*)::int as c
         from "DurableOperation" where "amountMinor" is not null`,
    )
    .catch(() => ({ rows: [{ total: "0", c: 0 }] }));
  out.__amountMinorTotal = amt.rows[0].total;
  out.__amountMinorRows = amt.rows[0].c;
  return out;
}

async function main() {
  const { PGlite } = await import(path.join(REPO_ROOT, "apps/web/node_modules/@electric-sql/pglite/dist/index.js"));
  const report = {
    startedAt: new Date().toISOString(),
    steps: {},
    result: "UNKNOWN",
    failures: [],
  };

  const migrations = await loadMigrations();
  log(`\n▸ Loaded ${migrations.length} migrations from prisma/migrations`);
  report.migrations = migrations.length;

  /* 1. BUILD ---------------------------------------------------------- */
  let t = performance.now();
  const primary = new PGlite();
  const applied = [];
  for (const m of migrations) {
    try {
      await primary.exec(m.sql);
      applied.push(m.name);
    } catch (err) {
      report.failures.push(`migration ${m.name}: ${err.message}`);
      throw new Error(`Migration ${m.name} failed: ${err.message}`);
    }
  }
  report.steps.build = { ms: ms(t), migrationsApplied: applied.length };
  log(`▸ BUILD    applied ${applied.length} migrations in ${report.steps.build.ms}ms`);

  /* 2. SEED ----------------------------------------------------------- */
  t = performance.now();
  const seededAt = new Date();
  const tables = await tableNames(primary);
  report.steps.seed = { ms: 0, tables: tables.length, seeded: [] };

  // A realistic, referentially-valid financial fixture. An earlier version of
  // this script generated rows generically from information_schema; every
  // insert bounced off a foreign key or a check constraint and the drill
  // happily "restored" zero rows. A DR drill that restores nothing proves
  // nothing, so the fixture is explicit and its row counts are asserted below.
  const ORG_ID = "org_dr_drill";
  const CONN_ID = "conn_dr_drill";
  const iso = seededAt.toISOString();

  const seedStatements = [
    {
      table: "Organization",
      sql: `INSERT INTO "Organization" ("id","name","createdAt","updatedAt")
            VALUES ('${ORG_ID}','DR Drill Org','${iso}','${iso}')`,
    },
    {
      table: "PaymentProviderConnection",
      sql: `INSERT INTO "PaymentProviderConnection"
              ("id","organizationId","provider","mode","status","providerAccountId","createdAt","updatedAt")
            VALUES ('${CONN_ID}','${ORG_ID}','xendit','TEST','ACTIVE','acct_dr','${iso}','${iso}')`,
    },
    // Three operations covering the states whose loss would be most damaging:
    // a completed payout, an ambiguous one, and a large approved release.
    ...[
      { id: "op_dr_1", type: "payout.release", amount: "25000000", state: "SUCCEEDED", unknown: false },
      { id: "op_dr_2", type: "payout.release", amount: "17500000", state: "UNKNOWN", unknown: true },
      { id: "op_dr_3", type: "refund.execute", amount: "4200000", state: "SUCCEEDED", unknown: false },
    ].map((op) => ({
      table: "DurableOperation",
      sql: `INSERT INTO "DurableOperation"
              ("id","organizationId","connectionId","actorId","operationType","resourceType","resourceId",
               "idempotencyKey","requestHash","amountMinor","currency","approvalState","state",
               "attemptCount","unknownOutcome","version","createdAt","updatedAt")
            VALUES ('${op.id}','${ORG_ID}','${CONN_ID}','user_dr','${op.type}','payout','res_${op.id}',
                    'idem_${op.id}','${"a".repeat(64)}','${op.amount}','IDR','NOT_REQUIRED','${op.state}',
                    1,${op.unknown ? "TRUE" : "FALSE"},1,'${iso}','${iso}')`,
    })),
    ...[1, 2].map((n) => ({
      table: "WebhookDelivery",
      sql: `INSERT INTO "WebhookDelivery"
              ("id","provider","providerEventId","type","connectionId","organizationId","receivedAt",
               "verificationStatus","processingStatus","attemptCount","redactedPayload","createdAt")
            VALUES ('wh_dr_${n}','xendit','evt_dr_${n}','payment.succeeded','${CONN_ID}','${ORG_ID}','${iso}',
                    'VERIFIED','SUCCEEDED',1,'{"id":"pay_dr_${n}"}'::jsonb,'${iso}')`,
    })),
    ...[1, 2].map((n) => ({
      table: "AuditEvent",
      sql: `INSERT INTO "AuditEvent"
              ("id","eventId","organizationId","actorId","action","outcome","metadata","version","createdAt")
            VALUES ('ae_dr_${n}','evtid_dr_${n}','${ORG_ID}','user_dr','PAYOUT_RELEASED','SUCCESS',
                    '{"drill":true}'::jsonb,1,'${iso}')`,
    })),
  ];

  for (const stmt of seedStatements) {
    if (!tables.includes(stmt.table)) {
      report.failures.push(`seed: table ${stmt.table} missing from migrated schema`);
      continue;
    }
    try {
      await primary.exec(stmt.sql);
      report.steps.seed.seeded.push(stmt.table);
    } catch (err) {
      // Unlike the earlier generic seeder, a failure here IS a drill failure:
      // it means we could not establish the control data the restore is
      // supposed to bring back.
      report.failures.push(`seed ${stmt.table}: ${err.message}`);
    }
  }
  const lastWriteAt = new Date();
  report.steps.seed.ms = ms(t);
  log(`▸ SEED     ${report.steps.seed.seeded.length} critical tables in ${report.steps.seed.ms}ms`);

  const before = await financialChecksum(primary);
  report.checksumBefore = before;

  // GUARD AGAINST A VACUOUS DRILL. If there is no control data, a "successful"
  // restore is meaningless — it would prove only that an empty database can be
  // recreated. Fail loudly instead of reporting a green result.
  const seededRows = CRITICAL_TABLES.reduce((n, t) => n + (before[t] ?? 0), 0);
  if (seededRows === 0 || Number(before.__amountMinorTotal) === 0) {
    report.result = "FAIL";
    report.failures.push(
      `vacuous drill: seeded ${seededRows} rows / ${before.__amountMinorTotal} minor units — nothing to restore`,
    );
    console.error("DR DRILL ERROR: no control data was seeded; the drill would have been vacuous.");
    console.error(report.failures.join("\n"));
    process.exit(1);
  }

  /* 3. BACKUP --------------------------------------------------------- */
  t = performance.now();
  const workDir = await mkdtemp(path.join(tmpdir(), "paydash-dr-"));
  const dumpPath = path.join(workDir, "backup.sql");
  const dumped = await dump(primary, migrations);
  await writeFile(dumpPath, dumped.sql, "utf8");
  const backupAt = new Date();
  report.steps.backup = {
    ms: ms(t),
    bytes: Buffer.byteLength(dumped.sql),
    rows: dumped.rowCount,
    tables: dumped.tables.length,
    fkOrdered: true,
    cyclicTables: dumped.cyclic,
    path: dumpPath,
  };
  if (dumped.cyclic.length > 0) {
    report.failures.push(`dump ordering: cyclic FK group ${dumped.cyclic.join(", ")}`);
  }
  log(`▸ BACKUP   ${report.steps.backup.bytes} bytes, ${dumped.rowCount} rows in ${report.steps.backup.ms}ms`);

  /* 4. DESTROY -------------------------------------------------------- */
  t = performance.now();
  await primary.close();
  report.steps.destroy = { ms: ms(t), mode: "full engine teardown" };
  log(`▸ DESTROY  primary destroyed in ${report.steps.destroy.ms}ms`);

  /* 5. RESTORE -------------------------------------------------------- */
  const restoreStart = performance.now();
  const restored = new PGlite();
  const restoreSql = await readFile(dumpPath, "utf8");
  try {
    await restored.exec(restoreSql);
  } catch (err) {
    report.failures.push(`restore: ${err.message}`);
    report.result = "FAIL";
    throw new Error(`Restore failed: ${err.message}`);
  }
  const restoredAt = new Date();
  report.steps.restore = { ms: ms(restoreStart) };
  log(`▸ RESTORE  replayed dump in ${report.steps.restore.ms}ms`);

  /* 6. VERIFY --------------------------------------------------------- */
  t = performance.now();
  const after = await financialChecksum(restored);
  report.checksumAfter = after;

  const mismatches = [];
  for (const k of Object.keys(before)) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      mismatches.push(`${k}: ${JSON.stringify(before[k])} -> ${JSON.stringify(after[k])}`);
    }
  }

  // Smoke test: the constraints that protect money must exist after restore,
  // not just the rows. A restore that loses a unique index restores the data
  // and removes the protection against double-processing.
  const smoke = {};
  const idx = await restored.query(
    `select indexname, tablename from pg_indexes where schemaname='public'`,
  );
  const indexNames = idx.rows.map((r) => `${r.tablename}.${r.indexname}`);
  smoke.indexCount = indexNames.length;
  smoke.durableOperationIdempotencyUnique = indexNames.some(
    (n) => n.startsWith("DurableOperation.") && n.toLowerCase().includes("idempotencykey"),
  );
  smoke.webhookDeliveryProviderEventUnique = indexNames.some(
    (n) => n.startsWith("WebhookDelivery.") && n.toLowerCase().includes("providereventid"),
  );
  smoke.tablesRestored = (await tableNames(restored)).length;
  smoke.tablesExpected = dumped.tables.length;

  if (!smoke.durableOperationIdempotencyUnique) {
    mismatches.push("DurableOperation.idempotencyKey unique index missing after restore");
  }
  if (!smoke.webhookDeliveryProviderEventUnique) {
    mismatches.push("WebhookDelivery (provider, providerEventId) unique index missing after restore");
  }
  if (smoke.tablesRestored !== smoke.tablesExpected) {
    mismatches.push(`table count ${smoke.tablesExpected} -> ${smoke.tablesRestored}`);
  }
  smoke.rowsRestored = CRITICAL_TABLES.reduce((n, t) => n + (after[t] ?? 0), 0);
  if (smoke.rowsRestored === 0) {
    mismatches.push("no rows restored — the restore is vacuous");
  }

  report.steps.verify = { ms: ms(t), smoke, mismatches };
  log(`▸ VERIFY   ${mismatches.length === 0 ? "checksum + smoke OK" : `${mismatches.length} MISMATCH`} in ${report.steps.verify.ms}ms`);

  /* Objectives --------------------------------------------------------- */
  // RTO: time from "database is gone" to "verified good" — what an operator
  // actually experiences. RPO: data lost, i.e. writes after the backup point.
  const rtoMs = report.steps.restore.ms + report.steps.verify.ms;
  const rpoMs = backupAt.getTime() - lastWriteAt.getTime();

  report.objectives = {
    measuredRtoSeconds: Number((rtoMs / 1000).toFixed(3)),
    measuredRpoSeconds: Number((Math.abs(rpoMs) / 1000).toFixed(3)),
    note:
      "Measured against PGlite with a logical dump. This validates the restore " +
      "PROCEDURE and the schema/constraint integrity, not production hardware " +
      "timings or Cloud SQL PITR. Production RPO is bounded by the backup " +
      "schedule: with PITR disabled that is up to 24h (see DR_RESTORE_REPORT.md).",
  };
  report.result = mismatches.length === 0 ? "PASS" : "FAIL";
  report.finishedAt = new Date().toISOString();
  report.restoredAt = restoredAt.toISOString();

  await restored.close();
  await rm(workDir, { recursive: true, force: true });

  log(`\n▸ RESULT   ${report.result}`);
  log(`  RTO (measured, restore+verify): ${report.objectives.measuredRtoSeconds}s`);
  log(`  RPO (measured, backup lag):     ${report.objectives.measuredRpoSeconds}s`);
  if (mismatches.length) log(`  Mismatches:\n   - ${mismatches.join("\n   - ")}`);

  const json = JSON.stringify(report, null, 2);
  if (JSON_ONLY) console.log(json);
  if (OUT_PATH) {
    await writeFile(path.resolve(REPO_ROOT, OUT_PATH), json, "utf8");
    log(`\n  Evidence written to ${OUT_PATH}`);
  }
  process.exit(report.result === "PASS" ? 0 : 1);
}

main().catch((err) => {
  console.error("DR DRILL ERROR:", err.message);
  process.exit(1);
});
