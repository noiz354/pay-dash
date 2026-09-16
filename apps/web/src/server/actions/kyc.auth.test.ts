// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hasPermission } from "@/domain/organization/roles";
import { KYC_DOC_TYPES } from "@/lib/kyc-options";
import { OrgContextError } from "@/server/services/org-context";
import { getKycSubmission, submitKycDocument } from "@/server/data/kyc";
import { removeKycDocumentAction } from "./kyc";

/**
 * Audit finding S-02 — `removeKycDocumentAction` destroyed a compliance record
 * with no authorization.
 *
 * `submitKycDocumentAction` in this file was already gated behind `kyc.submit`;
 * the removal path was not gated at all. `removeKycDocument()` clears the single
 * global submission, so any caller who could reach the endpoint deleted the
 * merchant's identity-verification record. Destroying a compliance artefact is
 * the one action in this domain that leaves no way to reconstruct what was
 * verified — unlike a ruleset or a blocklist entry, there is no prior state to
 * fall back to.
 *
 * Gated behind the existing `kyc.submit`, so submitting and removing now demand
 * the same privilege and no new permission is introduced.
 *
 * Flagged for a maintainer decision, not settled here: a compliance record
 * arguably should be immutable, corrected by superseding submission rather than
 * deleted. If that is the intent, this action should be removed outright rather
 * than gated.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireStrict = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/session-org-context", () => ({
  requireStrictOrgContext: requireStrict,
}));

function asRole(roles: string[]) {
  requireStrict.mockResolvedValue({
    organizationId: "org_alpha",
    roles,
    userId: "user_caller",
    isDemoFallback: false,
  });
}

function signedOut() {
  requireStrict.mockRejectedValue(
    new OrgContextError("FORBIDDEN", "Authentication required — please sign in."),
  );
}

function lackingPermission() {
  requireStrict.mockRejectedValue(
    new OrgContextError("FORBIDDEN", "Actor is not authorized for kyc.submit in org_alpha"),
  );
}

function resetStore() {
  (globalThis as unknown as { __kineticKycStore?: unknown }).__kineticKycStore = undefined;
}

function seedSubmission() {
  submitKycDocument({
    fileName: "deed-of-establishment.pdf",
    sizeBytes: 248_113,
    docType: KYC_DOC_TYPES[0].value,
    jurisdiction: "ID",
  });
}

const emptyForm = () => new FormData();

beforeEach(() => {
  resetStore();
  requireStrict.mockReset();
  asRole(["OWNER"]);
  seedSubmission();
});

describe("S-02 — removing a KYC document demands kyc.submit", () => {
  it("authorizes kyc.submit", async () => {
    await removeKycDocumentAction(undefined, emptyForm());
    expect(requireStrict).toHaveBeenCalledWith("kyc.submit");
  });

  it("is held by the compliance role and not by support", () => {
    expect(hasPermission("COMPLIANCE_ANALYST", "kyc.submit")).toBe(true);
    expect(hasPermission("OWNER", "kyc.submit")).toBe(true);
    expect(hasPermission("SUPPORT", "kyc.submit")).toBe(false);
  });
});

describe("S-02 — a signed-out caller cannot destroy the verification record", () => {
  it("refuses and leaves the submission intact", async () => {
    const before = getKycSubmission();
    expect(before).not.toBeNull();
    signedOut();

    const state = await removeKycDocumentAction(undefined, emptyForm());

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/Sign in to manage KYC documents/i);
    expect(getKycSubmission()).toEqual(before);
  });
});

describe("S-02 — a caller without kyc.submit cannot destroy the verification record", () => {
  it("refuses and leaves the submission intact", async () => {
    const before = getKycSubmission();
    lackingPermission();

    const state = await removeKycDocumentAction(undefined, emptyForm());

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/don't have permission to remove KYC documents/i);
    expect(getKycSubmission()).toEqual(before);
  });
});

describe("the denials above are attributable to the guard, not to an empty store", () => {
  it("an authorized caller really does clear the submission", async () => {
    expect(getKycSubmission()).not.toBeNull();
    asRole(["COMPLIANCE_ANALYST"]);

    const state = await removeKycDocumentAction(undefined, emptyForm());

    expect(state.status).toBe("success");
    expect(getKycSubmission()).toBeNull();
  });
});
