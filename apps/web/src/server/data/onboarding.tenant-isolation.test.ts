// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { seedDemoLedgerForOrganization } from "@/server/data/transactions";
import { createApiKey, updateMerchantProfile } from "@/server/data/settings";
import { submitKycDocument } from "@/server/data/kyc";
import { getOnboardingStatus } from "./onboarding";

/**
 * Wave 7F Q1 — Onboarding tenant isolation (F-10).
 *
 * `getOnboardingStatus` owns no facts: it *derives* four checklist sections from
 * five other stores (merchant profile, payout bank accounts, API keys + webhooks
 * + the ledger, and the KYC submission). A derived checklist is therefore a
 * cross-slice leak amplifier — before this wave it printed another merchant's
 * legal name in the header, counted *everybody's* API keys and settled
 * transactions, and named another tenant's KYC document in the compliance row.
 *
 * Two properties are pinned here:
 *   1. every section is computed from the caller's tenant, and
 *   2. a two-tenant process still *serves* onboarding. The old code read the
 *      ledger through `legacyLedgerRows("onboarding")`, which throws the moment
 *      a second tenant has rows — the fail-closed "safe but unavailable" shape
 *      (D-28). Scoping the read retires that refusal and drops the `onboarding`
 *      entry from `LEGACY_LEDGER_SURFACES`, which is what Wave 7E's ES-6
 *      deletion gate needs.
 *
 * Cross-slice, recorded not fixed here: the webhook count still comes from the
 * unscoped `listWebhooks` (Wave 7G's slice). It contributes one integer to a
 * checklist item and no tenant-attributable content, so the assertions below do
 * not depend on it.
 *
 * RED on `f7cb1e2`: `getOnboardingStatus()` takes no tenant and resolves one
 * internally for payouts only (P-6).
 */

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA: OrganizationContext = parseOrganizationContext({ organizationId: ORG_A });
const ctxB: OrganizationContext = parseOrganizationContext({ organizationId: ORG_B });
const ctxDemo: OrganizationContext = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });

function resetStores() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticSettingsStore;
  delete g.__kineticKycStore;
  delete g.__kineticTxStore;
  delete g.__kineticPayoutStore;
}

beforeEach(() => {
  resetStores();
});

function check(status: Awaited<ReturnType<typeof getOnboardingStatus>>, id: string) {
  for (const section of status.sections) {
    const hit = section.checks.find((c) => c.id === id);
    if (hit) return hit;
  }
  throw new Error(`no check with id ${id}`);
}

function row(id: string, createdAt: string, fee: number) {
  return {
    id,
    createdAt,
    amount: 1_000_000,
    fee,
    net: 1_000_000 - fee,
    status: "SUCCEEDED" as const,
    currency: "IDR",
    channel: "CARD" as const,
    customerName: `${id} buyer`,
    customerEmail: `${id}@example.com`,
  };
}

