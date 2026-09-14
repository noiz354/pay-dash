"use server";

import { revalidatePath } from "next/cache";
import { submitKycDocument, removeKycDocument, type KycDocumentType } from "@/server/data/kyc";
import { KYC_DOC_TYPES } from "@/lib/kyc-options";
import {
  identityAccessDeniedState,
  requireIdentityOrganizationContext,
} from "@/server/services/identity-organization-context";
import type { ActionState } from "./payouts";

export type { ActionState };

/**
 * Wave 7F — the KYC action seam.
 *
 * Two defects closed here:
 *
 *  1. `submitKycDocumentAction` resolved an org context for the *provider* call
 *     and then **dropped it**, storing the document in a process-wide slot — the
 *     same shape 7D found in `createSubscriptionAction`. One merchant's
 *     compliance document became every merchant's. The resolved context now
 *     reaches the DAL.
 *  2. `removeKycDocumentAction` had **no authorization at all**: any caller who
 *     could POST the form could destroy a merchant's compliance record. It now
 *     resolves the tenant and asserts `kyc.submit` first, and — because the
 *     store is one slot per tenant — it can only ever clear the caller's own.
 *
 * These rows are the highest-confidentiality data in the slice (a file name, a
 * jurisdiction and a time about a legal entity), so validation runs first (a
 * missing attachment is a field error, not an auth error) and the tenant is
 * resolved before anything is written.
 */

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
  let access;
  try {
    access = await requireIdentityOrganizationContext("kyc.submit");
  } catch (error) {
    return identityAccessDeniedState(error) as ActionState<{ fileName: string }>;
  }
  const organizationId = access.context.organizationId;

  // The resolved tenant reaches the store: this document belongs to *this*
  // merchant, and no other tenant can read or replace it.
  const submission = submitKycDocument(access.context, {
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
  void formData;
  let access;
  try {
    access = await requireIdentityOrganizationContext("kyc.submit");
  } catch (error) {
    return identityAccessDeniedState(error);
  }

  // One slot per tenant: clearing can only ever clear the caller's own record,
  // and `false` means "you had nothing submitted" — never "someone else's
  // document is safe".
  const removed = removeKycDocument(access.context);
  if (!removed) return { status: "error", message: "There is no submitted document to remove." };
  revalidateKyc();
  return { status: "success", message: "Submission removed — you can start over." };
}
