"use server";

import { revalidatePath } from "next/cache";
import { submitKycDocument, removeKycDocument, type KycDocumentType } from "@/server/data/kyc";
import { KYC_DOC_TYPES } from "@/lib/kyc-options";
import type { ActionState } from "./payouts";

export type { ActionState };

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
  const removed = removeKycDocument();
  if (!removed) return { status: "error", message: "There is no submitted document to remove." };
  revalidateKyc();
  return { status: "success", message: "Submission removed — you can start over." };
}
