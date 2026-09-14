// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { updateMerchantProfile } from "@/server/data/settings";
import {
  countKycTenants,
  getKycSubmission,
  profileKycCompleteness,
  removeKycDocument,
  soleKycOrganizationId,
  submitKycDocument,
} from "./kyc";

/**
 * Wave 7F Q1 — KYC tenant isolation, target-API tests (F-9).
 *
 * Invariant: **Org A cannot read, replace or clear the identity documents Org B
 * submitted.** These are the highest-confidentiality rows in this wave: a
 * submission carries a file name, a jurisdiction and a submission time about a
 * *legal entity*, so a cross-tenant read is a PII disclosure, not a display bug
 * (spec P-5).
 *
 * The store is deliberately **unseeded** (ADR-0019: a compliance document is an
 * unverified claim about the merchant, so the app must not fabricate one). That
 * makes "nothing submitted" and "submitted by another tenant" the same answer —
 * `null` — which is the anti-enumeration contract (C-5) for free.
 *
 * Step 1 of the checklist is derived from the merchant profile, so
 * `profileKycCompleteness(ctx)` must read *that* tenant's profile: completeness
 * computed from a neighbour's tax id would be a leak with a green tick on it.
 *
 * RED on `f7cb1e2`: `kyc.ts` accepts no tenant — one process-wide
 * `{ submission }` slot shared by every merchant.
 */

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA: OrganizationContext = parseOrganizationContext({ organizationId: ORG_A });
const ctxB: OrganizationContext = parseOrganizationContext({ organizationId: ORG_B });
const ctxDemo: OrganizationContext = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });

const A_DOC = {
  fileName: "alpha-incorporation-2026.pdf",
  sizeBytes: 284_113,
  docType: "incorporation" as const,
  jurisdiction: "ID",
};
const B_DOC = {
  fileName: "beta-articles-of-association.pdf",
  sizeBytes: 991_002,
  docType: "articles" as const,
  jurisdiction: "SG",
};

function resetStores() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticKycStore;
  delete g.__kineticSettingsStore;
}

beforeEach(() => {
  resetStores();
});

describe("F-9 KYC submission is per tenant", () => {
  it("nothing is submitted anywhere until a tenant submits (no fabricated document)", () => {
    expect(getKycSubmission(ctxA)).toBeNull();
    expect(getKycSubmission(ctxB)).toBeNull();
    expect(getKycSubmission(ctxDemo)).toBeNull();
  });

  it("A's document is A's: B reads null, byte-identical to 'nothing submitted'", () => {
    const submitted = submitKycDocument(ctxA, A_DOC);
    expect(submitted.fileName).toBe(A_DOC.fileName);
    expect(submitted.jurisdiction).toBe("ID");

    expect(getKycSubmission(ctxA)?.fileName).toBe(A_DOC.fileName);
    // The leak that must not happen: B resolving A's document.
    expect(getKycSubmission(ctxB)).toBeNull();
    expect(getKycSubmission(ctxDemo)).toBeNull();
    expect(JSON.stringify(getKycSubmission(ctxB))).not.toContain("alpha-incorporation");
  });

  it("two tenants hold two submissions at once", () => {
    submitKycDocument(ctxA, A_DOC);
    submitKycDocument(ctxB, B_DOC);

    expect(getKycSubmission(ctxA)?.fileName).toBe(A_DOC.fileName);
    expect(getKycSubmission(ctxB)?.fileName).toBe(B_DOC.fileName);
    expect(getKycSubmission(ctxA)?.jurisdiction).toBe("ID");
    expect(getKycSubmission(ctxB)?.jurisdiction).toBe("SG");
  });

  it("resubmitting replaces the caller's own document only", () => {
    submitKycDocument(ctxA, A_DOC);
    submitKycDocument(ctxB, B_DOC);
    const replaced = submitKycDocument(ctxA, { ...A_DOC, fileName: "alpha-license-2026.pdf", docType: "license" });

    expect(replaced.docType).toBe("license");
    expect(getKycSubmission(ctxA)?.fileName).toBe("alpha-license-2026.pdf");
    // B's document is untouched by A's resubmission.
    expect(getKycSubmission(ctxB)?.fileName).toBe(B_DOC.fileName);
  });

  it("a tenant can clear its own submission, and cannot clear a neighbour's", () => {
    submitKycDocument(ctxA, A_DOC);
    submitKycDocument(ctxB, B_DOC);

    // There is no id to aim at another tenant: the submission is the tenant's
    // own single slot, so a foreign clear is not expressible and clears nothing.
    expect(removeKycDocument(ctxDemo)).toBe(false);
    expect(getKycSubmission(ctxA)?.fileName).toBe(A_DOC.fileName);
    expect(getKycSubmission(ctxB)?.fileName).toBe(B_DOC.fileName);

    expect(removeKycDocument(ctxA)).toBe(true);
    expect(getKycSubmission(ctxA)).toBeNull();
    expect(removeKycDocument(ctxA)).toBe(false);
    // …and B's survived A's clear.
    expect(getKycSubmission(ctxB)?.fileName).toBe(B_DOC.fileName);
  });

  it("the returned submission is a copy — mutating it does not reach the store", () => {
    const submission = submitKycDocument(ctxA, A_DOC);
    submission.fileName = "tampered.pdf";
    expect(getKycSubmission(ctxA)?.fileName).toBe(A_DOC.fileName);
  });
});

