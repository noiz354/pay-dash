// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { TenantIsolationError } from "@/domain/security/tenant";
import {
  addBlocklist,
  blocklistSummary,
  blocklistToCsv,
  countBlocklistTenants,
  getBlocklistEntry,
  isValidEmailDomain,
  isValidIp,
  listBlocklist,
  maskCardNumber,
  removeBlocklist,
  soleBlocklistOrganizationId,
} from "./blocklist";

/**
 * Wave 7G Q1 — fraud blocklist tenant isolation, target-API tests (G-4).
 *
 * Invariant: **Org A cannot read, extend or prune Org B's fraud blocklist.**
 * Two writers the drafted spec missed make this more than a read leak:
 *   - `addBlocklist` checked duplicates against a **global** list, so the answer
 *     "Already on the blocklist." disclosed that *another tenant* had blocked
 *     that IP/card/domain — an existence oracle over a fraud signal;
 *   - `removeBlocklist(id)` deleted by id alone, so any caller could prune
 *     another tenant's fraud controls (a security downgrade performed on B's
 *     behalf, silently).
 *
 * `entryId(type, value)` is a pure djb2 hash, so the same blocked value in two
 * tenants mints the **same id**. Isolation is therefore the composite key
 * `(organizationId, id)` — never id secrecy (spec P-10, same shape as 7C/7F).
 *
 * Card values are stored masked and IPs/domains are fraud signals about third
 * parties, so a cross-tenant read is a disclosure of another merchant's
 * investigation state, not a display bug.
 *
 * RED on `6c104ab`: `blocklist.ts` accepts no tenant — one process-wide
 * `{ entries }` array shared by every merchant.
 */

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA: OrganizationContext = parseOrganizationContext({ organizationId: ORG_A });
const ctxB: OrganizationContext = parseOrganizationContext({ organizationId: ORG_B });
const ctxDemo: OrganizationContext = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });

function resetStores() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticBlocklistStore;
}

function rawPartitions(): Map<string, { entries: { id: string; value: string }[] }> {
  const g = globalThis as unknown as {
    __kineticBlocklistStore?: { tenants?: Map<string, { entries: { id: string; value: string }[] }> };
  };
  return g.__kineticBlocklistStore?.tenants ?? new Map();
}

const A_IP = { type: "IP", value: "198.51.100.7", reason: "KNOWN_MALICIOUS" };
const B_IP = { type: "IP", value: "203.0.113.99", reason: "CHARGEBACK_ABUSE" };

beforeEach(() => {
  resetStores();
});

