import { beforeEach, describe, expect, it } from "vitest";
import {
  addBankAccount,
  approveBatch,
  batchesToCsv,
  cancelBatch,
  createBatch,
  deriveStatus,
  getBatch,
  getPayoutSettings,
  getPayoutsOverview,
  listBankAccounts,
  listBatches,
  recipientsToCsv,
  retryBatchFailures,
  retryRecipient,
  summarise,
  updatePayoutSettings,
} from "./payouts";
import type { RecipientDraft } from "@/lib/payout-csv";
import { parseOrganizationContext } from "@/domain/tenancy/organization-context";

beforeEach(() => {
  (globalThis as unknown as { __kineticPayoutStore?: unknown }).__kineticPayoutStore = undefined;
});

// Wave 7B: the seeded demo ledger lives under the demo tenant; legacy
// single-tenant expectations run scoped to it.
const ctx = parseOrganizationContext({ organizationId: "org_demo" });

function draft(overrides: Partial<RecipientDraft> = {}): RecipientDraft {
  return {
    line: 1,
    name: "Test Recipient",
    bank: "BCA",
    accountNumber: "1234567891",
    amount: 100_000,
    reference: "",
    ...overrides,
  };
}

describe("listBatches", () => {
  it("seeds the prototype's batches and sorts newest first", async () => {
    const { rows, total } = await listBatches(ctx);
    expect(total).toBe(5);
    expect(rows[0].id).toBe("BATCH-2026-08-014");
    expect(rows[0].createdAt >= rows[1].createdAt).toBe(true);
  });

  it("filters by status, query and range", async () => {
    expect((await listBatches(ctx, { status: "PAID" })).rows.every((b) => b.status === "PAID")).toBe(true);
    expect((await listBatches(ctx, { q: "affiliate" })).total).toBe(1);
    expect((await listBatches(ctx, { q: "BATCH-2026-08-011" })).total).toBe(1);
    const ranged = await listBatches(ctx, { range: "30d" });
    expect(ranged.total).toBeLessThanOrEqual(5);
    expect(ranged.isFiltered).toBe(true);
  });

  it("sorts by amount and recipient count", async () => {
    const byAmount = await listBatches(ctx, { sort: "amount" });
    expect(byAmount.rows[0].totalAmount).toBeGreaterThanOrEqual(byAmount.rows[1].totalAmount);
    const byRecipients = await listBatches(ctx, { sort: "recipients" });
    expect(byRecipients.rows[0].recipientCount).toBeGreaterThanOrEqual(byRecipients.rows[1].recipientCount);
  });

  it("clamps an out-of-range page", async () => {
    const result = await listBatches(ctx, { page: 99, pageSize: 2 });
    expect(result.page).toBe(result.pageCount);
    expect(result.rows.length).toBeGreaterThan(0);
  });
});

describe("summaries", () => {
  it("totals always equal the sum of the recipients", async () => {
    const batch = (await getBatch(ctx, "BATCH-2026-08-012"))!;
    const summary = summarise(batch);
    expect(summary.totalAmount).toBe(batch.recipients.reduce((s, r) => s + r.amount, 0));
    expect(summary.paidAmount).toBe(
      batch.recipients.filter((r) => r.status === "PAID").reduce((s, r) => s + r.amount, 0)
    );
    expect(summary.paidCount).toBe(2);
    expect(summary.failedCount).toBe(2);
  });

  it("derives PARTIAL / PAID / PROCESSING from recipient rows", async () => {
    expect((await getBatch(ctx, "BATCH-2026-08-012"))!.status).toBe("PARTIAL");
    expect((await getBatch(ctx, "BATCH-2026-08-011"))!.status).toBe("PAID");
    expect((await getBatch(ctx, "BATCH-2026-08-013"))!.status).toBe("PROCESSING");
  });

  it("keeps editable batches in their own state", async () => {
    const scheduled = (await getBatch(ctx, "BATCH-2026-08-014"))!;
    expect(deriveStatus(scheduled)).toBe("SCHEDULED");
  });
});

describe("createBatch", () => {
  it("creates a draft when no release date is given", async () => {
    const batch = await createBatch(ctx, { name: "Manual run", recipients: [draft(), draft({ accountNumber: "2222222222" })] });
    expect(batch.status).toBe("DRAFT");
    expect(batch.recipients).toHaveLength(2);
    expect(batch.recipients.every((r) => r.status === "PENDING")).toBe(true);
    expect(batch.timeline).toHaveLength(1);
    expect((await listBatches(ctx)).rows[0].id).toBe(batch.id);
  });

  it("schedules when a release date is given", async () => {
    const batch = await createBatch(ctx, {
      name: "Scheduled run",
      scheduledFor: "2026-09-10T02:00:00.000Z",
      recipients: [draft()],
    });
    expect(batch.status).toBe("SCHEDULED");
  });
});

describe("approveBatch", () => {
  it("settles pending rows and records a timeline entry", async () => {
    const created = await createBatch(ctx, { name: "Send me", recipients: [draft(), draft({ accountNumber: "3333333333" })] });
    const result = await approveBatch(ctx, created.id);
    expect(result?.paid).toBe(2);
    expect(result?.failed).toBe(0);
    const batch = (await getBatch(ctx, created.id))!;
    expect(batch.status).toBe("PAID");
    expect(batch.recipients.every((r) => r.paidAt)).toBe(true);
    expect(batch.timeline.at(-1)?.label).toBe("Completed");
  });

  it("marks accounts ending 0000 as failed and reports PARTIAL", async () => {
    const created = await createBatch(ctx, {
      name: "Half broken",
      recipients: [draft(), draft({ accountNumber: "1111110000" })],
    });
    const result = await approveBatch(ctx, created.id);
    expect(result?.paid).toBe(1);
    expect(result?.failed).toBe(1);
    expect((await getBatch(ctx, created.id))!.status).toBe("PARTIAL");
  });

  it("refuses to send twice", async () => {
    const created = await createBatch(ctx, { name: "Once", recipients: [draft()] });
    await approveBatch(ctx, created.id);
    await expect(approveBatch(ctx, created.id)).rejects.toThrow(/cannot be sent again/i);
  });

  it("refuses to send an empty batch", async () => {
    const created = await createBatch(ctx, { name: "Empty", recipients: [] });
    await expect(approveBatch(ctx, created.id)).rejects.toThrow(/at least one recipient/i);
  });

  it("returns null for an unknown batch", async () => {
    expect(await approveBatch(ctx, "BATCH-NOPE")).toBeNull();
  });
});

