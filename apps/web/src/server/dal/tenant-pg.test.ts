// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseOrganizationContext, OrganizationContextError } from "@/domain/tenancy/organization-context";
import { __setTenantPoolFactory, withTenantLedger } from "./tenant-pg";

/**
 * Wave 7D Q2 — the tenant-scoped Postgres helper.
 *
 * Pins the two properties that make RLS safe on a pooled connection:
 *  1. the tenant is set **transaction-locally** (`set_config('app.org_id', $1, true)`)
 *     inside BEGIN/COMMIT — never a session-level SET that could leak across
 *     pooled requests;
 *  2. a missing DATABASE_URL fails closed with a clear error instead of
 *     silently serving an unscoped path.
 */

const ORG_A = "org_alpha";
const ctxA = parseOrganizationContext({ organizationId: ORG_A });

type QueryFn = (sql: string, values?: unknown[]) => Promise<unknown>;

function fakePool() {
  const query = vi.fn<QueryFn>(async () => ({ rows: [] }));
  const release = vi.fn(async () => undefined);
  const client = { query, release };
  const connect = vi.fn(async () => client);
  return { client, query, release, connect };
}

beforeEach(() => {
  delete process.env.DATABASE_URL;
});

afterEach(() => {
  __setTenantPoolFactory(() => undefined);
});

describe("withTenantLedger", () => {
  it("binds the tenant transaction-locally before running the callback", async () => {
    const { client, query, connect } = fakePool();
    __setTenantPoolFactory(() => ({ connect }) as never);

    const received = await withTenantLedger(ctxA, async (c) => c);

    expect(received).toBe(client);
    // Order matters: BEGIN → set_config(..., true) → (callback) → COMMIT.
    const sqls = query.mock.calls.map((c) => c[0]);
    expect(sqls).toEqual(["BEGIN", "SELECT set_config('app.org_id', $1, true)", "COMMIT"]);
    // The tenant is bound with is_local=true (third arg), the pool-leak-safe form.
    expect(query.mock.calls[1]).toEqual(["SELECT set_config('app.org_id', $1, true)", [ORG_A]]);
  });

  it("rolls back and rethrows when the callback fails", async () => {
    const { client, query } = fakePool();
    __setTenantPoolFactory(() => ({ connect: async () => client }) as never);

    const boom = new Error("boom");
    await expect(
      withTenantLedger(ctxA, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    const sqls = query.mock.calls.map((c) => c[0]);
    expect(sqls).toContain("ROLLBACK");
    expect(sqls).not.toContain("COMMIT");
  });

  it("fails closed (no unscoped fallback) when DATABASE_URL is unset", async () => {
    __setTenantPoolFactory(() => undefined);
    await expect(withTenantLedger(ctxA, async () => 1)).rejects.toThrow(/DATABASE_URL/);
  });

  it("rejects an invalid context before touching the pool", async () => {
    const { connect } = fakePool();
    __setTenantPoolFactory(() => ({ connect }) as never);
    await expect(withTenantLedger({ organizationId: "   " }, async () => 1)).rejects.toBeInstanceOf(
      OrganizationContextError,
    );
    expect(connect).not.toHaveBeenCalled();
  });
});