describe("F-9b completeness is derived from the caller's own profile", () => {
  it("the demo profile is complete, an empty tenant profile is not", async () => {
    // The seeded demo merchant has a DBA, an address and a tax id.
    const demo = await profileKycCompleteness(ctxDemo);
    expect(demo.complete).toBe(true);
    expect(demo.fields.map((f) => f.label)).toEqual(["Business name", "Registered address", "Tax ID"]);

    // A tenant that saved nothing reports its own gaps — not the demo's values.
    const alpha = await profileKycCompleteness(ctxA);
    expect(alpha.fields.every((f) => f.value === null || f.value === "Acme")).toBe(true);
    expect(JSON.stringify(alpha.fields)).not.toContain("12-3456789"); // the demo tax id
  });

  it("a tenant's own profile drives its own completeness, and nobody else's", async () => {
    await updateMerchantProfile(ctxA, { legalName: "Alpha PT", dba: "Alpha", address: "Jl. Merdeka 1", taxId: "11-2223334" });

    const alpha = await profileKycCompleteness(ctxA);
    expect(alpha.complete).toBe(true);
    expect(alpha.fields[0]?.value).toBe("Alpha");
    expect(alpha.fields[2]?.value).toBe("11-2223334");

    const beta = await profileKycCompleteness(ctxB);
    expect(beta.complete).toBe(false);
    expect(JSON.stringify(beta.fields)).not.toContain("Alpha");
    expect(JSON.stringify(beta.fields)).not.toContain("11-2223334");
  });
});

describe("F-9c probes, store privacy and no-context refusal", () => {
  it("the tenancy probes count submitting tenants only", () => {
    // Unseeded by design: zero tenants hold a document, so there is no "the"
    // KYC tenant to assume — which is why the quarantine serves `null` rather
    // than guessing a tenant.
    expect(countKycTenants()).toBe(0);
    expect(soleKycOrganizationId()).toBeNull();

    submitKycDocument(ctxA, A_DOC);
    expect(countKycTenants()).toBe(1);
    expect(soleKycOrganizationId()).toBe(ORG_A);

    submitKycDocument(ctxB, B_DOC);
    expect(countKycTenants()).toBe(2);
    expect(soleKycOrganizationId()).toBeNull();
    // A probe answers a question about the store, never a document.
    expect(JSON.stringify([countKycTenants(), soleKycOrganizationId()])).not.toMatch(/alpha-incorporation|beta-articles/);
  });

  it("the store slot is partitioned, not one shared submission", () => {
    submitKycDocument(ctxA, A_DOC);
    const slot = (globalThis as unknown as { __kineticKycStore?: { submission?: unknown } }).__kineticKycStore;
    expect(slot?.submission).toBeUndefined();
  });

  it("every KYC entry point refuses a missing or malformed ctx", () => {
    submitKycDocument(ctxA, A_DOC);
    // @ts-expect-error — a missing ctx must not be callable where it counts
    expect(() => getKycSubmission()).toThrow();
    // @ts-expect-error — same for the write
    expect(() => submitKycDocument(A_DOC)).toThrow();
    // @ts-expect-error — and for the clear
    expect(() => removeKycDocument()).toThrow();
    expect(() => parseOrganizationContext({ organizationId: "   " })).toThrow();
  });
});