describe("cancel and retry", () => {
  it("cancels a schedulable batch without paying anyone", async () => {
    const batch = await cancelBatch(ctx, "BATCH-2026-08-014");
    expect(batch?.status).toBe("RETURNED");
    expect(batch?.recipients.every((r) => r.status === "RETURNED")).toBe(true);
  });

  it("refuses to cancel a batch that already ran", async () => {
    await expect(cancelBatch(ctx, "BATCH-2026-08-011")).rejects.toThrow(/no longer be cancelled/i);
  });

  it("retries only the failed rows", async () => {
    const result = await retryBatchFailures(ctx, "BATCH-2026-08-012");
    expect(result?.retried).toBe(2);
    expect(result?.paid).toBe(2);
    expect((await getBatch(ctx, "BATCH-2026-08-012"))!.status).toBe("PAID");
  });

  it("throws when there is nothing to retry", async () => {
    await expect(retryBatchFailures(ctx, "BATCH-2026-08-011")).rejects.toThrow(/nothing to retry/i);
  });

  it("retries a single recipient and refuses to re-pay a paid one", async () => {
    const row = await retryRecipient(ctx, "BATCH-2026-08-012", "R-12-2");
    expect(row?.status).toBe("PAID");
    await expect(retryRecipient(ctx, "BATCH-2026-08-012", "R-12-1")).rejects.toThrow(/already paid/i);
  });
});

describe("overview", () => {
  it("derives pending, completed and failed figures from recipients", async () => {
    const overview = await getPayoutsOverview(ctx);
    expect(overview.pendingRecipients).toBe(5); // 3 scheduled + 2 processing
    expect(overview.pendingAmount).toBe(25_000_000 + 17_500_000 + 8_250_890 + 2_150_000 + 6_890_000);
    expect(overview.failedRecipients).toBe(2);
    expect(overview.nextScheduledAt).toBe("2026-09-02T02:00:00.000Z");
  });

  it("moves money out of pending once a batch is released", async () => {
    const before = await getPayoutsOverview(ctx);
    await approveBatch(ctx, "BATCH-2026-08-014");
    const after = await getPayoutsOverview(ctx);
    expect(after.pendingAmount).toBeLessThan(before.pendingAmount);
  });
});

describe("settings and accounts", () => {
  it("seeds the prototype's weekly / 50,000 configuration", async () => {
    const settings = await getPayoutSettings(ctx);
    expect(settings.cadence).toBe("weekly");
    expect(settings.minimumAmount).toBe(50_000);
    expect(settings.destinationAccountId).toBe("acct_bca_1234");
    expect(settings.updatedAt).toBeNull();
  });

  it("persists a partial update", async () => {
    const updated = await updatePayoutSettings(ctx, { cadence: "monthly", monthDay: 15 });
    expect(updated.cadence).toBe("monthly");
    expect(updated.monthDay).toBe(15);
    expect(updated.minimumAmount).toBe(50_000);
    expect(updated.updatedAt).not.toBeNull();
  });

  it("rejects an unverified or unknown destination", async () => {
    await expect(updatePayoutSettings(ctx, { destinationAccountId: "acct_bni_4420" })).rejects.toThrow(/not verified/i);
    await expect(updatePayoutSettings(ctx, { destinationAccountId: "nope" })).rejects.toThrow(/does not exist/i);
  });

  it("rejects a negative minimum", async () => {
    await expect(updatePayoutSettings(ctx, { minimumAmount: -1 })).rejects.toThrow(/negative/i);
  });

  it("adds a bank account as unverified and rejects duplicates", async () => {
    const account = await addBankAccount(ctx, { bank: "BRI", holder: "Acme", accountNumber: "1234-5678-9012" });
    expect(account.verified).toBe(false);
    expect(account.masked).toBe("**** 9012");
    expect((await listBankAccounts(ctx))).toHaveLength(4);
    await expect(addBankAccount(ctx, { bank: "BRI", holder: "Acme", accountNumber: "123456789012" })).rejects.toThrow(
      /already on file/i
    );
  });
});

describe("CSV", () => {
  it("exports one row per batch with a header", async () => {
    const { rows } = await listBatches(ctx);
    const csv = batchesToCsv(rows);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("batch_id");
    expect(lines).toHaveLength(rows.length + 1);
  });

  it("exports one row per recipient", async () => {
    const batch = (await getBatch(ctx, "BATCH-2026-08-012"))!;
    const lines = recipientsToCsv(batch).split("\n");
    expect(lines[0]).toContain("account_number");
    expect(lines).toHaveLength(batch.recipients.length + 1);
    expect(lines[2]).toContain("Account name mismatch");
  });

  it("quotes fields containing commas", async () => {
    const created = await createBatch(ctx, { name: "Comma, batch", recipients: [draft()] });
    const { rows } = await listBatches(ctx, { q: "Comma" });
    expect(batchesToCsv(rows)).toContain('"Comma, batch"');
    expect(created.name).toBe("Comma, batch");
  });
});
