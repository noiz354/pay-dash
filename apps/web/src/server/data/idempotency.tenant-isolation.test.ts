// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import {
  checkConflict,
  checkForConflict,
  checkIdempotency,
  countIdempotencyTenants,
  executeWithIdempotency,
  generateIdempotencyKey,
  generateKeyPrefix,
  generateSimpleIdempotencyKey,
  soleIdempotencyOrganizationId,
  storeIdempotencyResult,
} from "./idempotency";

/**
 * Wave 7G Q1 — idempotency tenant isolation, target-API tests (G-6).
 *
 * ADR-0036 already makes the *key* org-bound by construction
 * (`hash(orgId + type + entityId + payloadHash)`), so this wave pins
 * enforcement rather than redesigning the key. Q0 verification found the
 * enforcement missing in five places, one of which the drafted spec did not
 * list at all:
 *
 *   - `storeIdempotencyResult(key, type, orgId, …)` took `orgId` as a **trusted
 *     parameter** and wrote into one process-wide `Map` — the stored tenant was
 *     whatever the caller said;
 *   - `checkIdempotency(key)` was a bare global `get`, so a caller holding
 *     another org's key received that org's stored **result payload**;
 *   - `checkConflict(keyPrefix, …)` scanned the whole store by prefix — an
 *     existence oracle over other tenants' in-flight money operations;
 *   - **`checkForConflict(orgId, …)` returned `existingRecord`** — the full
 *     record, result included, for *any* `orgId` passed in. That is the leak.
 *
 * Honest bound recorded here and in the report: `idempotency.ts` has **zero
 * non-test production consumers** at `6c104ab`, so this is a *latent* leak on an
 * exported surface, not a live one. It is pinned anyway, because the next caller
 * to adopt it would inherit the hole.
 *
 * RED on `6c104ab`: no function takes a context.
 */

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA: OrganizationContext = parseOrganizationContext({ organizationId: ORG_A });
const ctxB: OrganizationContext = parseOrganizationContext({ organizationId: ORG_B });
const ctxDemo: OrganizationContext = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });

function resetStores() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticIdempotencyStore;
}

function rawPartitions(): Map<string, Map<string, { orgId: string; result: Record<string, unknown> }>> {
  const g = globalThis as unknown as {
    __kineticIdempotencyStore?: { tenants?: Map<string, Map<string, { orgId: string; result: Record<string, unknown> }>> };
  };
  return g.__kineticIdempotencyStore?.tenants ?? new Map();
}

const PAYLOAD = { batchId: "batch_1", amount: 250_000 };
const OTHER_PAYLOAD = { batchId: "batch_1", amount: 999_999 };

beforeEach(() => {
  resetStores();
});

