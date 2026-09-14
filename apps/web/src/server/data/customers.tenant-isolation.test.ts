// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { __resetTenantDenials } from "@/server/services/tenant-denial";
import { createTransaction } from "@/server/data/transactions";
import {
  createCustomer,
  getCustomer,
  getCustomerMetrics,
  getCustomerTransactions,
  listCustomers,
  updateCustomer,
} from "./customers";

/**
 * Wave 7C Q1 — Customers tenant isolation, target-API tests (U-1..U-12, spec §5).
 *
 * Invariant: **Org A cannot list, search, open, or mutate a customer of Org B,
 * even knowing the id or email exactly.** The directory is derived (scoped
 * ledger in, scoped directory out — spec §1), so one test (U-10) proves the
 * composition with the 7A slice.
 *
 * Every test is a *pair*: "A sees/does its own" AND "A never touches B's". A
 * test that only checks the second half passes trivially on an empty store.
 *
 * RED on main: `customers.ts` accepts no tenant at all (P-1..P-5) — the gap,
 * not a typo. Target API: `ctx` first (spec §2 C-1); foreign writes throw
 * `cross-tenant`, foreign reads are null (spec §2 C-4).
 */

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA: OrganizationContext = parseOrganizationContext({ organizationId: ORG_A });
const ctxB: OrganizationContext = parseOrganizationContext({ organizationId: ORG_B });

function resetStores() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticCustomerStore;
  delete g.__kineticTxStore;
  __resetTenantDenials();
}

beforeEach(() => {
  resetStores();
});

/** Two tenants, two manual customers each with distinct names/emails. */
async function twoTenantsSeeded() {
  const a1 = await createCustomer(ctxA, { name: "Alpha Buyer One", email: "buyer1@alpha.example" });
  const a2 = await createCustomer(ctxA, { name: "Alpha Buyer Two", email: "buyer2@alpha.example" });
  const b1 = await createCustomer(ctxB, { name: "Beta Buyer One", email: "buyer1@beta.example" });
  const b2 = await createCustomer(ctxB, { name: "Beta Buyer Two", email: "buyer2@beta.example" });
  return { a1, a2, b1, b2 };
}

describe("U-1 Org A lists → only A", () => {
  it("the list contains A's customers and never B's", async () => {
    await twoTenantsSeeded();

    const asA = await listCustomers(ctxA, { pageSize: 100 });
    const asB = await listCustomers(ctxB, { pageSize: 100 });
    const emailsA = asA.rows.map((c) => c.email);
    const emailsB = asB.rows.map((c) => c.email);

    expect(emailsA).toContain("buyer1@alpha.example");
    expect(emailsA).toContain("buyer2@alpha.example");
    expect(emailsA).not.toContain("buyer1@beta.example");
    expect(emailsA).not.toContain("buyer2@beta.example");
    expect(emailsB).toContain("buyer1@beta.example");
    expect(emailsB).not.toContain("buyer1@alpha.example");
  });
});

describe("U-2 search/filter stays inside the tenant", () => {
  it("a needle matching only B returns nothing for A", async () => {
    await twoTenantsSeeded();

    const asA = await listCustomers(ctxA, { q: "beta", pageSize: 100 });
    expect(asA.rows).toHaveLength(0);
    expect(asA.total).toBe(0);

    const asB = await listCustomers(ctxB, { q: "beta", pageSize: 100 });
    expect(asB.total).toBeGreaterThanOrEqual(2);
  });

  it("status filter never leaks across tenants", async () => {
    await twoTenantsSeeded();

    const asA = await listCustomers(ctxA, { status: "NEW", pageSize: 100 });
    for (const c of asA.rows) expect(c.email).toContain("@alpha.example");
  });
});

describe("U-3 detail by id → foreign is null", () => {
  it("own id resolves; B's id is null for A, byte-identical to unknown", async () => {
    const { a1, b1 } = await twoTenantsSeeded();

    expect((await getCustomer(ctxA, a1.id))?.email).toBe("buyer1@alpha.example");
    expect(await getCustomer(ctxA, b1.id)).toBeNull();
    expect(await getCustomer(ctxA, "cus_doesnotexist")).toBeNull();
  });
});

describe("U-4 detail by email → foreign is null", () => {
  it("own email resolves case-insensitively; B's email is null for A", async () => {
    await twoTenantsSeeded();

    expect((await getCustomer(ctxA, "BUYER1@ALPHA.EXAMPLE"))?.name).toBe("Alpha Buyer One");
    expect(await getCustomer(ctxA, "buyer1@beta.example")).toBeNull();
  });
});

describe("U-5 customer transactions inherit the ledger scope", () => {
  it("A's ledger email is invisible to B", async () => {
    await createTransaction(ctxA, {
      amount: 500_000,
      currency: "IDR",
      channel: "QRIS",
      customerName: "Alice Ledger",
      customerEmail: "alice@ledger.example",
    });

    const asA = await getCustomerTransactions(ctxA, "alice@ledger.example");
    expect(asA).toHaveLength(1);
    const asB = await getCustomerTransactions(ctxB, "alice@ledger.example");
    expect(asB).toHaveLength(0);
  });
});

