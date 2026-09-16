"use server";

import { revalidatePath } from "next/cache";
import { OrgContextError } from "@/server/services/org-context";
import { requireStrictOrgContext } from "@/server/services/session-org-context";
import { submitKycDocument, removeKycDocument, type KycDocumentType } from "@/server/data/kyc";
import { KYC_DOC_TYPES } from "@/lib/kyc-options";
import type { ActionState } from "./payouts";

export type { ActionState };

/**
 * Audit finding S-02 — `removeKycDocumentAction` destroyed a compliance record with no authorization.
 *
 * `submitKycDocumentAction` in this file was already gated behind `kyc.submit`; the removal path was not gated at all, and the store holds a single global KYC submission — so any caller who could reach the endpoint deleted the merchant's identity verification record. Destroying a compliance artefact is the one action in this domain that leaves no way to reconstruct what was verified.
 *
 * `kyc.submit` is the existing KYC write permission (OWNER and COMPLIANCE_ANALYST), so submitting and removing now demand the same privilege and no new permission is introduced. Worth a maintainer decision: a compliance record arguably should be immutable, corrected by superseding submission rather than deleted. If that is the intent, this action should be removed rather than gated.
 *
 * STILL OPEN (roadmap Phase 3): `data/kyc.ts` holds one global submission with no `organizationId`, so this narrows *who* may delete the record, not *whose* record. Tenant-scoping is Phase 3.
 */
async function requireKycRemove(): Promise<ActionState<never> | null> {
  try {
    await requireStrictOrgContext("kyc.submit");
    return null;
  } catch (e) {
    if (e instanceof OrgContextError) {
      return {
        status: "error",
        message: e.message.includes("Authentication")
          ? "Sign in to manage KYC documents."
          : "You don't have permission to remove KYC documents.",
      };
    }
    return { status: "error", message: e instanceof Error ? e.message : "Sign in to manage KYC documents." };
  }
}

function revalidateKyc() {
  revalidatePath("/[locale]/kyc", "page");
  revalidatePath("/kyc");
}

// Persist (or replace) the submitted KYC document. The file itself is not
// uploaded anywhere in this prototype store — the record (name, size, type,
// jurisdiction, timestamp) is the app's own fact (ADR-0019).
export async function submitKycDocumentAction(
  _prev: ActionState<{ fileName: string }> | undefined,
  formData: FormData
): Promise<ActionState<{ fileName: string }>> {
  const fileName = String(formData.get("fileName") ?? "").trim();
  const sizeBytes = Number(formData.get("sizeBytes") ?? 0);
  const docType = String(formData.get("docType") ?? "");
  const jurisdiction = String(formData.get("jurisdiction") ?? "").trim();

  if (!fileName || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { status: "error", message: "Attach a document first." };
  }
  if (!(KYC_DOC_TYPES.map((t) => t.value) as string[]).includes(docType)) {
    return { status: "error", message: "Pick a document type." };
  }
  if (jurisdiction.length < 2) {
    return { status: "error", message: "Enter the issuing jurisdiction." };
  }

  // Org-context authz: the acting org + role come from the session membership.
  let organizationId: string | undefined;
  try {
    const { requireOrgContext } = await import("@/server/services/session-org-context");
    const ctx = await requireOrgContext("kyc.submit");
    organizationId = ctx.organizationId;
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Not authorized to submit KYC." };
  }

  const submission = submitKycDocument({
    fileName,
    sizeBytes,
    docType: docType as KycDocumentType,
    jurisdiction,
  });

  // Rekomendasi #6: hand the submission off to the provider for verification when
  // a TEST connection resolves. The review outcome is surfaced via webhook.
  let note = "Submitted for review.";
  try {
    const { verifyKycProvider } = await import("@/server/platform/platform-service");
    const verification = await verifyKycProvider(organizationId);
    note =
      verification.state === "SUBMITTED"
        ? "Submitted for review. Connect a provider to verify KYC."
        : `Submitted for provider review (${verification.provider}) — in progress.`;
  } catch {
    // No provider connection — keep the in-app submission.
  }

  revalidateKyc();
  return {
    status: "success",
    message: `${submission.fileName} ${note}`,
    data: { fileName: submission.fileName },
  };
}

export async function removeKycDocumentAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const denied = await requireKycRemove();
  if (denied) return denied;

  const removed = removeKycDocument();
  if (!removed) return { status: "error", message: "There is no submitted document to remove." };
  revalidateKyc();
  return { status: "success", message: "Submission removed — you can start over." };
}
