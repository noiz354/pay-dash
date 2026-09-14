import { describe, expect, it } from "vitest";
import { DEMO_CONTEXT } from "@/test/organization-context";
import {
  addBlocklist,
  blocklistSummary,
  blocklistToCsv,
  getBlocklistEntry,
  isValidEmailDomain,
  isValidIp,
  listBlocklist,
  maskCardNumber,
  removeBlocklist,
} from "./blocklist";

const ALL = { type: "ALL", pageSize: 100 } as const;

describe("blocklist store (ADR-0024)", () => {
  it("seeds one coherent world: 10 entries across all three types, date-relative", async () => {
    const { rows } = await listBlocklist(DEMO_CONTEXT, ALL);
    expect(rows).toHaveLength(10);
    const byType = (t: string) => rows.filter((r) => r.type === t).length;
    expect(byType("IP")).toBe(6);
    expect(byType("CARD")).toBe(2);
    expect(byType("EMAIL")).toBe(2);
    for (const r of rows) {
      expect(r.id).toMatch(/^blk_[0-9a-z]{8}$/);
      // no 2023 prototype stamps: everything is recent
      const ageDays = (Date.now() - new Date(r.addedAt).getTime()) / 86_400_000;
      expect(ageDays).toBeGreaterThan(-1);
      expect(ageDays).toBeLessThan(60);
    }
    // newest first
    for (let i = 1; i < rows.length; i++) {
      expect(new Date(rows[i].addedAt).getTime()).toBeLessThanOrEqual(new Date(rows[i - 1].addedAt).getTime());
    }
  });

  it("the summary derives per-type counts and 30d activity", async () => {
    const s = await blocklistSummary(DEMO_CONTEXT);
    expect(s.total).toBe(10);
    expect(s.byType).toEqual({ IP: 6, CARD: 2, EMAIL: 2 });
    expect(s.addedLast30d).toBeGreaterThanOrEqual(7);
    expect(s.addedLast30d).toBeLessThanOrEqual(9);
  });

  it("filters by type and query, and the two routes share the store", async () => {
    const cards = await listBlocklist(DEMO_CONTEXT, { type: "CARD" });
    expect(cards.total).toBe(2);
    expect(cards.rows.every((r) => r.type === "CARD")).toBe(true);

    const hit = await listBlocklist(DEMO_CONTEXT, { q: "203.0" });
    expect(hit.total).toBe(1);
    expect(hit.rows[0].type).toBe("IP");

    const none = await listBlocklist(DEMO_CONTEXT, { type: "CARD", q: "203.0" });
    expect(none.total).toBe(0);
  });

  it("validates and normalises every type", () => {
    expect(isValidIp("203.0.113.42")).toBe(true);
    expect(isValidIp("999.1.1.1")).toBe(false);
    expect(isValidIp("fe80::1")).toBe(true);
    expect(maskCardNumber("4533 2201 1012 3456")).toBe("453322 •••• 3456");
    expect(maskCardNumber("4533")).toBeNull();
    expect(isValidEmailDomain("example.com")).toBe(true);
    expect(isValidEmailDomain("john@example.com")).toBe(false);
    expect(isValidEmailDomain("-bad.com")).toBe(false);
  });

  it("addBlocklist: valid add lands, invalid and duplicate adds are rejected", async () => {
    const before = (await blocklistSummary(DEMO_CONTEXT)).total;

    const ok = await addBlocklist(DEMO_CONTEXT, {
      type: "IP",
      value: "93.184.216.34",
      reason: "MANUAL_ENTRY",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.entry.addedAt).toBeTruthy();
      const fetched = await getBlocklistEntry(DEMO_CONTEXT, ok.entry.id);
      expect(fetched?.value).toBe("93.184.216.34");
    }
    expect((await blocklistSummary(DEMO_CONTEXT)).total).toBe(before + 1);

    // card input is raw digits, stored masked
    const card = await addBlocklist(DEMO_CONTEXT, {
      type: "CARD",
      value: "5105105105100100",
      reason: "CHARGEBACK_ABUSE",
    });
    expect(card.ok).toBe(true);
    if (card.ok) expect(card.entry.value).toBe("510510 •••• 0100");

    const dup = await addBlocklist(DEMO_CONTEXT, { type: "IP", value: "93.184.216.34", reason: "MANUAL_ENTRY" });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toBe("Already on the blocklist.");

    const badIp = await addBlocklist(DEMO_CONTEXT, { type: "IP", value: "999.1.1.1", reason: "MANUAL_ENTRY" });
    expect(badIp.ok).toBe(false);

    const fullEmail = await addBlocklist(DEMO_CONTEXT, { type: "EMAIL", value: "a@b.com", reason: "MANUAL_ENTRY" });
    expect(fullEmail.ok).toBe(false);

    // clean up so later specs see the seeded world
    if (ok.ok) expect(await removeBlocklist(DEMO_CONTEXT, ok.entry.id)).toBe(true);
    if (card.ok) expect(await removeBlocklist(DEMO_CONTEXT, card.entry.id)).toBe(true);
    expect((await blocklistSummary(DEMO_CONTEXT)).total).toBe(before);
  });

  it("removeBlocklist: removes once, is a no-op afterwards", async () => {
    const added = await addBlocklist(DEMO_CONTEXT, { type: "EMAIL", value: "throwaway.net", reason: "HIGH_FREQUENCY" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(await removeBlocklist(DEMO_CONTEXT, added.entry.id)).toBe(true);
    expect(await getBlocklistEntry(DEMO_CONTEXT, added.entry.id)).toBeNull();
    expect(await removeBlocklist(DEMO_CONTEXT, added.entry.id)).toBe(false);
  });

  it("exports csv with one row per entry and raw values", async () => {
    const { rows } = await listBlocklist(DEMO_CONTEXT, ALL);
    const csv = blocklistToCsv(rows);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("type,value,reason,added_at");
    expect(lines).toHaveLength(rows.length + 1);
    for (const line of lines.slice(1)) {
      const cells = line.split(",");
      expect(cells).toHaveLength(4);
      expect(["IP", "CARD", "EMAIL"]).toContain(cells[0]);
      expect(cells[2]).toMatch(/^[A-Z_]+$/);
    }
  });
});