describe("G-4 the blocklist is per tenant", () => {
  it("the seeded entries belong to the demo tenant, not to every tenant", async () => {
    const demo = await listBlocklist(ctxDemo, { pageSize: 100 });
    expect(demo.total).toBeGreaterThan(0);
    expect(demo.rows.some((e) => e.value === "mailinator.com")).toBe(true);

    expect((await listBlocklist(ctxA, { pageSize: 100 })).total).toBe(0);
    expect((await listBlocklist(ctxB, { pageSize: 100 })).total).toBe(0);
    expect(JSON.stringify((await listBlocklist(ctxA, { pageSize: 100 })).rows)).not.toContain("mailinator");
  });

  it("A's entry is A's: B and demo never see it", async () => {
    const added = await addBlocklist(ctxA, A_IP);
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    expect((await listBlocklist(ctxA, { pageSize: 100 })).total).toBe(1);
    expect((await listBlocklist(ctxB, { pageSize: 100 })).total).toBe(0);
    expect(JSON.stringify((await listBlocklist(ctxB, { pageSize: 100 })).rows)).not.toContain("198.51.100.7");
    expect(await getBlocklistEntry(ctxB, added.entry.id)).toBeNull();
  });

  it("the owner comes from the context, never from the input", async () => {
    const forged = { ...A_IP, organizationId: ORG_B } as unknown as typeof A_IP;
    const added = await addBlocklist(ctxA, forged);
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    expect(await getBlocklistEntry(ctxA, added.entry.id)).not.toBeNull();
    expect(await getBlocklistEntry(ctxB, added.entry.id)).toBeNull();
  });

  it("the duplicate check is per tenant: the same value in two tenants is two entries", async () => {
    const a = await addBlocklist(ctxA, A_IP);
    const b = await addBlocklist(ctxB, A_IP); // same type + value => same pure id
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    expect(a.entry.id).toBe(b.entry.id); // composite key, not id secrecy
    expect((await listBlocklist(ctxA, { pageSize: 100 })).total).toBe(1);
    expect((await listBlocklist(ctxB, { pageSize: 100 })).total).toBe(1);
    // Each partition answers for its own row even though the ids are identical.
    expect(await getBlocklistEntry(ctxA, a.entry.id)).not.toBeNull();
    expect(rawPartitions().get(ORG_A)?.entries).toHaveLength(1);
    expect(rawPartitions().get(ORG_B)?.entries).toHaveLength(1);
  });

  it("a duplicate inside one tenant is still refused, without naming another tenant", async () => {
    await addBlocklist(ctxA, A_IP);
    const again = await addBlocklist(ctxA, A_IP);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error).toMatch(/Already on the blocklist/);

    // B adding the same value is NOT refused by A's row (the oracle that existed).
    const b = await addBlocklist(ctxB, A_IP);
    expect(b.ok).toBe(true);
  });

  it("type / q / page filters narrow inside the tenant and never widen", async () => {
    await addBlocklist(ctxA, A_IP);
    await addBlocklist(ctxA, { type: "EMAIL", value: "throwaway.test", reason: "HIGH_FREQUENCY" });
    await addBlocklist(ctxB, B_IP);

    expect((await listBlocklist(ctxA, { type: "IP", pageSize: 100 })).total).toBe(1);
    expect((await listBlocklist(ctxA, { type: "EMAIL", pageSize: 100 })).total).toBe(1);
    expect((await listBlocklist(ctxA, { q: "throwaway", pageSize: 100 })).total).toBe(1);
    expect((await listBlocklist(ctxA, { q: "203.0.113.99", pageSize: 100 })).total).toBe(0);
    expect((await listBlocklist(ctxA, { q: "203.0.113.99", pageSize: 100 })).isFiltered).toBe(true);

    const paged = await listBlocklist(ctxA, { page: 1, pageSize: 5 });
    expect(paged.total).toBe(2);
    expect(paged.rows).toHaveLength(2);
  });

  it("detail by id: null for a foreign id, identical to an unknown id", async () => {
    const added = await addBlocklist(ctxA, A_IP);
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    expect(await getBlocklistEntry(ctxA, added.entry.id)).not.toBeNull();
    expect(await getBlocklistEntry(ctxB, added.entry.id)).toBeNull();
    expect(await getBlocklistEntry(ctxB, added.entry.id)).toEqual(await getBlocklistEntry(ctxB, "blk_nonsense"));
  });

  it("the summary counts the caller's own entries only", async () => {
    await addBlocklist(ctxA, A_IP);
    await addBlocklist(ctxA, { type: "CARD", value: "4533221100990110", reason: "CHARGEBACK_ABUSE" });
    await addBlocklist(ctxB, B_IP);

    const a = await blocklistSummary(ctxA);
    expect(a.total).toBe(2);
    expect(a.byType.IP).toBe(1);
    expect(a.byType.CARD).toBe(1);
    expect(a.byType.EMAIL).toBe(0);
    expect(a.addedLast30d).toBe(2);

    const b = await blocklistSummary(ctxB);
    expect(b.total).toBe(1);
    expect(b.byType.IP).toBe(1);

    // A fresh tenant does not inherit the demo tenant's ten seeded entries.
    const fresh = await blocklistSummary(parseOrganizationContext({ organizationId: "org_gamma" }));
    expect(fresh.total).toBe(0);
  });

  it("cards are stored masked, in the caller's own partition", async () => {
    const added = await addBlocklist(ctxA, { type: "CARD", value: "4533 2211 0099 0110", reason: "KNOWN_MALICIOUS" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.entry.value).toBe("453322 •••• 0110");
    expect(added.entry.value).not.toContain("0099");
    expect((await listBlocklist(ctxB, { pageSize: 100 })).total).toBe(0);
  });

  it("validation runs before tenancy: a bad value is a field error, not an isolation error", async () => {
    expect(await addBlocklist(ctxA, { type: "IP", value: "not-an-ip", reason: "KNOWN_MALICIOUS" })).toMatchObject({ ok: false });
    expect(await addBlocklist(ctxA, { type: "EMAIL", value: "person@example.com", reason: "HIGH_FREQUENCY" })).toMatchObject({ ok: false });
    expect(await addBlocklist(ctxA, { type: "NOPE", value: "1.2.3.4", reason: "KNOWN_MALICIOUS" })).toMatchObject({ ok: false });
    // Nothing was written anywhere by the rejected attempts.
    expect(rawPartitions().get(ORG_A)?.entries ?? []).toHaveLength(0);
  });

  it("removing A's own entry returns true and removes only it", async () => {
    const a = await addBlocklist(ctxA, A_IP);
    const b = await addBlocklist(ctxB, A_IP); // identical id in B's partition
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    expect(await removeBlocklist(ctxA, a.entry.id)).toBe(true);
    expect((await listBlocklist(ctxA, { pageSize: 100 })).total).toBe(0);
    // B's identically-id'd entry survives — the delete was partition-scoped.
    expect((await listBlocklist(ctxB, { pageSize: 100 })).total).toBe(1);
    expect(await getBlocklistEntry(ctxB, b.entry.id)).not.toBeNull();
  });

  it("removing a foreign entry throws, is attributed, and removes nothing", async () => {
    const b = await addBlocklist(ctxB, B_IP);
    expect(b.ok).toBe(true);
    if (!b.ok) return;

    let caught: unknown;
    try {
      await removeBlocklist(ctxA, b.entry.id);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TenantIsolationError);
    expect((caught as TenantIsolationError).code).toBe("CROSS_TENANT_WRITE");
    expect((caught as TenantIsolationError).detail.actorOrg).toBe(ORG_A);
    expect((caught as TenantIsolationError).detail.requestedOrg).toBe(ORG_B);

    expect(await getBlocklistEntry(ctxB, b.entry.id)).not.toBeNull();
    expect(rawPartitions().get(ORG_B)?.entries).toHaveLength(1);
  });

  it("removing an unknown id returns false (reserved for 'nothing to remove')", async () => {
    expect(await removeBlocklist(ctxA, "blk_nonsense")).toBe(false);
  });

  it("returned rows are copies: mutating the answer cannot reach the store", async () => {
    const added = await addBlocklist(ctxA, A_IP);
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const row = await getBlocklistEntry(ctxA, added.entry.id);
    row!.value = "tampered";
    expect((await getBlocklistEntry(ctxA, added.entry.id))!.value).toBe("198.51.100.7");
  });
});

