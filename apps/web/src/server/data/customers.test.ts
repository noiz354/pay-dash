import { describe, it, expect, beforeEach } from "vitest";
import {
  createCustomer,
  customerIdFromEmail,
  customersToCsv,
  getCustomer,
  getCustomerMetrics,
  getCustomerTransactions,
  listCustomers,
  updateCustomer,
} from "@/server/data/customers";

// The store is intentionally global (it survives requests in dev); reset it so
// each test starts from the seeded baseline.
beforeEach(() => {
  delete (globalThis as Record<string, unknown>).__kineticCustomerStore;
});

describe("customerIdFromEmail", () => {
  it("is stable and case-insensitive", () => {
    expect(customerIdFromEmail("Tony@Stark.com")).toBe(customerIdFromEmail("tony@stark.com"));
    expect(customerIdFromEmail("tony@stark.com")).toMatch(/^cus_[0-9a-z]+$/);
  });
});

describe("listCustomers", () => {
  it("derives the directory from the ledger and keeps the prototype seeds", async () => {
    const { rows, total } = await listCustomers({ pageSize: 100 });
    expect(total).toBeGreaterThan(0);
    expect(rows.some((c) => c.name === "Acme Corporation")).toBe(true);
    // The prototype shipped LTV strings without a currency prefix (",520.00").
    for (const c of rows) expect(Number.isFinite(c.lifetimeValue)).toBe(true);
  });

  it("filters by free-text query across name and email", async () => {
    const { rows, isFiltered } = await listCustomers({ q: "stark", pageSize: 100 });
    expect(isFiltered).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("tony@stark.com");
  });

  it("filters by status", async () => {
    const { rows } = await listCustomers({ status: "REVIEW", pageSize: 100 });
    expect(rows.every((c) => c.status === "REVIEW")).toBe(true);
  });

  it("sorts by lifetime value and by name", async () => {
    const byLtv = await listCustomers({ sort: "ltv", pageSize: 100 });
    const values = byLtv.rows.map((c) => c.lifetimeValue);
    expect([...values].sort((a, b) => b - a)).toEqual(values);

    const byName = await listCustomers({ sort: "name", pageSize: 100 });
    const names = byName.rows.map((c) => c.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });

  it("paginates and clamps out-of-range pages", async () => {
    // pageSize is clamped to [5, 100] by the data layer.
    const first = await listCustomers({ page: 1, pageSize: 5 });
    expect(first.rows.length).toBeLessThanOrEqual(5);
    expect(first.pageCount).toBe(Math.ceil(first.total / 5));

    const far = await listCustomers({ page: 999, pageSize: 5 });
    expect(far.page).toBe(far.pageCount);
  });
});

describe("createCustomer / updateCustomer", () => {
  it("creates a customer retrievable by id and by email", async () => {
    const created = await createCustomer({ name: "Wayne Enterprises", email: "Bruce@Wayne.com" });
    expect(created.id).toBe(customerIdFromEmail("bruce@wayne.com"));
    expect(created.status).toBe("NEW");
    expect(await getCustomer(created.id)).not.toBeNull();
    expect(await getCustomer("bruce@wayne.com")).not.toBeNull();
  });

  it("rejects duplicate emails", async () => {
    await createCustomer({ name: "Wayne", email: "bruce@wayne.com" });
    await expect(createCustomer({ name: "Wayne again", email: "bruce@wayne.com" })).rejects.toThrow(
      /already exists/i
    );
  });

  it("applies overrides without dropping the underlying record", async () => {
    const created = await createCustomer({ name: "Wayne", email: "bruce@wayne.com" });
    const updated = await updateCustomer({ id: created.id, name: "Wayne Enterprises", status: "ACTIVE" });
    expect(updated?.name).toBe("Wayne Enterprises");
    expect(updated?.status).toBe("ACTIVE");
    expect(updated?.email).toBe("bruce@wayne.com");
  });

  it("archiving is a status transition, never a delete", async () => {
    const created = await createCustomer({ name: "Wayne", email: "bruce@wayne.com" });
    await updateCustomer({ id: created.id, status: "BLOCKED" });
    const after = await getCustomer(created.id);
    expect(after).not.toBeNull();
    expect(after?.status).toBe("BLOCKED");
  });

  it("returns null when updating an unknown customer", async () => {
    expect(await updateCustomer({ id: "cus_nope", name: "Ghost" })).toBeNull();
  });
});

describe("customer <-> ledger consistency", () => {
  it("payments listed for a customer all belong to that customer", async () => {
    const { rows } = await listCustomers({ sort: "ltv", pageSize: 100 });
    const withPayments = rows.find((c) => c.paymentCount > 0);
    expect(withPayments).toBeDefined();
    const txns = await getCustomerTransactions(withPayments!.email);
    expect(txns).toHaveLength(withPayments!.paymentCount);
    expect(txns.every((t) => t.customerEmail.toLowerCase() === withPayments!.email)).toBe(true);
  });

  it("reports metrics that add up", async () => {
    const m = await getCustomerMetrics();
    const { total } = await listCustomers({ pageSize: 100 });
    expect(m.total).toBe(total);
    expect(m.active + m.review).toBeLessThanOrEqual(m.total);
  });
});

describe("customersToCsv", () => {
  it("emits a header plus one row per customer", async () => {
    const { rows } = await listCustomers({ pageSize: 5 });
    const csv = customersToCsv(rows);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("customer_id");
    expect(lines).toHaveLength(rows.length + 1);
    expect(lines[1].startsWith('"cus_')).toBe(true);
  });
});