describe("G-6 idempotency records are per tenant", () => {
  it("the same key in a different tenant is a miss, never a hit", async () => {
    const key = generateIdempotencyKey(ORG_A, "payout:create", "batch_1", PAYLOAD);
    await storeIdempotencyResult(ctxA, key, "payout:create", "hash_a", { payoutId: "po_alpha_1" });

    expect(await checkIdempotency(ctxA, key)).not.toBeNull();
    expect((await checkIdempotency(ctxA, key))?.result).toEqual({ payoutId: "po_alpha_1" });

    // The leak that must not happen: B (or demo) resolving A's stored result.
    expect(await checkIdempotency(ctxB, key)).toBeNull();
    expect(await checkIdempotency(ctxDemo, key)).toBeNull();
  });

  it("the stored org comes from the context, not from the record's own field", async () => {
    const key = generateIdempotencyKey(ORG_B, "refund:request", "rf_1", PAYLOAD);
    // A stores a record whose key was generated for B: the partition is decided
    // by the ctx, so the row lands in A and is invisible to B.
    await storeIdempotencyResult(ctxA, key, "refund:request", "hash", { refundId: "rf_alpha" });

    expect(await checkIdempotency(ctxA, key)).not.toBeNull();
    expect(await checkIdempotency(ctxB, key)).toBeNull();
    expect(rawPartitions().get(ORG_A)?.get(key)?.orgId).toBe(ORG_A);
    expect(rawPartitions().has(ORG_B)).toBe(false);
  });

  it("two tenants can hold the same logical operation at once", async () => {
    const keyA = generateIdempotencyKey(ORG_A, "payout:create", "batch_1", PAYLOAD);
    const keyB = generateIdempotencyKey(ORG_B, "payout:create", "batch_1", PAYLOAD);
    expect(keyA).not.toBe(keyB); // the org is inside the hash

    await storeIdempotencyResult(ctxA, keyA, "payout:create", "h", { payoutId: "po_alpha" });
    await storeIdempotencyResult(ctxB, keyB, "payout:create", "h", { payoutId: "po_beta" });

    expect((await checkIdempotency(ctxA, keyA))?.result).toEqual({ payoutId: "po_alpha" });
    expect((await checkIdempotency(ctxB, keyB))?.result).toEqual({ payoutId: "po_beta" });
    expect(await checkIdempotency(ctxA, keyB)).toBeNull();
    expect(await checkIdempotency(ctxB, keyA)).toBeNull();
  });

  it("a replay inside the tenant returns the stored result and does not re-run the operation", async () => {
    let runs = 0;
    const operation = async () => {
      runs += 1;
      return { payoutId: `po_run_${runs}` };
    };

    const first = await executeWithIdempotency(ctxA, { type: "payout:create", entityId: "batch_9", payload: PAYLOAD, operation });
    const second = await executeWithIdempotency(ctxA, { type: "payout:create", entityId: "batch_9", payload: PAYLOAD, operation });

    expect(runs).toBe(1);
    expect(second).toEqual(first);
  });

  it("the same operation in two tenants runs twice — B does not inherit A's result", async () => {
    let runs = 0;
    const operation = async () => {
      runs += 1;
      return { payoutId: `po_run_${runs}` };
    };

    const a = await executeWithIdempotency(ctxA, { type: "payout:create", entityId: "batch_9", payload: PAYLOAD, operation });
    const b = await executeWithIdempotency(ctxB, { type: "payout:create", entityId: "batch_9", payload: PAYLOAD, operation });

    expect(runs).toBe(2);
    expect(a).not.toEqual(b);
    expect(a.payoutId).toBe("po_run_1");
    expect(b.payoutId).toBe("po_run_2");
  });

  it("a conflict is detected inside the tenant only", async () => {
    const prefix = generateKeyPrefix(ORG_A, "payout:approve", "batch_1");
    await storeIdempotencyResult(ctxA, `${prefix}hash1`, "payout:approve", "hash1", { ok: true });

    // Same prefix, different payload hash, same tenant ⇒ conflict.
    expect(await checkConflict(ctxA, prefix, "hash2")).toBe(true);
    expect(await checkConflict(ctxA, prefix, "hash1")).toBe(false);

    // Another tenant's prefix scan sees nothing — no existence oracle.
    expect(await checkConflict(ctxB, prefix, "hash2")).toBe(false);
  });

  it("checkForConflict never returns a foreign record", async () => {
    await executeWithIdempotency(ctxA, {
      type: "payout:create",
      entityId: "batch_1",
      payload: PAYLOAD,
      operation: async () => ({ payoutId: "po_alpha_secret", account: "1234567890" }),
    });

    // B asking about the same entity with a different payload: no conflict seen,
    // and above all no `existingRecord` carrying A's result.
    const b = await checkForConflict(ctxB, "payout:create", "batch_1", OTHER_PAYLOAD);
    expect(b.isConflict).toBe(false);
    expect(b.existingRecord).toBeUndefined();
    expect(JSON.stringify(b)).not.toContain("po_alpha_secret");
    expect(JSON.stringify(b)).not.toContain("1234567890");

    // A sees its own conflict, with its own record.
    const a = await checkForConflict(ctxA, "payout:create", "batch_1", OTHER_PAYLOAD);
    expect(a.isConflict).toBe(true);
    expect(a.existingRecord?.orgId).toBe(ORG_A);
    expect(a.existingRecord?.result).toEqual({ payoutId: "po_alpha_secret", account: "1234567890" });
  });

  it("a matching payload in another tenant is not a conflict either", async () => {
    await storeIdempotencyResult(ctxA, generateKeyPrefix(ORG_A, "payment:create", "p1") + "h", "payment:create", "h", { ok: 1 });
    const b = await checkForConflict(ctxB, "payment:create", "p1", PAYLOAD);
    expect(b.isConflict).toBe(false);
    expect(b.message).toMatch(/No conflict/i);
  });

  it("probes count tenants and never return a record", async () => {
    expect(countIdempotencyTenants()).toBe(0);
    expect(soleIdempotencyOrganizationId()).toBeNull();

    await storeIdempotencyResult(ctxA, "k1", "payout:create", "h", { ok: 1 });
    expect(countIdempotencyTenants()).toBe(1);
    expect(soleIdempotencyOrganizationId()).toBe(ORG_A);

    await storeIdempotencyResult(ctxB, "k2", "payout:create", "h", { ok: 1 });
    expect(countIdempotencyTenants()).toBe(2);
    expect(soleIdempotencyOrganizationId()).toBeNull();
  });

  it("the store holds one partition per tenant", async () => {
    await storeIdempotencyResult(ctxA, "k1", "payout:create", "h", { ok: 1 });
    await storeIdempotencyResult(ctxB, "k2", "payout:create", "h", { ok: 2 });

    const partitions = rawPartitions();
    expect([...partitions.keys()].sort()).toEqual([ORG_A, ORG_B].sort());
    expect(partitions.get(ORG_A)?.size).toBe(1);
    expect(partitions.get(ORG_B)?.size).toBe(1);
  });

  it("a missing context is rejected on every entry point", async () => {
    const missing = undefined as unknown as OrganizationContext;
    await expect(storeIdempotencyResult(missing, "k", "payout:create", "h", {})).rejects.toThrow();
    await expect(checkIdempotency(missing, "k")).rejects.toThrow();
    await expect(checkConflict(missing, "p:", "h")).rejects.toThrow();
    await expect(checkForConflict(missing, "payout:create", "e", PAYLOAD)).rejects.toThrow();
    await expect(
      executeWithIdempotency(missing, { type: "payout:create", entityId: "e", payload: PAYLOAD, operation: async () => ({}) }),
    ).rejects.toThrow();
    expect(() => parseOrganizationContext({ organizationId: "   " })).toThrow();
  });
});

describe("G-6b key generators stay pure", () => {
  it("they are deterministic functions of their arguments and read no store", () => {
    const k1 = generateIdempotencyKey(ORG_A, "payout:create", "batch_1", PAYLOAD);
    const k2 = generateIdempotencyKey(ORG_A, "payout:create", "batch_1", PAYLOAD);
    expect(k1).toBe(k2);
    expect(k1).not.toBe(generateIdempotencyKey(ORG_B, "payout:create", "batch_1", PAYLOAD));
    expect(k1).not.toBe(generateIdempotencyKey(ORG_A, "payout:create", "batch_1", OTHER_PAYLOAD));

    expect(generateSimpleIdempotencyKey(ORG_A, "topup:create", PAYLOAD)).toBeTruthy();
    expect(generateKeyPrefix(ORG_A, "payout:create", "batch_1")).toBe(`${ORG_A}:payout:create:batch_1:`);
  });
});
