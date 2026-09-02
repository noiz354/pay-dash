import { beforeEach, describe, expect, it } from "vitest";
import { removeKycDocument, submitKycDocument } from "./kyc";
import { getOnboardingStatus } from "./onboarding";
import { createApiKey } from "./settings";

function resetAllStores() {
  const g = globalThis as unknown as {
    __kineticSettingsStore?: unknown;
    __kineticPayoutStore?: unknown;
    __kineticWebhooksStore?: unknown;
    __kineticTxStore?: unknown;
    __kineticKycStore?: unknown;
  };
  g.__kineticSettingsStore = undefined;
  g.__kineticPayoutStore = undefined;
  g.__kineticWebhooksStore = undefined;
  g.__kineticTxStore = undefined;
  g.__kineticKycStore = undefined;
}

beforeEach(resetAllStores);

// Seeded world: the merchant profile is complete, two of three bank accounts
// are verified (the destination **** 1234 among them), three API keys exist
// (2 live, 1 sandbox), seven webhook callbacks were received, and the ledger
// holds 33 succeeded transactions (deterministic mulberry32(20260901) seed).
// The KYC store is deliberately unseeded — a document is an unverified claim.

describe("getOnboardingStatus — seeded world", () => {
  it("derives 4 sections in page order and a full app-owned progress", async () => {
    const status = await getOnboardingStatus();
    expect(status.sections.map((s) => s.id)).toEqual(["profile", "compliance", "bank", "technical"]);
    expect(status.merchantName).toBe("Acme Corporation LLC");
    expect(status.trackedTotal).toBe(3);
    expect(status.trackedComplete).toBe(3);
    expect(status.progress).toBe(100);
    expect(status.allDone).toBe(true);
  });

  it("derives the business profile checks from the merchant profile", async () => {
    const status = await getOnboardingStatus();
    const profile = status.sections[0];
    expect(profile.badge).toBe("COMPLETED");
    expect(profile.href).toBe("/settings/merchant");
    expect(profile.checks.map((c) => c.detail)).toEqual([
      "Acme Corporation LLC · Acme",
      "123 Financial Plaza, Suite 400, New York, NY, 10004",
      "12-3456789",
    ]);
    expect(profile.checks.every((c) => c.done)).toBe(true);
  });

  it("shows the real destination account, not an invented one", async () => {
    const status = await getOnboardingStatus();
    const bank = status.sections[2];
    expect(bank.badge).toBe("COMPLETED");
    expect(bank.checks[0].detail).toBe("Bank Central Asia · **** 1234 (default)");
    expect(bank.checks[1].detail).toBe("2 of 3 accounts verified");
  });

  it("states the real API keys, webhook log and ledger facts", async () => {
    const status = await getOnboardingStatus();
    const tech = status.sections[3];
    expect(tech.badge).toBe("COMPLETED");
    expect(tech.checks.map((c) => c.detail)).toEqual([
      "3 keys on file · 2 live, 1 sandbox",
      "7 callback events received",
      "33 successful transactions settled",
    ]);
  });
});

describe("getOnboardingStatus — the compliance ruling", () => {
  it("never claims compliance COMPLETED and never counts it", async () => {
    const status = await getOnboardingStatus();
    const compliance = status.sections[1];
    // Unseeded KYC: basic info complete, document not submitted.
    expect(compliance.badge).toBe("ACTION REQUIRED");
    expect(compliance.tone).toBe("warning");
    expect(compliance.checks[0].done).toBe(true);
    expect(compliance.checks[1].detail).toBe("Not yet submitted");
    expect(compliance.counts).toBe(false);
    // The app-owned progress is full even though compliance has 1 of 2.
    expect(status.progress).toBe(100);
  });

  it("moves to REVIEW PENDING once the merchant submits — still not COMPLETED, still not counted", async () => {
    submitKycDocument({
      fileName: "acme-certificate-of-incorporation.pdf",
      sizeBytes: 1_200_000,
      docType: "incorporation",
      jurisdiction: "US",
    });
    const status = await getOnboardingStatus();
    const compliance = status.sections[1];
    expect(compliance.badge).toBe("REVIEW PENDING");
    expect(compliance.tone).toBe("pending");
    expect(compliance.checks[1].detail).toContain("acme-certificate-of-incorporation.pdf");
    expect(compliance.checks[1].detail).toContain("Certificate of Incorporation");
    expect(status.progress).toBe(100);
    expect(status.allDone).toBe(true);

    removeKycDocument();
    const again = await getOnboardingStatus();
    expect(again.sections[1].badge).toBe("ACTION REQUIRED");
  });
});

describe("getOnboardingStatus — live reads", () => {
  it("re-derives when the stores change", async () => {
    await createApiKey({ name: "Staging", environment: "TEST", scopes: ["read"] });
    const status = await getOnboardingStatus();
    expect(status.sections[3].checks[0].detail).toBe("4 keys on file · 2 live, 2 sandbox");
    expect(status.progress).toBe(100);
  });
});
