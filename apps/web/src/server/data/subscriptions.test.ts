import { describe, expect, it } from "vitest";
import {
  createSubscription,
  listSubscriptions,
  monthlyRecurring,
  subscriptionSummary,
  subscriptionsToCsv,
} from "./subscriptions";
import { getCustomer } from "./customers";

const ALL = { pageSize: 100 };

describe("subscription store (ADR-0021)", () => {
  it("seeds 10 plans, every one tied to a real customer in the directory", async () => {
    const { rows } = await listSubscriptions(ALL);
    expect(rows).toHaveLength(10);
    for (const s of rows) {
      const customer = await getCustomer(s.customerEmail);
      expect(customer, `no customer for ${s.customerEmail}`).not.toBeNull();
      expect(s.customerId).toBe(customer!.id);
      expect(s.id).toMatch(/^sub_[0-9a-z]+$/);
      expect(s.currency).toBe("IDR");
    }
  });

  it("has a stable status mix with a computable MRR", async () => {
    const { rows } = await listSubscriptions(ALL);
    const summary = subscriptionSummary(rows);
    expect(summary.active).toBe(6);
    expect(summary.pendingSetup).toBe(2);
    expect(summary.pastDue).toBe(1);
    expect(summary.cancelled).toBe(1);
    // monthly actives at face value + yearly actives ÷ 12
    const expectedMrr = rows
      .filter((s) => s.status === "ACTIVE")
      .reduce((sum, s) => sum + monthlyRecurring(s), 0);
    expect(summary.activeMrr).toBe(expectedMrr);
    expect(summary.activeMrr).toBe(94_550_000);
    expect(summary.pastDueTotal).toBe(15_000_000);
  });

  it("cancelled plans have no next billing date", async () => {
    const { rows } = await listSubscriptions(ALL);
    const cancelled = rows.filter((s) => s.status === "CANCELLED");
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].nextBillingAt).toBeNull();
    expect(cancelled[0].cancelledAt).not.toBeNull();
    const active = rows.filter((s) => s.status !== "CANCELLED");
    expect(active.every((s) => s.nextBillingAt)).toBe(true);
  });

  it("filters by query and status, and sorts by amount", async () => {
    const byName = await listSubscriptions({ q: "initech" });
    expect(byName.total).toBe(1);
    expect(byName.rows[0].customerName).toBe("Initech BV");

    const byId = await listSubscriptions({ q: (await listSubscriptions(ALL)).rows[0].id });
    expect(byId.total).toBe(1);

    const pastDue = await listSubscriptions({ status: "PAST_DUE" });
    expect(pastDue.total).toBe(1);
    expect(pastDue.rows[0].status).toBe("PAST_DUE");

    const byAmount = await listSubscriptions({ sort: "amount" });
    const amounts = byAmount.rows.map((s) => s.amount);
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
  });

  it("paginates with the shared bounds (min 5, max 100)", async () => {
    const page1 = await listSubscriptions({ page: 1, pageSize: 5 });
    expect(page1.rows).toHaveLength(5);
    expect(page1.total).toBe(10);
    expect(page1.pageCount).toBe(2);
    const page2 = await listSubscriptions({ page: 2, pageSize: 5 });
    expect(page2.rows).toHaveLength(5);
    expect(new Set(page1.rows.map((r) => r.id)).size).toBe(5);
    for (const row of page2.rows) {
      expect(page1.rows.map((r) => r.id)).not.toContain(row.id);
    }
    // page beyond the end clamps instead of erroring
    const beyond = await listSubscriptions({ page: 99, pageSize: 5 });
    expect(beyond.page).toBe(2);
  });

  it("createSubscription lands in PENDING_SETUP with a future first billing", async () => {
    const before = (await listSubscriptions(ALL)).total;
    // The dialog only offers directory customers — so does this test.
    const sub = await createSubscription({
      customerName: "Warung Kopi Nusantara",
      customerEmail: "owner@kopinusantara.id",
      planName: "Growth",
      interval: "monthly",
      amount: 5_000_000,
    });
    expect(sub.status).toBe("PENDING_SETUP");
    expect(sub.id).toMatch(/^sub_[0-9a-z]+$/);
    expect(new Date(sub.nextBillingAt!).getTime()).toBeGreaterThan(Date.now());
    const after = await listSubscriptions(ALL);
    expect(after.total).toBe(before + 1);
    expect(after.rows[0].id).toBe(sub.id); // newest first (recent sort)
    // the customer id resolves through the same pure hash the directory uses
    const customer = await getCustomer(sub.customerEmail);
    expect(customer?.id).toBe(sub.customerId);
  });

  it("exports csv with exactly one line per plan and raw values", async () => {
    const { rows } = await listSubscriptions(ALL);
    const csv = subscriptionsToCsv(rows);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "id,plan,customer_name,customer_email,interval,amount,currency,status,started_at,next_billing_at,cancelled_at"
    );
    expect(lines).toHaveLength(rows.length + 1);
    for (const line of lines.slice(1)) {
      const cells = line.split(",");
      expect(cells).toHaveLength(11);
      expect(cells[0]).toMatch(/^sub_/);
      expect(Number(cells[5])).toBeGreaterThan(0);
    }
    // cancelled plan exports with empty next_billing_at + cancelled_at filled
    const cancelledLine = lines.find((l) => l.includes(",CANCELLED,"));
    expect(cancelledLine).toBeDefined();
    expect(cancelledLine!.split(",")[9]).toBe("");
    expect(cancelledLine!.split(",")[10]).not.toBe("");
  });
});