describe("U-6 metrics aggregate only the caller's tenant", () => {
  it("A's totals exclude B's customers", async () => {
    await twoTenantsSeeded();

    const mA = await getCustomerMetrics(ctxA);
    const mB = await getCustomerMetrics(ctxB);
    expect(mA.total).toBeGreaterThanOrEqual(2);
    expect(mB.total).toBeGreaterThanOrEqual(2);
    // B's two buyers are NEW; they must not inflate A's counts.
    const mAEmails = (await listCustomers(ctxA, { pageSize: 100 })).rows.map((c) => c.email);
    expect(mAEmails).not.toContain("buyer1@beta.example");
    expect(mA.total).toBe(mAEmails.length);
  });
});

describe("U-7 create lands in the caller's partition", () => {
  it("owner comes from ctx only and the row is invisible to B", async () => {
    const created = await createCustomer(ctxA, { name: "Alpha New", email: "new@alpha.example" });
    expect(created.email).toBe("new@alpha.example");

    expect(await getCustomer(ctxB, created.id)).toBeNull();
    const asB = await listCustomers(ctxB, { pageSize: 100 });
    expect(asB.rows.map((c) => c.email)).not.toContain("new@alpha.example");
  });
});

describe("U-8 update of a foreign id throws cross-tenant; unknown is null", () => {
  it("B's id refuses loudly for A; a nowhere id returns null", async () => {
    const { b1 } = await twoTenantsSeeded();

    await expect(updateCustomer(ctxA, { id: b1.id, name: "Hijacked" })).rejects.toThrow(/cross-tenant/i);
    expect((await getCustomer(ctxB, b1.id))?.name).toBe("Beta Buyer One");
    await expect(updateCustomer(ctxA, { id: "cus_doesnotexist", name: "Ghost" })).resolves.toBeNull();
  });
});

describe("U-9 email uniqueness is per-tenant (composite key, spec P-10)", () => {
  it("same email in the other tenant is allowed; twice in one tenant is not", async () => {
    await createCustomer(ctxA, { name: "Shared Name A", email: "shared@example.com" });
    const inB = await createCustomer(ctxB, { name: "Shared Name B", email: "shared@example.com" });
    expect(inB.email).toBe("shared@example.com");

    // Same id shape, different owners: each tenant resolves its own row.
    const asA = await getCustomer(ctxA, "shared@example.com");
    const asB = await getCustomer(ctxB, "shared@example.com");
    expect(asA?.name).toBe("Shared Name A");
    expect(asB?.name).toBe("Shared Name B");

    await expect(createCustomer(ctxA, { name: "Dupe", email: "shared@example.com" })).rejects.toThrow(
      /already exists/i,
    );
  });
});

describe("U-10 derived composition: scoped ledger in, scoped directory out", () => {
  it("a ledger buyer of B never appears in A's directory", async () => {
    await createTransaction(ctxB, {
      amount: 750_000,
      currency: "IDR",
      channel: "VA",
      customerName: "Beta Ledger Buyer",
      customerEmail: "ledgerbuyer@beta.example",
    });

    const asA = await listCustomers(ctxA, { q: "ledgerbuyer", pageSize: 100 });
    expect(asA.total).toBe(0);
    const asB = await listCustomers(ctxB, { q: "ledgerbuyer", pageSize: 100 });
    expect(asB.total).toBe(1);
    expect(asB.rows[0].source).toBe("ledger");
  });
});

describe("U-11 pagination × sort stay inside the tenant", () => {
  it("every page and ordering of A is A-only", async () => {
    await twoTenantsSeeded();
    for (let i = 0; i < 12; i++) {
      await createCustomer(ctxA, { name: `Alpha Padded ${i}`, email: `padded${i}@alpha.example` });
    }

    for (const sort of ["recent", "ltv", "name", "added"] as const) {
      const page = await listCustomers(ctxA, { sort, page: 2, pageSize: 5 });
      expect(page.rows.length).toBeGreaterThan(0);
      for (const c of page.rows) expect(c.email).toContain("@alpha.example");
    }
  });
});

describe("U-12 quarantine gate + invalid ctx", () => {
  it("the quarantine refuses multi-tenant unscoped reads and names the surface", async () => {
    const mod = await import("./customers-unscoped");
    await createCustomer(ctxA, { name: "QA", email: "qa@alpha.example" });
    await createCustomer(ctxB, { name: "QB", email: "qb@beta.example" });

    // Wave 7D retired the `"subscriptions"` surface: the subscriptions page reads
    // the scoped DAL with its own context now. `reports` is the one entry left in
    // LEGACY_CUSTOMER_SURFACES (7E's slice), and the gate still refuses it.
    expect(() => mod.legacyListCustomers("reports")).toThrow(/reports/i);
  });

  it("an invalid ctx never becomes a tenant", async () => {
    expect(() => parseOrganizationContext({ organizationId: "   " })).toThrow();
    // @ts-expect-error — missing ctx must not compile where it counts
    await expect(listCustomers({ pageSize: 10 })).rejects.toThrow();
  });
});