describe("G-12f probes, partitions, CSV and missing context", () => {
  it("the store holds partitions, not one shared array", async () => {
    await addBlocklist(ctxA, A_IP);
    await addBlocklist(ctxB, B_IP);

    const partitions = rawPartitions();
    expect([...partitions.keys()].sort()).toEqual([ORG_A, ORG_B].sort());
  });

  it("probes count tenants and never return an entry", async () => {
    expect(countBlocklistTenants()).toBe(0);
    expect(soleBlocklistOrganizationId()).toBeNull();

    await addBlocklist(ctxA, A_IP);
    expect(countBlocklistTenants()).toBe(1);
    expect(soleBlocklistOrganizationId()).toBe(ORG_A);

    await addBlocklist(ctxB, B_IP);
    expect(countBlocklistTenants()).toBe(2);
    expect(soleBlocklistOrganizationId()).toBeNull();
  });

  it("the demo seed counts as exactly one tenant, and reads do not materialise it", async () => {
    expect(countBlocklistTenants()).toBe(0);
    await listBlocklist(ctxDemo, { pageSize: 1 });
    expect(countBlocklistTenants()).toBe(1);
    expect(soleBlocklistOrganizationId()).toBe(DEFAULT_DEMO_ORG);
  });

  it("a missing context is rejected on every read and write", async () => {
    const missing = undefined as unknown as OrganizationContext;
    await expect(listBlocklist(missing)).rejects.toThrow();
    await expect(getBlocklistEntry(missing, "blk_x")).rejects.toThrow();
    await expect(blocklistSummary(missing)).rejects.toThrow();
    await expect(addBlocklist(missing, A_IP)).rejects.toThrow();
    await expect(removeBlocklist(missing, "blk_x")).rejects.toThrow();
    expect(() => parseOrganizationContext({ organizationId: "   " })).toThrow();
  });

  it("validators and the CSV formatter stay pure — no store, no tenant column", async () => {
    expect(isValidIp("198.51.100.7")).toBe(true);
    expect(isValidIp("999.1.1.1")).toBe(false);
    expect(maskCardNumber("4533221100990110")).toBe("453322 •••• 0110");
    expect(maskCardNumber("123")).toBeNull();
    expect(isValidEmailDomain("example.com")).toBe(true);
    expect(isValidEmailDomain("person@example.com")).toBe(false);

    await addBlocklist(ctxA, A_IP);
    const { rows } = await listBlocklist(ctxA, { pageSize: 100 });
    const csv = blocklistToCsv(rows);
    expect(csv.split("\n")[0]).toBe("type,value,reason,added_at");
    // The frozen vocabulary carries no tenancy column (GS-5).
    expect(csv).not.toMatch(/organization|tenant/i);
    expect(csv).toContain("198.51.100.7");
  });
});
