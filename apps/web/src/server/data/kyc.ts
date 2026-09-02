import "server-only";
import { getMerchantProfile } from "./settings";

// KYC submission store (ADR-0019). The app can own exactly one KYC fact:
// what the merchant submitted through it, and when. The review OUTCOME lives
// with the compliance team — KYC is not in the v7 node SDK product list
// (INTEGRATION.md:93/:323), so no page in this app may claim an
// approved/rejected state. The prototype's hard-coded progress rail and the
// invented "acme_corp_incorporation_2023.pdf" attachment are gone; step 1 is
// derived from the merchant profile instead.
//
// Deliberately unseeded: a compliance document is an unverified claim about
// the merchant — unlike ledger rows, the app should not fabricate one.

export type KycDocumentType = "incorporation" | "articles" | "license" | "tax";

export type KycSubmission = {
  fileName: string;
  sizeBytes: number;
  docType: KycDocumentType;
  jurisdiction: string;
  submittedAt: string;
};

type Store = { submission: KycSubmission | null };
const g = globalThis as unknown as { __kineticKycStore?: Store };
function store(): Store {
  if (!g.__kineticKycStore) g.__kineticKycStore = { submission: null };
  return g.__kineticKycStore;
}

export function getKycSubmission(): KycSubmission | null {
  const s = store().submission;
  return s ? { ...s } : null;
}

/** Persist (or replace) the submitted document — the app's own fact. */
export function submitKycDocument(input: {
  fileName: string;
  sizeBytes: number;
  docType: KycDocumentType;
  jurisdiction: string;
  submittedAt?: string;
}): KycSubmission {
  const submission: KycSubmission = {
    fileName: input.fileName,
    sizeBytes: input.sizeBytes,
    docType: input.docType,
    jurisdiction: input.jurisdiction,
    submittedAt: input.submittedAt ?? new Date().toISOString(),
  };
  store().submission = submission;
  return { ...submission };
}

/** Clear the submission (the merchant can start over). */
export function removeKycDocument(): boolean {
  if (!store().submission) return false;
  store().submission = null;
  return true;
}

export type KycProfileField = {
  key: string;
  label: string;
  value: string | null;
  present: boolean;
};

export type KycProfileCompleteness = {
  complete: boolean;
  fields: KycProfileField[];
};

// Step 1 — "Basic Info" — is real: the merchant profile the app persists at
// /settings/merchant. Missing fields are reported, not faked complete.
export async function profileKycCompleteness(): Promise<KycProfileCompleteness> {
  const profile = await getMerchantProfile();
  const pick = (value: string | undefined, label: string, key: string): KycProfileField => ({
    key,
    label,
    value: value && value.trim() ? value.trim() : null,
    present: Boolean(value && value.trim()),
  });

  const fields: KycProfileField[] = [
    pick(profile.dba || profile.legalName, "Business name", "name"),
    pick(profile.address, "Registered address", "address"),
    pick(profile.taxId, "Tax ID", "taxId"),
  ];
  return { complete: fields.every((f) => f.present), fields };
}