describe("F-10 onboarding status is derived per tenant", () => {
  it("the header and the profile section are the caller's own merchant", async () => {
    await updateMerchantProfile(ctxA, { legalName: "Alpha PT", dba: "Alpha", address: "Jl. Merdeka 1", taxId: "11-2223334" });
    await updateMerchantProfile(ctxB, { legalName: "Beta Pte Ltd", dba: "Beta", address: "1 Raffles Place", taxId: "SG-77" });

    const a = await getOnboardingStatus(ctxA);
    const b = await getOnboardingStatus(ctxB);

    expect(a.merchantName).toBe("Alpha PT");
    expect(b.merchantName).toBe("Beta Pte Ltd");
    expect(JSON.stringify(a.sections)).not.toContain("Beta Pte Ltd");
    expect(JSON.stringify(b.sections)).not.toContain("Alpha PT");
    expect(check(a, "profile-tax").detail).toBe("11-2223334");
    expect(check(b, "profile-tax").detail).toBe("SG-77");
  });

  it("the compliance row names only the caller's document", async () => {
    submitKycDocument(ctxA, {
      fileName: "alpha-incorporation-2026.pdf",
      sizeBytes: 284_113,
      docType: "incorporation",
      jurisdiction: "ID",
    });

    const a = await getOnboardingStatus(ctxA);
    const b = await getOnboardingStatus(ctxB);

    expect(check(a, "compliance-doc").detail).toContain("alpha-incorporation-2026.pdf");
    expect(check(a, "compliance-doc").done).toBe(true);
    expect(check(b, "compliance-doc").detail).toBe("Not yet submitted");
    expect(check(b, "compliance-doc").done).toBe(false);
    expect(JSON.stringify(b.sections)).not.toContain("alpha-incorporation");
    // Compliance is shown but never counted (ADR-0019) — in any tenant.
    expect(a.sections.find((s) => s.id === "compliance")!.counts).toBe(false);
    expect(a.sections.find((s) => s.id === "compliance")!.badge).not.toBe("COMPLETED");
  });

  it("the technical section counts the caller's keys and the caller's settled ledger", async () => {
    await createApiKey(ctxA, { name: "Alpha Live", environment: "LIVE", scopes: ["read", "write"] });
    seedDemoLedgerForOrganization(ctxA, {
      mode: "replace",
      rows: [row("txn_a_jan", "2026-01-15T10:00:00.000Z", 29_000)],
    });
    seedDemoLedgerForOrganization(ctxB, { mode: "replace", rows: [] });

    const a = await getOnboardingStatus(ctxA);
    const b = await getOnboardingStatus(ctxB);

    expect(check(a, "tech-keys").detail).toContain("1 keys on file");
    expect(check(a, "tech-keys").done).toBe(true);
    expect(check(b, "tech-keys").detail).toBe("No keys generated yet");
    expect(check(b, "tech-keys").done).toBe(false);

    expect(check(a, "tech-first-txn").detail).toBe("1 successful transaction settled");
    expect(check(a, "tech-first-txn").done).toBe(true);
    expect(check(b, "tech-first-txn").detail).toBe("No successful transactions yet");
    expect(check(b, "tech-first-txn").done).toBe(false);
    expect(JSON.stringify(b.sections)).not.toContain("Alpha Live");
  });

  it("the bank section reads the caller's payout accounts", async () => {
    const a = await getOnboardingStatus(ctxA);
    const demo = await getOnboardingStatus(ctxDemo);

    // A fresh tenant has no destination account; the demo tenant keeps the
    // prototype's seeded one. Neither sees the other's.
    expect(check(a, "bank-account").detail).toBe("No destination account on file");
    expect(check(a, "bank-account").done).toBe(false);
    expect(check(demo, "bank-account").done).toBe(true);
    expect(check(demo, "bank-account").detail).not.toBe("No destination account on file");
    expect(JSON.stringify(a.sections)).not.toContain(check(demo, "bank-account").detail);
  });

  it("progress is computed from the caller's three tracked sections only", async () => {
    await updateMerchantProfile(ctxA, { legalName: "Alpha PT", address: "Jl. Merdeka 1", taxId: "11-2223334" });
    const a = await getOnboardingStatus(ctxA);

    expect(a.trackedTotal).toBe(3);
    expect(a.sections.filter((s) => s.counts)).toHaveLength(3);
    expect(a.progress).toBe(Math.round((a.trackedComplete / a.trackedTotal) * 100));
    expect(a.allDone).toBe(a.trackedComplete === a.trackedTotal);
  });

  it("a two-tenant process still serves both tenants (no fail-closed refusal)", async () => {
    // The pre-7F read rode the ledger quarantine: as soon as a second tenant had
    // rows, `legacyLedgerRows("onboarding")` threw and *nobody* got a checklist.
    seedDemoLedgerForOrganization(ctxA, { mode: "replace", rows: [row("txn_a", "2026-01-15T10:00:00.000Z", 29_000)] });
    seedDemoLedgerForOrganization(ctxB, { mode: "replace", rows: [row("txn_b", "2026-02-15T10:00:00.000Z", 58_000)] });
    seedDemoLedgerForOrganization(ctxDemo, { count: 3 });

    await expect(getOnboardingStatus(ctxA)).resolves.toBeDefined();
    await expect(getOnboardingStatus(ctxB)).resolves.toBeDefined();
    await expect(getOnboardingStatus(ctxDemo)).resolves.toBeDefined();
    expect(check(await getOnboardingStatus(ctxB), "tech-first-txn").detail).toBe("1 successful transaction settled");
  });

  it("refuses a missing or malformed ctx", async () => {
    // @ts-expect-error — a missing ctx must not be callable where it counts
    await expect(getOnboardingStatus()).rejects.toThrow();
    expect(() => parseOrganizationContext({ organizationId: "   " })).toThrow();
  });
});
