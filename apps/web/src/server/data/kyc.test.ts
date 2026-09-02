import { beforeEach, describe, expect, it } from "vitest";
import {
  getKycSubmission,
  profileKycCompleteness,
  removeKycDocument,
  submitKycDocument,
} from "./kyc";

function resetAllStores() {
  const g = globalThis as unknown as {
    __kineticKycStore?: unknown;
    __kineticSettingsStore?: unknown;
  };
  g.__kineticKycStore = undefined;
  g.__kineticSettingsStore = undefined;
}

beforeEach(resetAllStores);

describe("kyc submission store", () => {
  it("starts unseeded — the app does not fabricate compliance documents", () => {
    expect(getKycSubmission()).toBeNull();
  });

  it("submits, replaces and removes a document", () => {
    expect(removeKycDocument()).toBe(false);

    const first = submitKycDocument({
      fileName: "skeleton_akta_perseroan.pdf",
      sizeBytes: 2_400_000,
      docType: "incorporation",
      jurisdiction: "Indonesia (KemenkumHAM)",
      submittedAt: "2026-09-01T03:00:00.000Z",
    });
    expect(first.submittedAt).toBe("2026-09-01T03:00:00.000Z");
    expect(getKycSubmission()?.fileName).toBe("skeleton_akta_perseroan.pdf");

    const second = submitKycDocument({
      fileName: "npwp_company.pdf",
      sizeBytes: 100_000,
      docType: "tax",
      jurisdiction: "Indonesia (DJP)",
    });
    expect(getKycSubmission()).toMatchObject({ fileName: "npwp_company.pdf", docType: "tax" });
    expect(second.submittedAt).toBeTruthy();

    expect(removeKycDocument()).toBe(true);
    expect(getKycSubmission()).toBeNull();
    expect(removeKycDocument()).toBe(false);
  });

  it("returns a copy, not the live store reference", () => {
    const a = submitKycDocument({
      fileName: "x.pdf",
      sizeBytes: 10,
      docType: "license",
      jurisdiction: "Indonesia",
    });
    const b = getKycSubmission();
    b!.fileName = "mutated.pdf";
    expect(a.fileName).toBe("x.pdf");
  });
});

describe("profile KYC completeness (step 1)", () => {
  it("derives from the merchant profile — the seeded profile is complete", async () => {
    const result = await profileKycCompleteness();
    expect(result.complete).toBe(true);
    expect(result.fields.map((f) => f.value)).toEqual([
      "Acme", // dba takes precedence
      "123 Financial Plaza, Suite 400",
      "12-3456789",
    ]);
  });

  it("reports missing fields instead of faking completeness", async () => {
    // Mutate the seeded profile through the store's own writer path.
    const { updateMerchantProfile } = await import("./settings");
    await updateMerchantProfile({ taxId: "  ", address: "" });
    const after = await profileKycCompleteness();
    expect(after.complete).toBe(false);
    expect(after.fields.filter((f) => !f.present).map((f) => f.label)).toEqual([
      "Registered address",
      "Tax ID",
    ]);
  });
});
