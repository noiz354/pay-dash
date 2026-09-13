import "server-only";

import { Pool, type PoolClient } from "pg";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";

/**
 * Wave 7D (Q2) — the tenant-scoped Postgres path for the money ledger.
 *
 * Row-Level Security (migration `add_ledger_entry_organization`) enforces
 * `organizationId = current_setting('app.org_id', true)` on every
 * `LedgerEntry` statement. That GUC is **per-connection**, so it must be set on
 * the same connection that runs the query — which Prisma's pooled connections
 * cannot express (Prisma has no `SET`; prisma/prisma#4303). This module owns a
 * small dedicated `pg` pool for exactly that: open a transaction, set the
 * context transaction-locally, run the query, and let COMMIT/ROLLBACK clear it.
 *
 * Pooling rule (the #1 RLS footgun): always `set_config(..., true)` inside
 * BEGIN/COMMIT — never a bare session-level `SET` — so a pooled connection can
 * never carry one tenant's context into another tenant's request. `is_local`
 * (third arg `true`) is the function form of `SET LOCAL`.
 */

const DEFAULT_POOL_MAX = 10;

type PoolFactory = () => Pool | undefined;

let pool: Pool | undefined;
let poolFactory: PoolFactory = () => {
  // Lazy + fail-closed: importing this module must not crash in tests or builds
  // where DATABASE_URL is absent; `withTenantLedger` surfaces a clear error.
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: Number(process.env.LEDGER_PG_POOL_MAX ?? DEFAULT_POOL_MAX),
    });
    // Surface pool errors instead of letting them hang an idle process.
    pool.on("error", (err) => {
      console.error("[tenant-pg] idle client error", err);
    });
  }
  return pool;
};

/** Test seam: swap the pool factory (mirrors the store-injection convention). */
export function __setTenantPoolFactory(factory: PoolFactory): void {
  poolFactory = factory;
  pool = undefined;
}

/**
 * Run `fn` against the ledger with the caller's tenant bound as `app.org_id`,
 * transaction-locally. RLS then restricts every `LedgerEntry` statement inside
 * `fn` to the caller's organization — a forgotten `where` cannot leak.
 *
 * The explicit `organizationId` is also handed to `fn` callers (see
 * `server/dal/ledger.ts`) so the predicate appears in the query text too:
 * RLS is the backstop, the `where` is the documentation of intent.
 */
export async function withTenantLedger<T>(
  ctx: OrganizationContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const { organizationId } = parseOrganizationContext(ctx);
  const clientPool = poolFactory();
  if (!clientPool) {
    throw new Error(
      "Tenant-scoped ledger access requires DATABASE_URL (Postgres). The in-memory dashboard seam is server/data/transactions.ts; server/dal/ledger.ts is the Postgres path.",
    );
  }
  const client = await clientPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.org_id', $1, true)", [organizationId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Whether the tenant-scoped Postgres path is configured at all. */
export function tenantLedgerConfigured(): boolean {
  return poolFactory() !== undefined;
}
